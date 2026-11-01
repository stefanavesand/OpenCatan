/**
 * useGamePhase - Hook for managing game phase UI state
 *
 * Provides derived states for showing/hiding various UI elements
 * based on the current game phase and player turn status.
 */

import { useMemo } from 'react';
import { useAppSelector } from './useAppSelector';
import {
  selectPhase,
  selectCurrentPlayerId,
  selectTurnTimeRemaining,
  selectLastRoll,
  selectPendingDiscard,
  selectRoadBuildingRemaining,
  selectYearOfPlentyRemaining,
  selectWinnerId,
  selectFinalScores,
  selectGameSettings,
  selectLocalPlayerId,
  selectDevCardPlayedThisTurn,
} from '@/game/state';
import type { GamePhase } from '@/types/game';

/**
 * Return type for useGamePhase hook
 */
export interface UseGamePhaseReturn {
  /** Current game phase */
  phase: GamePhase;

  /** Whether it's the local player's turn */
  isMyTurn: boolean;

  /** ID of the current player */
  currentPlayerId: string | null;

  /** ID of the local player */
  localPlayerId: string | null;

  /** Seconds remaining in turn */
  turnTimeRemaining: number;

  /** Last dice roll result */
  lastRoll: { die1: number; die2: number; total: number } | null;

  // ============================================
  // Overlay visibility flags
  // ============================================

  /** Show setup overlay during setup phases */
  showSetupOverlay: boolean;

  /** Show robber overlay during robber phases */
  showRobberOverlay: boolean;

  /** Show roll dice button prominently */
  showRollButton: boolean;

  /** Show discard modal for affected players */
  showDiscardModal: boolean;

  /** Show victory screen when game ends */
  showVictoryScreen: boolean;

  /** Show road building overlay */
  showRoadBuildingOverlay: boolean;

  /** Show year of plenty modal */
  showYearOfPlentyModal: boolean;

  /** Show monopoly modal */
  showMonopolyModal: boolean;

  // ============================================
  // Action availability flags
  // ============================================

  /** Whether player can build during this phase */
  canBuild: boolean;

  /** Whether player can trade during this phase */
  canTrade: boolean;

  /** Whether player can buy dev cards during this phase */
  canBuyDevCard: boolean;

  /** Whether player can play dev cards during this phase */
  canPlayDevCard: boolean;

  /** Whether player can end their turn */
  canEndTurn: boolean;

  /** Whether player must roll dice */
  mustRoll: boolean;

  /** Whether player must discard */
  mustDiscard: boolean;

  /** Whether player must move robber */
  mustMoveRobber: boolean;

  /** Whether player must select steal victim */
  mustSelectStealVictim: boolean;

  // ============================================
  // Phase-specific data
  // ============================================

  /** Players who need to discard */
  pendingDiscardPlayers: string[];

  /** Roads remaining in road building card */
  roadBuildingRemaining: number;

  /** Resources remaining in year of plenty */
  yearOfPlentyRemaining: number;

  /** ID of the winning player */
  winnerId: string | null;

  /** Final scores for all players */
  finalScores: Record<string, number> | null;

  // ============================================
  // Phase categories
  // ============================================

  /** Whether in a setup phase */
  isSetupPhase: boolean;

  /** Whether in a robber-related phase */
  isRobberPhase: boolean;

  /** Whether in a dev card action phase */
  isDevCardPhase: boolean;

  /** Whether game has ended */
  isGameEnded: boolean;

  /** Whether in main gameplay phase */
  isMainPhase: boolean;
}

/**
 * Hook for managing game phase UI state
 *
 * @example
 * ```tsx
 * function GamePage() {
 *   const {
 *     phase,
 *     isMyTurn,
 *     showSetupOverlay,
 *     showRobberOverlay,
 *     canBuild,
 *     canTrade,
 *   } = useGamePhase();
 *
 *   return (
 *     <div>
 *       {showSetupOverlay && <SetupOverlay />}
 *       {showRobberOverlay && <RobberOverlay />}
 *       <ActionBar canBuild={canBuild} canTrade={canTrade} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useGamePhase(): UseGamePhaseReturn {
  // Redux selectors
  const phase = useAppSelector(selectPhase);
  const currentPlayerId = useAppSelector(selectCurrentPlayerId);
  const localPlayerId = useAppSelector(selectLocalPlayerId);
  const turnTimeRemaining = useAppSelector(selectTurnTimeRemaining);
  const lastRoll = useAppSelector(selectLastRoll);
  const pendingDiscardPlayers = useAppSelector(selectPendingDiscard);
  const roadBuildingRemaining = useAppSelector(selectRoadBuildingRemaining);
  const yearOfPlentyRemaining = useAppSelector(selectYearOfPlentyRemaining);
  const winnerId = useAppSelector(selectWinnerId);
  const finalScores = useAppSelector(selectFinalScores);
  const settings = useAppSelector(selectGameSettings);
  const devCardPlayedThisTurn = useAppSelector(selectDevCardPlayedThisTurn);

  // Compute derived state
  return useMemo(() => {
    const isMyTurn = currentPlayerId === localPlayerId;

    // Phase categories
    const isSetupPhase = phase.startsWith('setup-');
    const isRobberPhase = ['discard', 'robber-move', 'robber-steal', 'pirate-move', 'pirate-steal'].includes(phase);
    const isDevCardPhase = ['road-building', 'year-of-plenty', 'monopoly'].includes(phase);
    const isGameEnded = phase === 'ended';
    const isMainPhase = phase === 'main';

    // Overlay visibility
    const showSetupOverlay = isSetupPhase;
    const showRobberOverlay = isRobberPhase;
    const showRollButton = phase === 'roll' && isMyTurn;
    const showDiscardModal = phase === 'discard' && localPlayerId !== null && pendingDiscardPlayers.includes(localPlayerId);
    const showVictoryScreen = isGameEnded;
    const showRoadBuildingOverlay = phase === 'road-building' && isMyTurn;
    const showYearOfPlentyModal = phase === 'year-of-plenty' && isMyTurn;
    const showMonopolyModal = phase === 'monopoly' && isMyTurn;

    // Action availability
    const canBuild = isMainPhase && isMyTurn;
    const canTrade = isMainPhase && isMyTurn;
    const canBuyDevCard = isMainPhase && isMyTurn;
    const canPlayDevCard = (isMainPhase || phase === 'roll') && isMyTurn && !devCardPlayedThisTurn;
    const canEndTurn = isMainPhase && isMyTurn;

    // Required actions
    const mustRoll = phase === 'roll' && isMyTurn;
    const mustDiscard = phase === 'discard' && localPlayerId !== null && pendingDiscardPlayers.includes(localPlayerId);
    const mustMoveRobber = (phase === 'robber-move' || phase === 'pirate-move') && isMyTurn;
    const mustSelectStealVictim = (phase === 'robber-steal' || phase === 'pirate-steal') && isMyTurn;

    return {
      // Core state
      phase,
      isMyTurn,
      currentPlayerId,
      localPlayerId,
      turnTimeRemaining,
      lastRoll,

      // Overlay visibility
      showSetupOverlay,
      showRobberOverlay,
      showRollButton,
      showDiscardModal,
      showVictoryScreen,
      showRoadBuildingOverlay,
      showYearOfPlentyModal,
      showMonopolyModal,

      // Action availability
      canBuild,
      canTrade,
      canBuyDevCard,
      canPlayDevCard,
      canEndTurn,

      // Required actions
      mustRoll,
      mustDiscard,
      mustMoveRobber,
      mustSelectStealVictim,

      // Phase-specific data
      pendingDiscardPlayers,
      roadBuildingRemaining,
      yearOfPlentyRemaining,
      winnerId,
      finalScores,

      // Phase categories
      isSetupPhase,
      isRobberPhase,
      isDevCardPhase,
      isGameEnded,
      isMainPhase,
    };
  }, [
    phase,
    currentPlayerId,
    localPlayerId,
    turnTimeRemaining,
    lastRoll,
    pendingDiscardPlayers,
    roadBuildingRemaining,
    yearOfPlentyRemaining,
    winnerId,
    finalScores,
    devCardPlayedThisTurn,
  ]);
}

export default useGamePhase;
