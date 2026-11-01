import { isCommand, PROTOCOL_VERSION, type Command, type Receipt } from './protocol';

/** One synchronous command at a time; all rule work completes before revision advances.
 * In-memory only in v1. No durable receipt or recovery guarantee is implied. */
export class HostSession {
  revision = 0;
  private receipts = new Map<string, { fingerprint: string; receipt: Receipt }>();
  readonly gameId: string;
  constructor(gameId: string) { this.gameId = gameId; }

  execute(command: Command, apply: () => { success: boolean; error?: string }): Receipt {
    const reject = (error: string): Receipt => ({ protocolVersion: PROTOCOL_VERSION,
      gameId: this.gameId, commandId: command?.commandId ?? '', revision: this.revision, success: false, error });
    if (!isCommand(command)) return reject('Invalid command or protocol version');
    if (command.gameId !== this.gameId) return reject('Wrong game');
    const key = `${command.playerId}:${command.commandId}`;
    const fingerprint = JSON.stringify(command);
    const cached = this.receipts.get(key);
    if (cached) return cached.fingerprint === fingerprint ? cached.receipt : reject('Command ID reused with different content');
    if (this.receipts.size >= 10000) return reject('Session command limit reached');
    let result: { success: boolean; error?: string };
    if (command.expectedRevision !== this.revision) result = { success: false, error: 'Stale revision; synchronize and try again' };
    else result = apply();
    if (result.success) this.revision++;
    const receipt: Receipt = { protocolVersion: PROTOCOL_VERSION, gameId: this.gameId,
      commandId: command.commandId, revision: this.revision, success: result.success,
      ...(result.error ? { error: result.error } : {}) };
    this.receipts.set(key, { fingerprint, receipt });
    return receipt;
  }
}
