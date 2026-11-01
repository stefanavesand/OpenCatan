/**
 * TradeModal Component
 *
 * Full-screen modal for creating and managing trades.
 * Two tabs: "Player Trade" for trading with other players,
 * and "Bank Trade" for trading with the bank using port rates.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Modal } from './Modal';
import { ResourceSelector } from '../cards/ResourceSelector';
import { ResourceDisplay } from '../cards/ResourceDisplay';
import { PortIndicator, TradeRateSummary } from '../ui/PortIndicator';
import type { ResourceType, ResourceCounts, Player, PlayerColor, TradeOffer } from '../../types';
import styles from './TradeModal.module.css';

// Types
export type TradeTab = 'player' | 'bank';

export interface PlayerTradeOffer {
  offering: Partial<ResourceCounts>;
  requesting: Partial<ResourceCounts>;
  targetPlayerId: string | 'all';
}

export interface BankTradeParams {
  giveResource: ResourceType;
  giveAmount: number;
  receiveResource: ResourceType;
  receiveAmount: number;
}

export interface CounterOfferData {
  /** ID of the original offer being countered */
  originalOfferId: string;
  /** Player ID to send the counter-offer to */
  toPlayerId: string;
  /** Pre-filled offering resources (swapped from original request) */
  offering: Partial<ResourceCounts>;
  /** Pre-filled requesting resources (swapped from original offer) */
  requesting: Partial<ResourceCounts>;
}

export interface TradeModalProps {
  isOpen: boolean;
  bankOnly?: boolean;
  onClose: () => void;
  /** Current player's resources */
  myResources: ResourceCounts;
  /** Other players who can be traded with */
  players: Pick<Player, 'id' | 'name' | 'color' | 'isConnected'>[];
  /** Current player's trade rates for each resource */
  bankRates: Record<ResourceType, 2 | 3 | 4>;
  /** Bank's available resources */
  bankResources: ResourceCounts;
  /** Called when player trade is submitted */
  onPlayerTrade: (offer: PlayerTradeOffer) => void;
  /** Called when bank trade is submitted */
  onBankTrade: (params: BankTradeParams) => void;
  /** Called when trade is cancelled */
  onCancel: () => void;
  /** Active offers from current player */
  myActiveOffers?: TradeOffer[];
  /** Whether trading is allowed */
  canTrade?: boolean;
  /** Error message to display */
  error?: string;
  /** Counter-offer data for pre-filling the modal */
  counterOfferData?: CounterOfferData | null;
  /** Called when counter-offer is submitted */
  onCounterOffer?: (originalOfferId: string, offer: PlayerTradeOffer) => void;
}

const RESOURCES: ResourceType[] = ['brick', 'lumber', 'ore', 'grain', 'wool'];

const RESOURCE_LABELS: Record<ResourceType, string> = {
  brick: 'Brick',
  lumber: 'Lumber',
  ore: 'Ore',
  grain: 'Grain',
  wool: 'Wool',
};

const createEmptyResources = (): Partial<ResourceCounts> => ({});

/**
 * Get hex color for player color
 */
function getPlayerColorHex(color: PlayerColor): string {
  const colors: Record<PlayerColor, string> = {
    red: '#e53935',
    blue: '#1e88e5',
    orange: '#fb8c00',
    white: '#f5f5f5',
    green: '#43a047',
    purple: '#8e24aa',
    black: '#424242',
    bronze: '#a1887f',
    gold: '#ffd700',
    silver: '#b0bec5',
    pink: '#ec407a',
    mysticblue: '#4fc3f7',
  };
  return colors[color] || '#888888';
}

/**
 * Player Trade Tab Component
 */
interface PlayerTradeTabProps {
  myResources: ResourceCounts;
  players: Pick<Player, 'id' | 'name' | 'color' | 'isConnected'>[];
  onSubmit: (offer: PlayerTradeOffer) => void;
  canTrade: boolean;
  /** Initial offering values (for counter-offers) */
  initialOffering?: Partial<ResourceCounts>;
  /** Initial requesting values (for counter-offers) */
  initialRequesting?: Partial<ResourceCounts>;
  /** Initial target player ID (for counter-offers) */
  initialTargetPlayerId?: string | 'all';
  /** Whether this is a counter-offer */
  isCounterOffer?: boolean;
  /** Custom submit button label */
  submitLabel?: string;
}

const PlayerTradeTab: React.FC<PlayerTradeTabProps> = ({
  myResources,
  players,
  onSubmit,
  canTrade,
  initialOffering,
  initialRequesting,
  initialTargetPlayerId,
  isCounterOffer = false,
  submitLabel,
}) => {
  const [offering, setOffering] = useState<Partial<ResourceCounts>>(
    initialOffering || createEmptyResources()
  );
  const [requesting, setRequesting] = useState<Partial<ResourceCounts>>(
    initialRequesting || createEmptyResources()
  );
  const [targetPlayerId, setTargetPlayerId] = useState<string | 'all'>(
    initialTargetPlayerId || 'all'
  );

  // Reset state when initial values change (new counter-offer)
  useEffect(() => {
    if (initialOffering) {
      setOffering(initialOffering);
    }
  }, [initialOffering]);

  useEffect(() => {
    if (initialRequesting) {
      setRequesting(initialRequesting);
    }
  }, [initialRequesting]);

  useEffect(() => {
    if (initialTargetPlayerId) {
      setTargetPlayerId(initialTargetPlayerId);
    }
  }, [initialTargetPlayerId]);

  const connectedPlayers = useMemo(
    () => (players || []).filter(p => p.isConnected),
    [players]
  );

  const isValidTrade = useMemo(() => {
    const hasOffering = Object.values(offering).some(v => (v ?? 0) > 0);
    const hasRequesting = Object.values(requesting).some(v => (v ?? 0) > 0);
    return hasOffering && hasRequesting;
  }, [offering, requesting]);

  const handleSubmit = useCallback(() => {
    if (isValidTrade && canTrade) {
      onSubmit({
        offering,
        requesting,
        targetPlayerId,
      });
    }
  }, [isValidTrade, canTrade, offering, requesting, targetPlayerId, onSubmit]);

  return (
    <div className={styles.tabContent}>
      {/* Target Player Selection */}
      <div className={styles.targetSection}>
        <label className={styles.sectionLabel}>Trade with:</label>
        <div className={styles.targetOptions}>
          <button
            type="button"
            className={`${styles.targetButton} ${targetPlayerId === 'all' ? styles.targetButtonActive : ''}`}
            onClick={() => setTargetPlayerId('all')}
          >
            All Players
          </button>
          {connectedPlayers.map(player => (
            <button
              key={player.id}
              type="button"
              className={`${styles.targetButton} ${targetPlayerId === player.id ? styles.targetButtonActive : ''}`}
              onClick={() => setTargetPlayerId(player.id)}
              style={{ '--player-color': getPlayerColorHex(player.color) } as React.CSSProperties}
            >
              <span
                className={styles.playerColorDot}
                style={{ backgroundColor: getPlayerColorHex(player.color) }}
              />
              {player.name}
            </button>
          ))}
        </div>
      </div>

      {/* Trade Columns */}
      <div className={styles.tradeColumns}>
        {/* Offering Column */}
        <div className={styles.tradeColumn}>
          <h3 className={styles.columnTitle}>You Offer</h3>
          <ResourceSelector
            selected={offering}
            onChange={setOffering}
            resources={myResources}
            showOnlyAvailable
          />
        </div>

        {/* Arrow Divider */}
        <div className={styles.divider}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>

        {/* Requesting Column */}
        <div className={styles.tradeColumn}>
          <h3 className={styles.columnTitle}>You Request</h3>
          <ResourceSelector
            selected={requesting}
            onChange={setRequesting}
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className={styles.submitSection}>
        <button
          type="button"
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!isValidTrade || !canTrade}
        >
          {submitLabel || (isCounterOffer ? 'Send Counter-Offer' : 'Send Offer')}
        </button>
      </div>
    </div>
  );
};

/**
 * Bank Trade Tab Component
 */
interface BankTradeTabProps {
  myResources: ResourceCounts;
  bankResources: ResourceCounts;
  bankRates: Record<ResourceType, 2 | 3 | 4>;
  onSubmit: (params: BankTradeParams) => void;
  canTrade: boolean;
}

const BankTradeTab: React.FC<BankTradeTabProps> = ({
  myResources,
  bankResources,
  bankRates,
  onSubmit,
  canTrade,
}) => {
  const [giveResource, setGiveResource] = useState<ResourceType | null>(null);
  const [giveAmount, setGiveAmount] = useState(0);
  const [receiveResource, setReceiveResource] = useState<ResourceType | null>(null);

  // Reset when give resource changes
  useEffect(() => {
    setGiveAmount(0);
  }, [giveResource]);

  // Calculate how many we can receive based on give amount
  const rate = giveResource ? bankRates[giveResource] : 4;
  const receiveAmount = Math.floor(giveAmount / rate);
  const maxGive = giveResource ? myResources[giveResource] : 0;
  const maxReceiveFromBank = receiveResource ? bankResources[receiveResource] : 0;

  // Calculate maximum useful give amount
  const maxUsefulGive = Math.min(
    maxGive,
    maxReceiveFromBank * rate
  );

  const isValidTrade = useMemo(() => {
    if (!giveResource || !receiveResource) return false;
    if (giveResource === receiveResource) return false;
    if (giveAmount < rate) return false;
    if (receiveAmount <= 0) return false;
    if (receiveAmount > maxReceiveFromBank) return false;
    return true;
  }, [giveResource, receiveResource, giveAmount, rate, receiveAmount, maxReceiveFromBank]);

  const handleSubmit = useCallback(() => {
    if (isValidTrade && canTrade && giveResource && receiveResource) {
      onSubmit({
        giveResource,
        giveAmount,
        receiveResource,
        receiveAmount,
      });
    }
  }, [isValidTrade, canTrade, giveResource, giveAmount, receiveResource, receiveAmount, onSubmit]);

  return (
    <div className={styles.tabContent}>
      {/* Port Rates Display */}
      <div className={styles.portsSection}>
        <label className={styles.sectionLabel}>Your Trade Rates:</label>
        <TradeRateSummary rates={bankRates} />
      </div>

      {/* Give Section */}
      <div className={styles.bankTradeSection}>
        <h3 className={styles.columnTitle}>You Give</h3>
        <div className={styles.resourceButtonGrid}>
          {RESOURCES.map(resource => {
            const available = myResources[resource];
            const resourceRate = bankRates[resource];
            const canSelect = available >= resourceRate;

            return (
              <button
                key={resource}
                type="button"
                className={`${styles.resourceButton} ${giveResource === resource ? styles.resourceButtonActive : ''}`}
                onClick={() => setGiveResource(resource)}
                disabled={!canSelect}
                title={`${RESOURCE_LABELS[resource]} (${resourceRate}:1, have ${available})`}
              >
                <img
                  src={`/assets/cards/card_${resource}.svg`}
                  alt={RESOURCE_LABELS[resource]}
                  className={styles.resourceButtonIcon}
                />
                <span className={styles.resourceButtonLabel}>{RESOURCE_LABELS[resource]}</span>
                <span className={styles.resourceButtonRate}>{resourceRate}:1</span>
                <span className={styles.resourceButtonCount}>({available})</span>
              </button>
            );
          })}
        </div>

        {/* Amount Selector */}
        {giveResource && (
          <div className={styles.amountSection}>
            <label className={styles.amountLabel}>Amount to give:</label>
            <div className={styles.amountControls}>
              <button
                type="button"
                className={styles.amountButton}
                onClick={() => setGiveAmount(Math.max(0, giveAmount - rate))}
                disabled={giveAmount < rate}
              >
                -{rate}
              </button>
              <span className={styles.amountValue}>{giveAmount}</span>
              <button
                type="button"
                className={styles.amountButton}
                onClick={() => setGiveAmount(Math.min(maxUsefulGive, giveAmount + rate))}
                disabled={giveAmount + rate > maxUsefulGive}
              >
                +{rate}
              </button>
            </div>
            <span className={styles.amountHint}>
              = {receiveAmount} resource{receiveAmount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Arrow Divider */}
      <div className={styles.bankDivider}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      </div>

      {/* Receive Section */}
      <div className={styles.bankTradeSection}>
        <h3 className={styles.columnTitle}>
          You Receive ({receiveAmount} available)
        </h3>
        <div className={styles.resourceButtonGrid}>
          {RESOURCES.map(resource => {
            const bankHas = bankResources[resource];
            const canSelect = !!giveResource && resource !== giveResource && bankHas > 0;

            return (
              <button
                key={resource}
                type="button"
                className={`${styles.resourceButton} ${receiveResource === resource ? styles.resourceButtonActive : ''}`}
                onClick={() => setReceiveResource(resource)}
                disabled={!canSelect}
                title={`${RESOURCE_LABELS[resource]} (Bank has ${bankHas})`}
              >
                <img
                  src={`/assets/cards/card_${resource}.svg`}
                  alt={RESOURCE_LABELS[resource]}
                  className={styles.resourceButtonIcon}
                />
                <span className={styles.resourceButtonLabel}>{RESOURCE_LABELS[resource]}</span>
                <span className={styles.resourceButtonCount}>Bank: {bankHas}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit Button */}
      <div className={styles.submitSection}>
        <button
          type="button"
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!isValidTrade || !canTrade}
        >
          Trade with Bank
        </button>
      </div>
    </div>
  );
};

/**
 * TradeModal main component
 */
export const TradeModal: React.FC<TradeModalProps> = ({
  bankOnly = false,
  isOpen,
  onClose,
  myResources,
  players,
  bankRates,
  bankResources,
  onPlayerTrade,
  onBankTrade,
  onCancel,
  myActiveOffers = [],
  canTrade = true,
  error,
  counterOfferData,
  onCounterOffer,
}) => {
  const [activeTab, setActiveTab] = useState<TradeTab>(bankOnly ? 'bank' : 'player');

  // Determine if this is a counter-offer modal
  const isCounterOfferMode = !!counterOfferData;

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(bankOnly ? 'bank' : 'player');
    }
  }, [isOpen, bankOnly]);

  // Handle player trade submission (wraps onPlayerTrade or onCounterOffer)
  const handlePlayerTradeSubmit = useCallback((offer: PlayerTradeOffer) => {
    if (isCounterOfferMode && counterOfferData && onCounterOffer) {
      onCounterOffer(counterOfferData.originalOfferId, offer);
    } else {
      onPlayerTrade(offer);
    }
  }, [isCounterOfferMode, counterOfferData, onCounterOffer, onPlayerTrade]);

  const handleClose = useCallback(() => {
    onCancel();
    onClose();
  }, [onCancel, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isCounterOfferMode ? 'Counter-Offer' : 'Trade'}
      size="large"
    >
      <div className={styles.container}>
        {/* Tabs - hide bank tab in counter-offer mode */}
        {!isCounterOfferMode && (
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'player' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('player')}
              disabled={bankOnly} title={bankOnly ? 'Player trading is not available in this preview' : undefined}
            >
              Player Trade
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'bank' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('bank')}
            >
              Bank Trade
            </button>
          </div>
        )}

        {/* Counter-offer indicator */}
        {isCounterOfferMode && (
          <div className={styles.counterOfferBanner}>
            Modify the trade to create your counter-offer
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        {/* Cannot Trade Warning */}
        {!canTrade && (
          <div className={styles.warningMessage}>
            You can only trade during your main phase after rolling.
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'player' || isCounterOfferMode ? (
          <PlayerTradeTab
            myResources={myResources}
            players={players}
            onSubmit={handlePlayerTradeSubmit}
            canTrade={canTrade}
            initialOffering={counterOfferData?.offering}
            initialRequesting={counterOfferData?.requesting}
            initialTargetPlayerId={counterOfferData?.toPlayerId}
            isCounterOffer={isCounterOfferMode}
          />
        ) : (
          <BankTradeTab
            myResources={myResources}
            bankResources={bankResources}
            bankRates={bankRates}
            onSubmit={onBankTrade}
            canTrade={canTrade}
          />
        )}

        {/* Active Offers (if any) */}
        {myActiveOffers.length > 0 && (
          <div className={styles.activeOffersSection}>
            <h4 className={styles.activeOffersTitle}>Your Active Offers</h4>
            <div className={styles.activeOffersList}>
              {myActiveOffers.map(offer => (
                <div key={offer.id} className={styles.activeOfferItem}>
                  <ResourceDisplay resources={offer.offering} size="small" compact />
                  <span className={styles.activeOfferArrow}>for</span>
                  <ResourceDisplay resources={offer.requesting} size="small" compact />
                  <span className={styles.activeOfferStatus}>
                    ({offer.declinedBy.length} declined)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Button */}
        <div className={styles.cancelSection}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default TradeModal;
