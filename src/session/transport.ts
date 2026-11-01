import type { Command, SessionPayload, SessionServerMessage } from './protocol';

export interface TransportCapabilities {
  ordered: boolean;
  delivery: 'connected-only';
  targetedDelivery: boolean;
  requiresInternet: boolean;
  discovery: 'room-code' | 'none';
  maxPayloadBytes: number | null;
}
export interface SessionTransport {
  readonly capabilities: TransportCapabilities;
  sendCommand(command: Command): void;
  sendTo(gameId: string, recipientId: string, payload: SessionPayload): void;
  requestView(gameId: string): void;
  subscribe(handler: (message: SessionServerMessage) => void): () => void;
}
