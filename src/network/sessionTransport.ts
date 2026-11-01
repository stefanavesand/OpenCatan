import { partyClient } from './partyClient';
import type { SessionTransport } from '../session/transport';
import type { SessionServerMessage } from '../session/protocol';

export const sessionTransport: SessionTransport = {
  capabilities: { ordered: true, delivery: 'connected-only', targetedDelivery: true,
    requiresInternet: true, discovery: 'room-code', maxPayloadBytes: null },
  sendCommand: command => partyClient.send({ type: 'SESSION_COMMAND', command }),
  sendTo: (gameId, recipientId, payload) => partyClient.send({ type: 'SESSION_DELIVERY', gameId, recipientId, payload }),
  requestView: gameId => partyClient.send({ type: 'SESSION_REQUEST', gameId }),
  subscribe(handler) {
    const subscriptions = (['SESSION_COMMAND', 'SESSION_REQUEST', 'SESSION_MESSAGE'] as const).map(type => {
      const listener = (message: SessionServerMessage) => handler(message);
      partyClient.on(type, listener);
      return () => partyClient.off(type, listener);
    });
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  },
};
