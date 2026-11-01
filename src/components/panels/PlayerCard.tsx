import React, { useState } from 'react';
import styles from './PlayerCard.module.css';

/**
 * Player color type matching the game's available colors
 */
export type PlayerColor =
  | 'red'
  | 'blue'
  | 'orange'
  | 'white'
  | 'green'
  | 'purple'
  | 'black'
  | 'bronze'
  | 'gold'
  | 'silver'
  | 'pink'
  | 'mysticblue';

/**
 * Player data structure for display
 */
export interface PlayerData {
  id: string;
  name: string;
  color: PlayerColor;
  isConnected: boolean;
  isHost: boolean;
  victoryPoints: number;
  resourceCount: number;
  devCardCount: number;
  longestRoadLength: number;
  armySize: number;
  /** Whether this player has the Longest Road */
  hasLongestRoad?: boolean;
  /** Whether this player has the Largest Army */
  hasLargestArmy?: boolean;
  // C&K specific
  cityImprovements?: {
    trade: number;
    politics: number;
    science: number;
  };
  knightCount?: number;
}

interface PlayerCardProps {
  /** Player data to display */
  player: PlayerData;
  /** Whether it's this player's turn */
  isCurrentTurn: boolean;
  /** Whether this is the local player */
  isMe: boolean;
  /** Compact horizontal layout mode */
  compact?: boolean;
}

/**
 * Color mapping for CSS custom properties
 */
const colorMap: Record<PlayerColor, string> = {
  red: '#e53935',
  blue: '#1e88e5',
  orange: '#fb8c00',
  white: '#f5f5f5',
  green: '#43a047',
  purple: '#8e24aa',
  black: '#424242',
  bronze: '#cd7f32',
  gold: '#ffd700',
  silver: '#c0c0c0',
  pink: '#ec407a',
  mysticblue: '#5c6bc0',
};

/**
 * Background image mapping for player colors
 */
const bgImageMap: Record<PlayerColor, string> = {
  red: '/assets/ui/player_bg_red.svg',
  blue: '/assets/ui/player_bg_blue.svg',
  orange: '/assets/ui/player_bg_orange.svg',
  white: '/assets/ui/player_bg_white.svg',
  green: '/assets/ui/player_bg_green.svg',
  purple: '/assets/ui/player_bg_purple.svg',
  black: '/assets/ui/player_bg_black.svg',
  bronze: '/assets/ui/player_bg_bronze.svg',
  gold: '/assets/ui/player_bg_gold.svg',
  silver: '/assets/ui/player_bg_silver.svg',
  pink: '/assets/ui/player_bg_pink.svg',
  mysticblue: '/assets/ui/player_bg_mysticblue.svg',
};

/**
 * PlayerCard - Single player info card
 *
 * Displays player information including name, color, victory points,
 * and card counts. Expandable to show additional details.
 *
 * @param player - Player data to display
 * @param isCurrentTurn - Whether it's this player's turn
 * @param isMe - Whether this is the local player
 */
export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isCurrentTurn,
  isMe,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (!compact) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!compact) {
        setIsExpanded(!isExpanded);
      }
    }
  };

  const playerColor = colorMap[player.color];
  const bgImage = bgImageMap[player.color];

  // Compact horizontal layout for bottom panel
  if (compact) {
    return (
      <div
        data-testid={`player-${player.id}`} data-resource-count={player.resourceCount} data-victory-points={player.victoryPoints}
        className={`${styles.playerCardCompact} ${isCurrentTurn ? styles.currentTurnCompact : ''} ${isMe ? styles.isMeCompact : ''}`}
        style={{
          '--player-color': playerColor,
          '--player-bg': `url(${bgImage})`,
        } as React.CSSProperties}
        title={`${player.name}${isMe ? ' (You)' : ''} - ${player.victoryPoints} VP`}
      >
        {/* Background */}
        <div className={styles.compactBg} />

        {/* Main row: name/VP, cards, achievements */}
        <div className={styles.compactRow}>
          {/* Color indicator + Name + VP */}
          <div className={styles.compactIdentity}>
            <div className={styles.colorDot} />
            <span className={styles.compactName}>
              {player.name}
              {isMe && <span className={styles.youTagCompact}> (YOU)</span>}
            </span>
            <span className={styles.compactVP}>{player.victoryPoints}</span>
          </div>

          {/* Card stacks: resource cards + dev cards */}
          <div className={styles.compactCardStacks}>
            {/* Resource card stack */}
            <div className={styles.cardStack} title={`${player.resourceCount} resource cards`}>
              <img
                src="/assets/cards/card_rescardback.svg"
                alt="Cards"
                className={styles.cardStackImage}
              />
              <span className={styles.cardStackCount}>{player.resourceCount}</span>
            </div>

            {/* Dev card stack */}
            <div className={styles.cardStack} title={`${player.devCardCount} development cards`}>
              <img
                src="/assets/cards/card_devcardback.svg"
                alt="Dev Cards"
                className={styles.cardStackImage}
              />
              <span className={styles.cardStackCount}>{player.devCardCount}</span>
            </div>
          </div>

          {/* Achievement badges */}
          <div className={styles.compactAchievements}>
            {/* Largest Army indicator with knight count */}
            <div
              className={`${styles.achievementIcon} ${player.hasLargestArmy ? styles.achievementActive : ''}`}
              title={`Knights played: ${player.armySize}${player.hasLargestArmy ? ' (Largest Army!)' : ''}`}
            >
              <img src="/assets/ui/icon_largest_army.svg" alt="Army" />
              <span className={styles.achievementCount}>{player.armySize}</span>
            </div>

            {/* Longest Road indicator with road count */}
            <div
              className={`${styles.achievementIcon} ${player.hasLongestRoad ? styles.achievementActive : ''}`}
              title={`Road length: ${player.longestRoadLength}${player.hasLongestRoad ? ' (Longest Road!)' : ''}`}
            >
              <img src="/assets/ui/icon_longest_road.svg" alt="Road" />
              <span className={styles.achievementCount}>{player.longestRoadLength}</span>
            </div>
          </div>
        </div>

        {/* Turn indicator */}
        {isCurrentTurn && (
          <div className={styles.turnBadge}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        )}

        {/* Connection status */}
        {!player.isConnected && (
          <div className={styles.disconnectedBadge} title="Disconnected">!</div>
        )}
      </div>
    );
  }

  // Full vertical layout (legacy)
  return (
    <div
      className={`${styles.playerCard} ${isCurrentTurn ? styles.currentTurn : ''} ${isMe ? styles.isMe : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      style={{ '--player-color': playerColor } as React.CSSProperties}
    >
      {/* Color bar on the left */}
      <div className={styles.colorBar} />

      {/* Main content */}
      <div className={styles.content}>
        {/* Header row with name and turn indicator */}
        <div className={styles.header}>
          <div className={styles.nameSection}>
            <span className={styles.name}>
              {player.name}
              {isMe && <span className={styles.youLabel}> (You)</span>}
            </span>
            {player.isHost && <span className={styles.hostBadge}>Host</span>}
          </div>

          <div className={styles.indicators}>
            {/* Connection status */}
            <span
              className={`${styles.connectionDot} ${player.isConnected ? styles.connected : styles.disconnected}`}
              title={player.isConnected ? 'Connected' : 'Disconnected'}
            />
            {/* Turn indicator */}
            {isCurrentTurn && (
              <span className={styles.turnIndicator} title="Current turn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm7 14l5-5-5-5v4H8v2h4v4z" />
                </svg>
              </span>
            )}
          </div>
        </div>

        {/* Victory points row */}
        <div className={styles.vpRow}>
          <span className={styles.vpLabel}>VP</span>
          <span className={styles.vpValue}>{player.victoryPoints}</span>
          <div className={styles.vpBar}>
            <div
              className={styles.vpFill}
              style={{ width: `${Math.min(player.victoryPoints * 10, 100)}%` }}
            />
          </div>
        </div>

        {/* Card counts row */}
        <div className={styles.cardCounts}>
          <div className={styles.cardCount} title="Resource cards">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
            </svg>
            <span>{player.resourceCount}</span>
          </div>
          <div className={styles.cardCount} title="Development cards">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
            </svg>
            <span>{player.devCardCount}</span>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className={styles.expandedDetails}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Longest Road</span>
              <span className={styles.detailValue}>{player.longestRoadLength}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Army Size</span>
              <span className={styles.detailValue}>{player.armySize}</span>
            </div>
            {player.cityImprovements && (
              <>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Trade</span>
                  <span className={styles.detailValue}>
                    {player.cityImprovements.trade}/5
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Politics</span>
                  <span className={styles.detailValue}>
                    {player.cityImprovements.politics}/5
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Science</span>
                  <span className={styles.detailValue}>
                    {player.cityImprovements.science}/5
                  </span>
                </div>
              </>
            )}
            {player.knightCount !== undefined && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Knights</span>
                <span className={styles.detailValue}>{player.knightCount}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerCard;
