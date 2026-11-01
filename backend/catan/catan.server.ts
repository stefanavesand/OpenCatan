/* eslint-disable @typescript-eslint/no-explicit-any */
// Server-only Catan game service. NEVER import this from client-reachable
// modules — route handlers load it with `await import("@/lib/catan/catan.server")`.
// The authoritative state (full snapshot incl. secret deck/hands) lives in
// public.catan_rooms, which is revoked from anon/authenticated; only this
// service (via the service role) and the catan_commit/catan_join_room
// SECURITY DEFINER functions touch it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  newCatan,
  applyCatan,
  catanView,
  eligibleActors,
  botDecision,
  CatanRuleError,
} from "./catan-runtime.js";

const db = supabaseAdmin as unknown as SupabaseClient<any>;

export const CATAN_LIMITS = {
  createPerHour: 5,
  joinPerMinute: 20,
  viewPerMinute: 120,
  commandPerMinute: 60,
  activeRoomsPerPrincipal: 10,
  maxBodyBytes: 8192,
  maxNameLength: 30,
  sessionExpiryMs: 7 * 24 * 60 * 60 * 1000,
  botBudgetPerInvocation: 24,
} as const;

// Engine context: unbiased crypto entropy for dice/deck, wall clock, UUIDs.
const engineContext = {
  randomInt(upperExclusive: number): number {
    if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
      throw new Error("Invalid random bound");
    }
    const RANGE = 0x100000000; // 2^32
    const limit = RANGE - (RANGE % upperExclusive); // rejection sampling: no modulo bias
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      const value = buf[0];
      if (value === undefined) continue;
      if (value < limit) return value % upperExclusive;
    }
  },
  now: () => Date.now(),
  id: () => crypto.randomUUID(),
};

export interface CatanResponse {
  status: number;
  body: Record<string, any>;
  headers?: Record<string, string>;
}

/* ---------- helpers ---------- */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, CATAN_LIMITS.maxNameLength);
  return trimmed.length ? trimmed : fallback;
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Deterministic command id for bot steps: same room+revision+actor always
// yields the same id, so a crash/retry never creates a new random command.
async function derivedUuid(seed: string): Promise<string> {
  const h = await sha256hex(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[parseInt(h.charAt(16), 16) & 3] ?? "8"}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function loadRoom(roomId: string): Promise<any | null> {
  const { data, error } = await db.from("catan_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw new Error(`room load failed: ${error.message}`);
  return data;
}

const seatOf = (room: any, userId: string): "p1" | "p2" | null =>
  room.host_user_id === userId ? "p1" : room.guest_user_id === userId ? "p2" : null;

const isExpired = (room: any): boolean =>
  Date.now() - Date.parse(room.last_touched_at) > CATAN_LIMITS.sessionExpiryMs;

function membersOf(room: any): any[] {
  if (room.snapshot?.seats) return room.snapshot.seats;
  return [
    { id: "p1", name: room.host_name, kind: "human", level: "standard" },
    { id: "p3", name: "Bot", kind: "bot", level: room.bot_level },
  ];
}

// Player projection; never expose the raw snapshot. Returns null if the
// engine cannot build a view (defensive — members always can).
function viewSafe(room: any, seat: string): any | null {
  if (!room.snapshot) return null;
  try {
    return catanView(room.snapshot, seat);
  } catch (e) {
    console.error("[catan] view projection failed", e);
    return null;
  }
}

const errBody = (code: string, message: string, extra: Record<string, any> = {}) => ({
  ok: false as const,
  apiVersion: 1 as const,
  error: { code, message },
  ...extra,
});

const okBody = (room: any, seat: "p1" | "p2", view: any, receipt?: any) => ({
  ok: true as const,
  apiVersion: 1 as const,
  roomId: room.id as string,
  status: room.status as string,
  you: seat,
  revision: room.revision as number,
  members: membersOf(room),
  view,
  ...(receipt ? { receipt } : {}),
});

const err = (status: number, code: string, message: string, extra?: Record<string, any>): CatanResponse => ({
  status,
  body: errBody(code, message, extra),
});

const rateLimited = (retryAfter: number, message: string): CatanResponse => ({
  status: 429,
  body: errBody("rate_limited", message),
  headers: { "Retry-After": String(retryAfter) },
});

// Pilot quotas. Bot steps are never recorded as human command events.
async function checkQuota(
  principal: string,
  kind: "create" | "join" | "view" | "command",
  limit: number,
  windowSeconds: number,
): Promise<{ limited: boolean; retryAfter: number }> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await db
    .from("catan_rate_events")
    .select("*", { count: "exact", head: true })
    .eq("principal", principal)
    .eq("kind", kind)
    .gte("created_at", since);
  if (error) throw new Error(`quota check failed: ${error.message}`);
  if ((count ?? 0) < limit) {
    const { error: insErr } = await db.from("catan_rate_events").insert({ principal, kind });
    if (insErr) throw new Error(`quota record failed: ${insErr.message}`);
    return { limited: false, retryAfter: 0 };
  }
  const { data: oldest } = await db
    .from("catan_rate_events")
    .select("created_at")
    .eq("principal", principal)
    .eq("kind", kind)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  const retryAfter = oldest?.length
    ? Math.max(1, Math.ceil((Date.parse(oldest[0]?.created_at) + windowSeconds * 1000 - Date.now()) / 1000))
    : windowSeconds;
  return { limited: true, retryAfter };
}

// Service-only atomic commit/CAS. The SQL function locks the room row,
// rechecks dedup + payload hash + expected revision, and persists
// revision+snapshot+receipt in one transaction before we acknowledge.
async function commit(
  roomId: string,
  seat: string,
  commandId: string,
  payloadHash: string,
  expectedRevision: number,
  newSnapshot: any | null,
  newStatus: string | null,
  accepted: boolean,
  receiptResult: any,
  principal: string | null = null,
): Promise<any> {
  const { data, error } = await db.rpc("catan_commit_verified", {
    p_principal: principal,
    p_room_id: roomId,
    p_seat: seat,
    p_command_id: commandId,
    p_payload_hash: payloadHash,
    p_expected_revision: expectedRevision,
    p_new_snapshot: newSnapshot,
    p_new_status: newStatus,
    p_accepted: accepted,
    p_receipt_result: receiptResult,
  });
  if (error) throw new Error(`catan_commit_verified failed: ${error.message}`);
  return data;
}

/* ---------- bot scheduler ---------- */

// Drains eligible p3 decisions on the managed authority. Runs after join,
// human commands and view polls, so no specific human browser needs to stay
// connected. Bounded per invocation; a later view poll resumes after a crash
// or budget boundary. Never takes over human seats, never loops forever.
async function drainBot(roomId: string): Promise<void> {
  for (let step = 0; step < CATAN_LIMITS.botBudgetPerInvocation; step++) {
    const room = await loadRoom(roomId);
    if (!room || room.status !== "playing" || !room.snapshot) return;
    let eligible: string[];
    try {
      eligible = eligibleActors(room.snapshot);
    } catch (e) {
      console.error("[catan] eligibleActors failed", e);
      return;
    }
    if (!eligible.includes("p3")) return;

    let action: any;
    try {
      // The bot only ever sees its own player projection, never the raw snapshot.
      action = botDecision(catanView(room.snapshot, "p3"), room.bot_level);
    } catch (e) {
      console.error("[catan] botDecision failed", e);
      return;
    }

    let next: any;
    try {
      next = applyCatan(room.snapshot, "p3", action, engineContext);
    } catch (e) {
      console.error("[catan] bot action rejected by engine", e);
      return;
    }

    const commandId = await derivedUuid(`bot:${roomId}:${room.revision}:p3`);
    const payloadHash = await sha256hex(
      canonical({ op: "bot", roomId, expectedRevision: room.revision, action }),
    );
    const res = await commit(
      roomId,
      "p3",
      commandId,
      payloadHash,
      room.revision,
      next,
      next.state.game.phase === "ended" ? "ended" : "playing",
      true,
      { op: "bot", action: action.type },
    );
    if (!res?.ok && res?.code === "revision_conflict") continue; // lost a race; re-evaluate
    if (!res?.ok) return;
  }
}

/* ---------- ops ---------- */

async function lobbyReply(userId: string, res: any): Promise<CatanResponse> {
  if (!res?.ok) {
    if (res?.code === "active_limit") return rateLimited(60, "Too many active rooms (pilot limit: 10 per player)");
    const codes: Record<string, [number, string]> = {
      command_id_conflict: [409, "commandId was already used with a different payload"],
      session_expired: [410, "This room expired after 7 days without activity"],
      room_full: [409, "The room already has two human players"],
      cannot_join_own_room: [409, "You already host this room"],
    };
    const code = res?.code ?? "room_not_found";
    const [status, message] = codes[code] ?? [404, "No such room, or you are not a member"];
    return err(status, code, message);
  }
  const seat = seatOf(res.room, userId);
  if (!seat) return err(404, "room_not_found", "No such room, or you are not a member");
  await drainBot(res.room.id);
  const fresh = await loadRoom(res.room.id);
  if (!fresh || seatOf(fresh, userId) !== seat) return err(404, "room_not_found", "No such room");
  return { status: 200, body: okBody(fresh, seat, viewSafe(fresh, seat), res.receipt) };
}

async function rpc(name: string, args: Record<string, any>): Promise<any> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}

async function opCreate(userId: string, body: any): Promise<CatanResponse> {
  if (!isUuid(body.commandId)) return err(400, "bad_request", "commandId (UUID) is required");
  const name = cleanName(body.name, "Player 1");
  const botLevel = body.botLevel === "easy" ? "easy" : "standard";
  const payloadHash = await sha256hex(canonical({ op: "create", commandId: body.commandId, name, botLevel }));
  const args = { p_principal: userId, p_command_id: body.commandId, p_payload_hash: payloadHash };
  const prior = await rpc("catan_lobby_retry", args);
  if (prior.found) return lobbyReply(userId, prior);
  const quota = await checkQuota(userId, "create", CATAN_LIMITS.createPerHour, 3600);
  if (quota.limited) return rateLimited(quota.retryAfter, "Too many rooms created (pilot limit: 5 per hour)");
  return lobbyReply(userId, await rpc("catan_create_atomic", { ...args, p_name: name, p_bot_level: botLevel }));
}

async function opJoin(userId: string, body: any): Promise<CatanResponse> {
  if (!isUuid(body.roomId) || !isUuid(body.commandId)) return err(400, "bad_request", "roomId and commandId (UUIDs) are required");
  const name = cleanName(body.name, "Player 2");
  const payloadHash = await sha256hex(canonical({ op: "join", commandId: body.commandId, roomId: body.roomId, name }));
  const args = { p_principal: userId, p_command_id: body.commandId, p_payload_hash: payloadHash };
  const prior = await rpc("catan_lobby_retry", args);
  if (prior.found) return lobbyReply(userId, prior);
  const quota = await checkQuota(userId, "join", CATAN_LIMITS.joinPerMinute, 60);
  if (quota.limited) return rateLimited(quota.retryAfter, "Too many join attempts (pilot limit: 20 per minute)");
  const room = await loadRoom(body.roomId);
  if (!room) return err(404, "room_not_found", "No such room");
  const snapshot = room.guest_user_id ? null : newCatan(room.id, [
    { id: "p1", name: room.host_name, kind: "human", level: "standard" },
    { id: "p2", name, kind: "human", level: "standard" },
    { id: "p3", name: "Bot", kind: "bot", level: room.bot_level },
  ], engineContext);
  return lobbyReply(userId, await rpc("catan_join_atomic", { ...args, p_room_id: room.id, p_name: name, p_snapshot: snapshot }));
}

async function opView(userId: string, body: any): Promise<CatanResponse> {
  if (!isUuid(body.roomId)) return err(400, "bad_request", "roomId (UUID) is required");
  const quota = await checkQuota(userId, "view", CATAN_LIMITS.viewPerMinute, 60);
  if (quota.limited) return rateLimited(quota.retryAfter, "Too many views (pilot limit: 120 per minute)");
  const room = await loadRoom(body.roomId);
  const seat = room ? seatOf(room, userId) : null;
  if (!room || !seat) return err(404, "room_not_found", "No such room, or you are not a member");
  if (isExpired(room)) {
    return err(410, "session_expired", "This room expired after 7 days without activity");
  }
  await drainBot(room.id);
  const fresh = await loadRoom(room.id);
  return { status: 200, body: okBody(fresh, seat, viewSafe(fresh, seat)) };
}

async function opCommand(userId: string, body: any): Promise<CatanResponse> {
  const { roomId, commandId, expectedRevision, action } = body ?? {};
  if (
    !isUuid(roomId) ||
    !isUuid(commandId) ||
    !Number.isSafeInteger(expectedRevision) ||
    !action ||
    typeof action !== "object" ||
    typeof action.type !== "string"
  ) {
    return err(400, "bad_request", "roomId, commandId, expectedRevision and action {type,...} are required");
  }
  const quota = await checkQuota(userId, "command", CATAN_LIMITS.commandPerMinute, 60);
  if (quota.limited) return rateLimited(quota.retryAfter, "Too many commands (pilot limit: 60 per minute)");

  const room = await loadRoom(roomId);
  const seat = room ? seatOf(room, userId) : null;
  if (!room || !seat) return err(404, "room_not_found", "No such room, or you are not a member");
  if (isExpired(room)) {
    return err(410, "session_expired", "This room expired after 7 days without activity");
  }
  // (room, verified seat, commandId) binds to the canonical full payload.
  const payloadHash = await sha256hex(canonical({ op: "command", action, commandId, expectedRevision, roomId }));

  const prior = await rpc("catan_command_retry", {
    p_room_id: roomId, p_principal: userId, p_seat: seat,
    p_command_id: commandId, p_payload_hash: payloadHash,
  });
  if (prior.found) return commandReply(room, seat, roomId, prior);
  if (room.status === "waiting") return err(409, "not_started", "Waiting for the second human player");
  if (room.status === "ended") return err(409, "game_over", "The game has ended");

  let next: any | null = null;
  let ruleError: string | null = null;
  try {
    next = applyCatan(room.snapshot, seat, action, engineContext);
  } catch (e) {
    if (e instanceof CatanRuleError) {
      ruleError = (e as Error).message || "Invalid action";
    } else {
      console.error("[catan] engine failure on human command", e);
      ruleError = "Invalid action";
    }
  }

  const res = await commit(
    roomId,
    seat,
    commandId,
    payloadHash,
    expectedRevision,
    next,
    next && next.state.game.phase === "ended" ? "ended" : null,
    !ruleError,
    ruleError ? { op: "command", error: ruleError } : { op: "command", action: action.type },
    userId,
  );
  return commandReply(room, seat, roomId, res);
}

async function commandReply(room: any, seat: "p1" | "p2", roomId: string, res: any): Promise<CatanResponse> {

  const currentRoom = res?.room ?? room;

  if (!res?.ok) {
    if (res?.code === "command_id_conflict") {
      return err(409, "command_id_conflict", "commandId was already used with a different payload", {
        roomId,
        revision: currentRoom.revision,
        view: viewSafe(currentRoom, seat),
      });
    }
    if (res?.code === "revision_conflict") {
      return err(409, "revision_conflict", "The room has moved on; re-fetch the view and retry with a new commandId", {
        roomId,
        revision: currentRoom.revision,
        view: viewSafe(currentRoom, seat),
      });
    }
    if (res?.code === "session_expired") return err(410, "session_expired", "This room expired after 7 days without activity");
    if (res?.code === "game_over" || res?.code === "not_started") return err(409, res.code, res.code === "game_over" ? "The game has ended" : "Waiting for the second human player");
    return err(404, "room_not_found", "No such room");
  }

  // Stable domain rejections are persisted as receipts too; retrying the same
  // command returns the original rejection receipt with the CURRENT view.
  if (res.receipt && res.receipt.accepted === false) {
    const message = res.result?.error ?? "Invalid action";
    return {
      status: 422,
      body: {
        ...errBody("rule_rejected", message, {
          roomId,
          status: currentRoom.status,
          you: seat,
          revision: currentRoom.revision,
          view: viewSafe(currentRoom, seat),
        }),
        receipt: res.receipt,
      },
    };
  }

  await drainBot(roomId);
  const fresh = await loadRoom(roomId);
  return { status: 200, body: okBody(fresh, seat, viewSafe(fresh, seat), res.receipt) };
}

/* ---------- entry ---------- */

export async function handleCatanOp(userId: string, body: any): Promise<CatanResponse> {
  if (!body || typeof body !== "object" || body.apiVersion !== 1 || typeof body.op !== "string") {
    return err(400, "bad_request", "Expected {apiVersion:1, op:'create'|'join'|'view'|'command'}");
  }
  switch (body.op) {
    case "create":
      return opCreate(userId, body);
    case "join":
      return opJoin(userId, body);
    case "view":
      return opView(userId, body);
    case "command":
      return opCommand(userId, body);
    default:
      return err(400, "bad_request", `Unknown op '${String(body.op).slice(0, 32)}'`);
  }
}
