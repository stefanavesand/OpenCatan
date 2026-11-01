import type { GameAction } from '@/types/game';
import { store } from '@/game/state/store';
import { setErrorMessage } from '@/game/state/slices/lobbySlice';
import { sessionTransport } from './sessionTransport';
import type { SessionTransport } from '@/session/transport';
import type { Command, Receipt, SessionView } from '@/session/protocol';

interface PendingAction {
  command: Command;
  timer?: ReturnType<typeof setTimeout>;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}
export class PeerManager {
  private gameId = '';
  private currentSequence = -1;
  private pending = new Map<string, PendingAction>();
  private lastView: SessionView | null = null;
  private transport: SessionTransport;
  constructor(transport: SessionTransport) {
    this.transport = transport;
    transport.subscribe(message => {
      if (message.type !== 'SESSION_MESSAGE' || message.gameId !== this.gameId) return;
      const payload = message.payload;
      if (payload.kind === 'receipt') this.handleReceipt(payload.receipt);
      else if (payload.protocolVersion === 1 && payload.gameId === this.gameId && payload.revision > this.currentSequence) {
        this.currentSequence = payload.revision;
        this.lastView = payload.view;
        store.dispatch({ type: 'session/applyView', payload: payload.view });
      }
    });
  }
  begin(gameId: string): void {
    if (this.gameId !== gameId) {
      this.clearPendingActions();
      this.gameId = gameId;
      this.currentSequence = -1;
      this.lastView = null;
    }
    this.requestSync();
  }
  sendAction(action: GameAction): void { this.sendActionWithCallbacks(action); }
  sendActionWithCallbacks(action: GameAction, onSuccess?: () => void, onError?: (error: string) => void): void {
    if (!this.gameId || this.currentSequence < 0) { onError?.('Waiting for host state'); return; }
    const command: Command = { protocolVersion: 1, gameId: this.gameId, commandId: crypto.randomUUID(),
      playerId: store.getState().lobby.localPlayerId ?? '', expectedRevision: this.currentSequence, action };
    this.pending.set(command.commandId, { command, onSuccess, onError });
    this.transmit(command.commandId);
  }
  private transmit(commandId: string): void {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    try { this.transport.sendCommand(pending.command); } catch { /* Retry the same ID after reconnect. */ }
    // Retry the exact envelope; the host must return the original receipt.
    pending.timer = setTimeout(() => this.transmit(commandId), 3000);
  }
  private handleReceipt(receipt: Receipt): void {
    if (receipt.protocolVersion !== 1 || receipt.gameId !== this.gameId) return;
    const pending = this.pending.get(receipt.commandId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(receipt.commandId);
    if (receipt.success) { store.dispatch(setErrorMessage(null)); pending.onSuccess?.(); }
    else {
      pending.onError?.(receipt.error ?? 'Action rejected');
      store.dispatch(setErrorMessage(receipt.error ?? 'Action rejected'));
    }
    this.requestSync();
  }
  requestSync(): void { if (this.gameId) this.transport.requestView(this.gameId); }
  clearPendingActions(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }
  get pendingActionCount(): number { return this.pending.size; }
  get isSynchronized(): boolean { return this.pending.size === 0; }
  get lastGameState(): SessionView | null { return this.lastView; }
}
export const peerManager = new PeerManager(sessionTransport);
export default peerManager;
