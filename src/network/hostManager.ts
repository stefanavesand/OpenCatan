import type { DevelopmentCardType } from '@/types/cards';
import { applyEconomy, createDeck, isEconomyAction, type RuleContext } from '@/game/engine/base/economy';
import { applyTurn, isTurnAction } from '@/game/engine/base/turn';
import { createBasePorts } from '@/game/engine/base/board';
import type { GameAction, GameSettings } from '@/types/game';
import { createPlayer } from '@/types/player';
import { store } from '@/game/state/store';
import { startGame, setSetupState } from '@/game/state/slices/gameSlice';
import { setTiles, setPorts, resetBoard } from '@/game/state/slices/boardSlice';
import { setPlayers, setTurnOrder } from '@/game/state/slices/playersSlice';
import { validateAction, processActionAsHost } from './host';
import { generateBeginnerBoard } from '@/utils/boardGenerator';
import { HostSession } from '@/session/hostSession';
import { projectView } from '@/session/projectView';
import type { Command, SessionView } from '@/session/protocol';
import type { SessionTransport } from '@/session/transport';
import { sessionTransport } from './sessionTransport';

export class HostManager {
  private session: HostSession | null = null;
  private unsubscribe?: () => void;
  private transport: SessionTransport;
  private deck: DevelopmentCardType[] = [];
  private services: RuleContext & { randomInt: (max: number) => number };
  constructor(transport: SessionTransport, services?: RuleContext & { randomInt: (max: number) => number }) {
    this.transport = transport;
    this.services = services ?? { id: () => crypto.randomUUID(), now: () => Date.now(), randomInt: max => {
      const limit = Math.floor(2 ** 32 / max) * max;
      const bytes = new Uint32Array(1);
      do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
      return bytes[0] % max;
    } };
  }

  startGame(gameId: string, turnOrder: string[]): void {
    if (this.session?.gameId === gameId) return;
    this.stopHost();
    const { lobby } = store.getState();
    const players = lobby.players.map(p => createPlayer(p.id, p.name, p.color!, p.id === lobby.localPlayerId));
    const settings: GameSettings = { mode: lobby.settings.mode, playerCount: players.length,
      victoryPoints: lobby.settings.victoryPoints as GameSettings["victoryPoints"], turnTimer: lobby.settings.turnTimer as GameSettings["turnTimer"],
      discardLimit: lobby.settings.discardLimit as GameSettings["discardLimit"], map: lobby.settings.mapType,
      friendlyRobber: lobby.settings.friendlyRobber, hideBankCards: false };
    store.dispatch(resetBoard());
    store.dispatch(startGame({ settings, firstPlayerId: turnOrder[0] }));
    store.dispatch(setTiles(generateBeginnerBoard().map(t => ({ ...t, hasPirate: false, isFog: false }))));
    store.dispatch(setPlayers(players));
    store.dispatch(setTurnOrder(turnOrder));
    store.dispatch(setSetupState({ currentPlacementIndex: 0, lastPlacedSettlement: null,
      placementsComplete: false, playerPlacements: Object.fromEntries(players.map(p => [p.id,
        { settlement1: null, road1: null, settlement2: null, road2: null }])) }));
    store.dispatch(setPorts(createBasePorts(this.viewState())));
    this.deck = createDeck(this.services.randomInt);
    this.session = new HostSession(gameId);
    this.unsubscribe = this.transport.subscribe(message => {
      if (message.type === 'SESSION_COMMAND') this.handleCommand(message.command);
      if (message.type === 'SESSION_REQUEST' && message.gameId === this.session?.gameId) this.sendView(message.playerId);
    });
    this.broadcastState();
  }

  handleAction(playerId: string, action: GameAction): { success: boolean; error?: string } {
    if (!this.session) return { success: false, error: 'Host session not initialized' };
    return this.handleCommand({ protocolVersion: 1, gameId: this.session.gameId,
      commandId: this.services.id(), playerId, expectedRevision: this.session.revision, action });
  }

  handleCommand(command: Command): { success: boolean; error?: string } {
    if (!this.session) return { success: false, error: 'Host session not initialized' };
    const receipt = this.session.execute(command, () => {
      const state = store.getState();
      if (!state.players.players.some(p => p.id === command.playerId)) return { success: false, error: 'Unknown player' };
      const current = this.viewState();
      if (isEconomyAction(command.action, current)) {
        const result = applyEconomy(current, this.deck, command.action, command.playerId, this.services);
        if (result.success) {
          this.deck = result.deck;
          store.dispatch({ type: 'session/applyView', payload: result.state });
        }
        return { success: result.success, error: 'error' in result ? result.error : undefined };
      }
      if (isTurnAction(command.action)) {
        const result = applyTurn(current, command.action, command.playerId, this.services.randomInt);
        if (result.success) store.dispatch({ type: 'session/applyView', payload: result.state });
        return { success: result.success, error: 'error' in result ? result.error : undefined };
      }
      if (!state.game.phase.startsWith('setup-') || !['BUILD_SETTLEMENT', 'BUILD_ROAD'].includes(command.action.type)) {
        return { success: false, error: 'This action is not available in the base-game preview; use bank trading' };
      }
      const action = { ...command.action, playerId: command.playerId, timestamp: this.services.now() } as unknown as import("./messages").GameAction;
      const validation = validateAction(action, state);
      if (!validation.isValid) return { success: false, error: validation.error };
      return processActionAsHost(action, state, store.dispatch);
    });
    this.transport.sendTo(this.session.gameId, command.playerId, { kind: 'receipt', receipt });
    this.broadcastState();
    return receipt;
  }

  private viewState(): SessionView {
    const { game, board, players, log } = store.getState();
    return { game, board, players, log };
  }
  private sendView(recipientId: string): void {
    if (!this.session || recipientId === store.getState().lobby.localPlayerId) return;
    if (!store.getState().players.players.some(p => p.id === recipientId)) return;
    this.transport.sendTo(this.session.gameId, recipientId, { kind: 'view', protocolVersion: 1,
      gameId: this.session.gameId, revision: this.session.revision,
      view: projectView(this.viewState(), recipientId) });
  }
  broadcastState(): void {
    for (const player of store.getState().players.players) this.sendView(player.id);
  }
  stopHost(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.session = null; this.deck = []; }
  get isHost(): boolean { return this.session !== null; }
  get revision(): number { return this.session?.revision ?? -1; }

}
export const hostManager = new HostManager(sessionTransport);
export default hostManager;
