import type { GameAction } from '../types/game';
import type { GameSliceState } from '../game/state/slices/gameSlice';
import type { BoardSliceState } from '../game/state/slices/boardSlice';
import type { PlayersSliceState } from '../game/state/slices/playersSlice';
import type { LogSliceState } from '../game/state/slices/logSlice';

export const PROTOCOL_VERSION = 1;
// A client view, NOT a recovery snapshot. Only the host keeps complete state.
export interface SessionView {
  game: GameSliceState;
  board: BoardSliceState;
  players: PlayersSliceState;
  log: LogSliceState;
}
export interface Command {
  protocolVersion: 1;
  gameId: string;
  commandId: string;
  playerId: string;
  expectedRevision: number;
  action: GameAction;
}
export interface Receipt {
  protocolVersion: 1;
  gameId: string;
  commandId: string;
  revision: number;
  success: boolean;
  error?: string;
}
export type SessionPayload =
  | { kind: 'view'; protocolVersion: 1; gameId: string; revision: number; view: SessionView }
  | { kind: 'receipt'; receipt: Receipt };
export type SessionClientMessage =
  | { type: 'SESSION_COMMAND'; command: Command }
  | { type: 'SESSION_REQUEST'; gameId: string }
  | { type: 'SESSION_DELIVERY'; gameId: string; recipientId: string; payload: SessionPayload };
export type SessionServerMessage =
  | { type: 'SESSION_COMMAND'; command: Command }
  | { type: 'SESSION_REQUEST'; gameId: string; playerId: string }
  | { type: 'SESSION_MESSAGE'; gameId: string; payload: SessionPayload };

export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.protocolVersion === PROTOCOL_VERSION && typeof c.gameId === 'string'
    && typeof c.commandId === 'string' && c.commandId.length > 0 && c.commandId.length <= 100
    && typeof c.playerId === 'string' && Number.isSafeInteger(c.expectedRevision)
    && Number(c.expectedRevision) >= 0 && !!c.action && typeof c.action === 'object'
    && typeof (c.action as Record<string, unknown>).type === 'string';
}
