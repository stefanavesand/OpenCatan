// External HTTP endpoint for the Catan backend (called by the external PWA).
// Lives under /api/public so published-site auth is bypassed; the handler
// itself verifies the Bearer JWT via auth.getUser before doing anything.
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_ORIGIN =
  /^https:\/\/stefanavesand\.github\.io$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Expose-Headers": "Retry-After",
    Vary: "Origin",
  };
}

function json(
  status: number,
  body: unknown,
  origin: string | null,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

const fail = (status: number, code: string, message: string) => ({
  ok: false as const,
  apiVersion: 1 as const,
  error: { code, message },
  ...(status >= 0 ? {} : {}),
});

export const Route = createFileRoute("/api/public/catan")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        try {
          const auth = request.headers.get("authorization") ?? "";
          if (!auth.startsWith("Bearer ")) {
            return json(401, fail(401, "unauthenticated", "Bearer token required"), origin);
          }
          const token = auth.slice(7).trim();

          const text = await request.text();
          if (new TextEncoder().encode(text).length > 8192) {
            return json(413, fail(413, "payload_too_large", "Body exceeds 8 KiB"), origin);
          }
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            return json(400, fail(400, "bad_request", "Invalid JSON body"), origin);
          }

          // Strict caller verification: the gateway does not verify JWTs for
          // this route, so we verify the token against the auth service here.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.auth.getUser(token);
          if (error || !data?.user) {
            return json(401, fail(401, "unauthenticated", "Invalid or expired token"), origin);
          }

          const svc = await import("@/lib/catan/catan.server");
          const result = await svc.handleCatanOp(data.user.id, body);
          return json(result.status, result.body, origin, result.headers);
        } catch (e) {
          // Never leak database/service errors to clients.
          console.error("[catan] internal error", e);
          return json(500, fail(500, "internal", "Internal error"), origin);
        }
      },
    },
  },
});
