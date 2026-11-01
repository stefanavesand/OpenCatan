import type { SessionView } from './protocol';

/** Allowlisted player data. Never ship credentials or another player's hand. */
export function projectView(state: SessionView, recipientId: string): SessionView {
  const game = { ...state.game };
  delete game.players;
  game.discardAmounts = recipientId in (game.discardAmounts ?? {})
    ? { [recipientId]: game.discardAmounts![recipientId] } : {};
  return {
    game,
    board: state.board,
    players: {
      turnOrder: state.players.turnOrder,
      players: state.players.players.map(p => {
        const own = p.id === recipientId;
        const publicPoints = state.board.buildings.filter(b => b.playerId === p.id)
          .reduce((total, b) => total + (b.type === 'city' ? 2 : 1), 0)
          + (game.longestRoad?.playerId === p.id ? 2 : 0)
          + (game.largestArmy?.playerId === p.id ? 2 : 0);
        return {
          id: p.id, name: p.name, color: p.color, isConnected: p.isConnected,
          isHost: p.isHost, isReady: p.isReady, sessionToken: '',
          resources: own ? p.resources : { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 },
          resourceCount: Object.values(p.resources).reduce((sum, count) => sum + count, 0),
          developmentCards: own ? p.developmentCards : [],
          devCardCount: p.developmentCards.filter(c => !c.isPlayed).length,
          hasPlayedDevCard: p.hasPlayedDevCard,
          devCardsBoughtThisTurn: own ? p.devCardsBoughtThisTurn : [],
          roadsRemaining: p.roadsRemaining, settlementsRemaining: p.settlementsRemaining,
          citiesRemaining: p.citiesRemaining, armySize: p.armySize,
          longestRoadLength: p.longestRoadLength, victoryPoints: publicPoints + (own ? p.developmentCards.filter(c => c.type === 'victoryPoint' && !c.isPlayed).length : 0),
          totalResourcesCollected: p.totalResourcesCollected, totalTradesMade: p.totalTradesMade,
          timesRobbed: p.timesRobbed, timesWasRobbed: p.timesWasRobbed,
        };
      }),
    },
    // Only public building messages are audited in this first slice. Other log types
    // stay on the host until their private/public projections are implemented.
    log: { ...state.log, log: state.log.log.filter(entry => entry.type === 'build' && entry.visibility === 'all')
      .map(entry => ({ ...entry, data: undefined })), chat: [] },
  };
}
