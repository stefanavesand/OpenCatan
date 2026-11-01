# OpenCatan - Product Requirements Document

## Executive Summary

**Project Name:** OpenCatan
**Version:** 1.0
**Date:** December 29, 2025
**Status:** Feature Complete Launch

OpenCatan is an online multiplayer implementation of the classic board game Catan. Players join game rooms via shareable room codes and play together on their own devices in real-time. The game supports Base Game, Cities & Knights, 5-6 Player Extension, and Seafarers expansion modes at launch.

---

## 1. Project Overview

### 1.1 Vision
Create a fully-featured online Catan implementation where players can join rooms via codes and play together on separate devices, matching the gameplay experience and rule behavior of Colonist.io.

### 1.2 Core Goals
- Online multiplayer via room codes (like Jackbox)
- All game modes at launch: Base, C&K, 5-6 Player, Seafarers
- Real-time synchronization via PartyKit
- Colonist.io rule parity for edge cases
- Licensed Colonist assets for visual consistency

### 1.3 Non-Goals (v1.0)
- User accounts or persistent profiles
- AI opponents
- Spectator mode
- Game pause/resume (live sessions only)
- Mobile-optimized UI (basic support only)
- Tutorial or onboarding

---

## 2. Architecture Overview

### 2.1 System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Player 1      │     │   Player 2      │     │   Player 3      │
│   (Browser)     │     │   (Browser)     │     │   (Browser)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │       PartyKit          │
                    │   (Real-time Relay)     │
                    │                         │
                    │  - Room management      │
                    │  - Message relay        │
                    │  - Connection state     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Host's Browser      │
                    │   (Game Authority)      │
                    │                         │
                    │  - Game state machine   │
                    │  - Rule validation      │
                    │  - Action processing    │
                    └─────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 18 + TypeScript | Industry standard, strong typing |
| **Build Tool** | Vite | Fast dev server, optimized builds |
| **State Management** | Redux Toolkit | DevTools, time-travel debugging, structure for complex game state |
| **Styling** | CSS Modules | Scoped styles, no runtime overhead, works well with SVG |
| **Rendering** | Pure SVG + React | DOM-based interactions, accessibility, easier styling |
| **Real-time** | PartyKit | Managed WebSocket infrastructure, handles reconnection |
| **Hosting** | Cloudflare Pages | Edge network, free tier, automatic deploys |
| **Testing** | Vitest + React Testing Library | Unit + integration tests |

### 2.3 Project Structure

```
/opencatan
├── /public
│   └── /assets
│       ├── /cards           # Resource, dev, and progress cards
│       ├── /dice            # All dice SVGs
│       ├── /pieces          # Cities, settlements, roads, knights
│       ├── /tiles           # Hex terrain tiles
│       ├── /icons           # Game icons (robber, ports, etc.)
│       ├── /ui              # Buttons, backgrounds, UI elements
│       └── /sounds          # 46 sound effect files
├── /src
│   ├── /components
│   │   ├── /board           # HexGrid, Tile, Vertex, Edge, Piece
│   │   ├── /cards           # Hand, CardStack, TradeOffer
│   │   ├── /lobby           # RoomCode, PlayerList, Settings
│   │   ├── /ui              # Button, Modal, Toast, Timer
│   │   ├── /panels          # PlayerPanel, GameLog, Chat
│   │   └── /overlays        # TradeModal, RobberSelector, VictoryScreen
│   ├── /game
│   │   ├── /engine          # Core game logic (host-only)
│   │   ├── /rules           # Rule validation per mode
│   │   ├── /state           # Redux slices
│   │   └── /modes           # Mode-specific configs
│   ├── /network
│   │   ├── partykit.ts      # PartyKit client wrapper
│   │   ├── host.ts          # Host-specific logic
│   │   └── peer.ts          # Non-host client logic
│   ├── /hooks               # Custom React hooks
│   ├── /utils               # Helpers (hex math, shuffle, etc.)
│   └── /types               # TypeScript definitions
├── /party                   # PartyKit server code
│   └── index.ts             # Room management, message relay
├── /tests
│   ├── /unit                # Game engine tests
│   └── /integration         # Multi-component tests
└── package.json
```

---

## 3. Authentication & Room System

### 3.1 Room Codes
- **No user accounts required** - players join via 6-character room codes
- Room codes generated on room creation (e.g., `OCEAN7`, `BRICK2`)
- Codes are case-insensitive, alphanumeric, avoiding ambiguous characters (0/O, 1/I/L)

### 3.2 Session Management
- **Browser Session Token:** Store unique player token in `localStorage`
- On disconnect, player can reconnect if same browser returns within room timeout
- Token links to player seat (color, position, game state)

### 3.3 Host Authority
- **Room creator is the Host** - their browser runs authoritative game logic
- All game actions validated by host before state update
- Host broadcasts state changes to all peers via PartyKit

### 3.4 Host Migration
- If host disconnects, automatically promote next player (by join order) to host
- Transfer game state to new host seamlessly
- Game continues without interruption

### 3.5 Room Lifecycle
```
1. CREATE    → Host opens app, creates room, gets code
2. JOIN      → Players enter code, select color, mark ready
3. CONFIGURE → Host sets game options
4. START     → Host clicks start when all ready
5. PLAY      → Game in progress
6. END       → Victory achieved or room abandoned
7. EXPIRE    → Room deleted after 30 min inactivity
```

---

## 4. Game Modes

All modes ship at v1.0 launch.

### 4.1 Base Game (3-4 Players)
- 19 hex tiles, 5 resource types
- Settlements, Cities, Roads
- Development cards (Knight, VP, Road Building, Year of Plenty, Monopoly)
- Longest Road, Largest Army
- Robber on 7s
- Default 10 VP to win

### 4.2 5-6 Player Extension
- Expanded hex grid (30 tiles)
- Special Build Phase after each player's turn
- Same rules as base otherwise

### 4.3 Cities & Knights Expansion
- 3 commodity types: Cloth, Coin, Paper
- City improvements (Trade, Politics, Science) with 5 levels each
- Knights (3 levels: Basic, Strong, Mighty) with active/inactive states
- Barbarian invasion track
- 3 progress card decks
- Metropolis tiles (one per discipline, 2 VP each)
- City walls (increase hand limit)
- Event dice (replaces some robber activation)
- Merchant piece
- Defender of Catan (replaces Largest Army)

### 4.4 Seafarers Expansion
- Ships as ocean roads
- Gold hex tiles (produce any resource)
- Fog-of-war tiles (revealed on ship placement only)
- Pirate (ocean robber)
- Multiple island scenarios

---

## 5. Lobby & Game Configuration

### 5.1 Lobby Flow
```
┌─────────────────────────────────────────────┐
│  Room Code: OCEAN7        [Copy Link]       │
├─────────────────────────────────────────────┤
│  Players (3/4):                             │
│  ● Cole (Host) - Red      [Ready]           │
│  ● Alex - Blue            [Ready]           │
│  ● Sam - Orange           [Not Ready]       │
│  ○ Waiting for player...                    │
├─────────────────────────────────────────────┤
│  Game Settings (Host only):                 │
│  Mode: [Base Game ▼]                        │
│  Players: [4 ▼]                             │
│  Victory Points: [10 ▼]                     │
│  Turn Timer: [90 sec ▼]                     │
│  Map: [Random ▼]                            │
│  Friendly Robber: [Off ▼]                   │
├─────────────────────────────────────────────┤
│              [Start Game]                   │
│         (Enabled when all ready)            │
└─────────────────────────────────────────────┘
```

### 5.2 Configurable Settings

| Setting | Options | Default |
|---------|---------|---------|
| Game Mode | Base, C&K, Seafarers | Base |
| Player Count | 3, 4, 5, 6 (based on mode) | 4 |
| Victory Points | 8, 10, 12, 14 | 10 |
| Turn Timer | 60s, 90s, 120s, 180s, Unlimited | 90s |
| Discard Limit | 7, 8, 9, 10 | 7 |
| Map | Random, [Preset List] | Random |
| Friendly Robber | On/Off | Off |

### 5.3 Friendly Robber Rule
When enabled: Robber cannot be placed on hexes where ALL adjacent players have fewer than 3 victory points.

### 5.4 Color Selection
- **First-come first-served** - colors disabled once taken
- 12 available colors: Red, Blue, Orange, White, Green, Purple, Black, Bronze, Gold, Silver, Pink, Mystic Blue
- Players can change color until game starts (if available)

### 5.5 Turn Order
- **Randomized at game start** - not based on join order
- Order displayed in player panel during game

---

## 6. Gameplay Mechanics

### 6.1 Setup Phase
- **Timed sequential placement** (snake draft)
- Order: P1 → P2 → P3 → P4 → P4 → P3 → P2 → P1
- Each placement: 1 settlement + 1 road
- Shorter timer (30-45 seconds) for setup placements
- Second settlement grants starting resources

### 6.2 Turn Structure

```
┌─────────────────────────────────────────────┐
│                TURN START                   │
│            Timer begins (90s)               │
└─────────────────────┬───────────────────────┘
                      ▼
┌─────────────────────────────────────────────┐
│              1. ROLL DICE                   │
│  - True random (crypto-random)              │
│  - If 7: Discard phase → Robber phase       │
│  - Otherwise: Resource distribution         │
└─────────────────────┬───────────────────────┘
                      ▼
┌─────────────────────────────────────────────┐
│           2. MAIN PHASE (any order)         │
│  - Build: Road, Settlement, City            │
│  - Buy Development Card                     │
│  - Play Development Card (1 per turn max)   │
│  - Trade: Players or Bank                   │
│  - (C&K) Activate/Move Knights              │
│  - (C&K) Build City Improvements            │
└─────────────────────┬───────────────────────┘
                      ▼
┌─────────────────────────────────────────────┐
│              3. END TURN                    │
│  - Check victory condition                  │
│  - Pass to next player                      │
└─────────────────────────────────────────────┘
```

### 6.3 Turn Timer Behavior
- Hard timer per turn (default 90s)
- Visual countdown always visible
- **On expiry:** Force end turn immediately
- Uncommitted builds canceled, resources refunded

### 6.4 Dice Rolling
- **True random** using crypto-random
- No balancing algorithms or deck-based systems
- Streaks are possible and intentional

### 6.5 Seven / Robber Rules
1. All players with > discard limit must discard half (rounded down)
2. **Timed auto-discard:** If player doesn't discard in time, random discard
3. Active player moves robber
4. **Victim selection:** Player list popup showing eligible players with card counts
5. Steal one random card from chosen victim

### 6.6 Board Generation
- **Official rules enforcement:** 6 and 8 tokens cannot be adjacent
- Standard tile distribution per mode
- Random placement otherwise
- Preset maps also available

---

## 7. Trading System

### 7.1 Player Trading

```
┌─────────────────────────────────────────────┐
│           TRADE OFFER (from Cole)           │
├──────────────────┬──────────────────────────┤
│    OFFERING      │      REQUESTING          │
│  🧱 Brick x2     │    🌾 Grain x1           │
│                  │    🐑 Wool x1            │
├──────────────────┴──────────────────────────┤
│  Alex:    [Accept] [Decline] [Counter]      │
│  Sam:     [Accept] [Decline] [Counter]      │
│  Jordan:  [Accept] [Decline] [Counter]      │
├─────────────────────────────────────────────┤
│                [Cancel Offer]               │
└─────────────────────────────────────────────┘
```

**Features:**
- Structured offers broadcast to all players simultaneously
- Recipients can: Accept, Decline, or Counter-offer
- Counter-offers create new trade proposal
- Trade completes immediately on first accept
- Active player can cancel pending offer anytime

### 7.2 Bank Trading
- **Auto-detect best rate** based on ports owned
- Rates: 4:1 (default), 3:1 (generic port), 2:1 (resource port)
- UI shows available rates when trading with bank
- One-click execution

### 7.3 Trade Restrictions
- Can only trade on your turn (after rolling)
- Cannot trade during special phases (robber, discard, etc.)
- Colonist.io parity for edge cases (e.g., no trade during Road Building card)

---

## 8. User Interface

### 8.1 Main Game Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenCatan    Room: OCEAN7    ⚙️ Settings   🔊 Sound   ⛶ Full   │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │ ┌─────────────────┐ │
│                                           │ │ Cole (You) 🎲   │ │
│                                           │ │ ██████ 5 VP     │ │
│                                           │ │ 🃏 8  📜 2       │ │
│           ┌───────────────────┐           │ └─────────────────┘ │
│           │                   │           │ ┌─────────────────┐ │
│           │   HEX BOARD       │           │ │ Alex            │ │
│           │   (SVG Canvas)    │           │ │ ██████ 4 VP     │ │
│           │                   │           │ │ 🃏 5  📜 1       │ │
│           │   [Dice: 8]       │           │ └─────────────────┘ │
│           │                   │           │ ┌─────────────────┐ │
│           └───────────────────┘           │ │ Sam             │ │
│                                           │ │ ██████ 3 VP     │ │
│   ⚔️ Longest Road: Cole (7)               │ │ 🃏 11 📜 0       │ │
│   🛡️ Largest Army: Alex (3)               │ └─────────────────┘ │
├───────────────────────────────────────────┼─────────────────────┤
│  YOUR HAND:                               │     GAME LOG        │
│  🧱x3  🪵x2  ⛰️x1  🌾x4  🐑x2              │ Cole rolled 8       │
│  📜 Knight  📜 Road Building              │ Cole got 🌾🌾        │
│                                           │ Alex got 🧱         │
│  [🔨 Build]  [🤝 Trade]  [📜 Dev Card]    │ Cole built road     │
│                   [End Turn ⏱️ 0:45]      │                     │
├───────────────────────────────────────────┼─────────────────────┤
│  CHAT                                     │ (Tab: Log | Chat)   │
│  Alex: nice roll!                         │                     │
│  Cole: ty                                 │                     │
│  [Type message...]                [Send]  │                     │
└───────────────────────────────────────────┴─────────────────────┘
```

### 8.2 Player Panel Information
**Visible for all players:**
- Player name and color
- Victory points (public only - hidden VP from dev cards not shown)
- Total resource card count (not types)
- Total development card count (not types)
- Turn indicator (dice icon)
- Connection status

**Additional for self:**
- Actual cards in hand
- Development card types

### 8.3 Game Log
**Separate panel from chat** with visibility rules:
- Dice rolls: Visible to all
- Resource gains from dice: Card type visible to all
- Robber steals: Card type visible only to stealer
- Development card purchases: "Player bought dev card" (type hidden)
- Development card plays: Card type visible to all
- Trades: Full details visible to all
- Buildings placed: Visible to all

### 8.4 Chat
- Separate panel from game log
- Simple text chat between players
- Messages tagged with player name and color
- No emoji reactions or rich formatting

### 8.5 Build Mode
- **Always show all valid placement spots** when in build mode
- Spots highlighted in player's color
- Click to place
- Visual feedback on successful placement

### 8.6 Reference Information
- **Building costs:** Hover/click on (?) icon to show cost reference
- **Longest Road:** Just show holder name and length (no path visualization)
- **Development deck:** Show count only (e.g., "18 cards remaining")

### 8.7 Responsive Design
- **Desktop-first** design optimized for 1280px+ width
- **Mobile basic:** Works but may require scrolling/zooming
- Not optimized for phones - recommend tablet minimum for good experience

---

## 9. Audio System

### 9.1 Sound Configuration
- **Full audio enabled by default**
- Master volume slider
- Mute button for quick toggle
- Settings persist in localStorage

### 9.2 Sound Effects (46 available)

| Event | Sound File | Trigger |
|-------|------------|---------|
| Dice Roll | `sfx_dice_roll_[1-4].mp3` | Random of 4 variants |
| Your Turn | `sfx_your_turn.mp3` | Turn starts |
| Settlement Place | `sfx_settlement_place.mp3` | Build settlement |
| City Place | `sfx_city_place.mp3` | Build city |
| Road Place | `sfx_road_place.mp3` | Build road |
| Dev Card Bought | `sfx_devcard_bought.mp3` | Purchase dev card |
| Dev Card Used | `sfx_devcard_used.mp3` | Play dev card |
| Trade Accepted | `sfx_offer_accepted.mp3` | Trade completes |
| Trade Rejected | `sfx_offer_rejected.mp3` | Trade declined |
| Robber Place | `sfx_robber_place.mp3` | Move robber |
| Victory | `sfx_victory.mp3` | Game won |
| Achievement | `sfx_achievement_*.mp3` | Longest road, etc. |
| Knight Actions | `sfx_knight_*.mp3` | C&K knight events |
| Click | `sfx_click.mp3` | Button clicks |

---

## 10. Cities & Knights Specifics

### 10.1 UI Integration
- **Integrated everywhere** - not in separate panels
- Barbarian track at top of screen
- City improvements in player panel
- Knight status shown on board pieces

### 10.2 Barbarian Attacks
- **Simple swap** when city is pillaged (no dramatic animation)
- Log entry notes what happened
- Affected player gets toast notification

### 10.3 Event Dice
- Shown alongside regular dice
- Determines: Barbarian advance, progress card distribution, or nothing

### 10.4 City Improvements
- Visual level indicators (1-5) in player panel
- Click to view improvement details
- Build costs shown on hover

---

## 11. Seafarers Specifics

### 11.1 Fog of War
- **Revealed on ship placement only**
- Adjacent fog tiles flip when ship placed next to them
- Revealed tiles show terrain and number token

### 11.2 Ships vs Roads
- Ships can only be placed on water edges
- Ships can be moved (open end only) before building new one
- Road building card works for ships too

### 11.3 Pirate
- Functions like robber but on water
- Steals from adjacent ships instead of settlements

---

## 12. Victory & End Game

### 12.1 Victory Condition
- First player to reach VP target on their turn wins
- Public + hidden victory points count
- Victory immediately ends game (even mid-action)

### 12.2 Victory Screen

```
┌─────────────────────────────────────────────┐
│              🏆 COLE WINS! 🏆               │
├─────────────────────────────────────────────┤
│  Final Scores:                              │
│  1. Cole      10 VP  ████████████████████   │
│  2. Alex       8 VP  ████████████████       │
│  3. Sam        6 VP  ████████████           │
│  4. Jordan     5 VP  ██████████             │
├─────────────────────────────────────────────┤
│  STATS BREAKDOWN                            │
│                                             │
│  Cole's Victory Points:                     │
│  - Settlements: 2 VP                        │
│  - Cities: 4 VP (2 cities)                  │
│  - Longest Road: 2 VP                       │
│  - Victory Point Cards: 2 VP                │
│                                             │
│  Game Statistics:                           │
│  - Total Turns: 47                          │
│  - Most Common Roll: 8 (12 times)           │
│  - Resources Collected: 156                 │
│  - Trades Made: 23                          │
├─────────────────────────────────────────────┤
│  [Return to Lobby]      [Create New Room]   │
└─────────────────────────────────────────────┘
```

### 12.3 Stats Tracked
- Points by source (settlements, cities, roads, army, dev cards, metropolis)
- Total resources collected per player
- Trades made and with whom
- Dice roll distribution
- Knights played (if C&K)
- Turns taken

---

## 13. Network & Synchronization

### 13.1 Message Types

```typescript
// Client → PartyKit → Host
type ClientMessage =
  | { type: 'JOIN_ROOM'; playerName: string }
  | { type: 'SELECT_COLOR'; color: PlayerColor }
  | { type: 'MARK_READY' }
  | { type: 'GAME_ACTION'; action: GameAction }
  | { type: 'CHAT_MESSAGE'; text: string }
  | { type: 'LEAVE_ROOM' };

// Host → PartyKit → Clients
type HostMessage =
  | { type: 'LOBBY_STATE'; state: LobbyState }
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'ACTION_RESULT'; success: boolean; error?: string }
  | { type: 'CHAT_BROADCAST'; from: string; text: string }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string }
  | { type: 'HOST_MIGRATED'; newHostId: string };
```

### 13.2 Reconnection Flow
1. Player disconnects (browser close, network issue)
2. PartyKit notifies others: "Player X disconnected"
3. Player's seat held, timer shown for reconnection
4. If same browser returns with valid session token:
   - Automatically rejoin room
   - Restore player seat and state
   - Continue game
5. If timeout expires: Seat becomes empty (game may end if below minimum players)

### 13.3 Latency Handling
- Optimistic UI updates for own actions
- Rollback if host rejects action
- ~100-200ms expected latency acceptable for turn-based game

---

## 14. Data Models

### 14.1 Core Types

```typescript
// Player Colors
type PlayerColor =
  | 'red' | 'blue' | 'orange' | 'white'
  | 'green' | 'purple' | 'black' | 'bronze'
  | 'gold' | 'silver' | 'pink' | 'mysticblue';

// Resources
type ResourceType = 'brick' | 'lumber' | 'ore' | 'grain' | 'wool';
type CommodityType = 'cloth' | 'coin' | 'paper'; // C&K only

// Hex Coordinates (Axial)
interface HexCoord {
  q: number;
  r: number;
}

// Vertex (intersection where buildings go)
interface VertexCoord {
  hex: HexCoord;
  direction: 'N' | 'S';
}

// Edge (where roads/ships go)
interface EdgeCoord {
  hex: HexCoord;
  direction: 'NE' | 'E' | 'SE';
}

// Hex Tile
interface HexTile {
  id: string;
  coord: HexCoord;
  terrain: TerrainType;
  number?: number; // 2-12, undefined for desert/water
  hasRobber: boolean;
  hasPirate?: boolean;
  isFog?: boolean; // Seafarers
}

type TerrainType =
  | 'hills' | 'forest' | 'mountains' | 'fields' | 'pasture'
  | 'desert' | 'water' | 'gold' | 'fog';

// Buildings
interface Building {
  type: 'settlement' | 'city';
  playerId: string;
  vertex: VertexCoord;
  hasWall?: boolean; // C&K
  hasMetropolis?: MetropolisType; // C&K
}

// Roads/Ships
interface Road {
  type: 'road' | 'ship';
  playerId: string;
  edge: EdgeCoord;
}

// Knights (C&K)
interface Knight {
  id: string;
  playerId: string;
  level: 1 | 2 | 3;
  isActive: boolean;
  vertex: VertexCoord;
}

// Player State
interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  isConnected: boolean;
  isHost: boolean;

  // Resources
  resources: Record<ResourceType, number>;
  commodities?: Record<CommodityType, number>; // C&K

  // Cards
  developmentCards: DevelopmentCard[];
  progressCards?: ProgressCard[]; // C&K

  // Pieces remaining
  roadsRemaining: number;
  settlementsRemaining: number;
  citiesRemaining: number;
  shipsRemaining?: number; // Seafarers
  knightsRemaining?: number; // C&K

  // Achievements
  longestRoadLength: number;
  armySize: number;

  // C&K specific
  cityImprovements?: {
    trade: number;
    politics: number;
    science: number;
  };
}

// Game State
interface GameState {
  // Meta
  roomCode: string;
  mode: 'base' | 'cities-knights' | 'seafarers';
  settings: GameSettings;

  // Phase
  phase: GamePhase;
  turn: number;
  currentPlayerId: string;
  turnTimeRemaining: number;

  // Board
  tiles: HexTile[];
  buildings: Building[];
  roads: Road[];
  ports: Port[];

  // Players
  players: Player[];
  turnOrder: string[];

  // Pieces
  robberLocation: HexCoord;
  pirateLocation?: HexCoord;
  merchantLocation?: { hex: HexCoord; playerId: string };

  // Decks
  developmentDeckCount: number;
  progressDecks?: Record<'trade' | 'politics' | 'science', number>;

  // Bank
  bank: Record<ResourceType, number>;

  // Achievements
  longestRoad: { playerId: string; length: number } | null;
  largestArmy: { playerId: string; count: number } | null;

  // C&K
  barbarianPosition?: number;
  barbarianStrength?: number;

  // History
  log: LogEntry[];
  chat: ChatMessage[];
}

type GamePhase =
  | 'lobby'
  | 'setup-settlement-1'
  | 'setup-road-1'
  | 'setup-settlement-2'
  | 'setup-road-2'
  | 'roll'
  | 'discard'
  | 'robber-move'
  | 'robber-steal'
  | 'main'
  | 'road-building'
  | 'year-of-plenty'
  | 'monopoly'
  | 'ended';
```

---

## 15. Testing Strategy

### 15.1 Unit Tests
- Game engine functions (resource distribution, build validation, longest road calculation)
- State reducers
- Utility functions (hex math, shuffling)

### 15.2 Integration Tests
- Multi-component flows (trade flow, build flow)
- State synchronization between host and peers
- Reconnection scenarios

### 15.3 Manual Testing
- Full game playthroughs for each mode
- Edge cases from Colonist.io rule parity

---

## 16. Asset Inventory

### 16.1 Licensed from Colonist
All game assets are licensed from Colonist.io, including:
- Resource and development cards
- Player pieces (cities, settlements, roads) - **to be obtained**
- Hex terrain tiles - **to be obtained**
- Number tokens - **to be obtained**
- Ports - **to be obtained**
- Dice
- Icons (robber, pirate, achievements)
- C&K assets (knights, progress cards, commodities, metropolis)
- Sound effects (46 files)
- Backgrounds

### 16.2 Currently Available (in asset folder)
See original PRD section 3 for complete inventory of currently downloaded assets.

### 16.3 Assets to Obtain
- Hex terrain tiles (brick, lumber, ore, grain, wool, desert, water, gold, fog)
- Settlements (12 colors)
- Roads (12 colors)
- Ships (12 colors)
- Number tokens (2-12)
- Ports (3:1 generic, 2:1 per resource)

---

## 17. Development Phases

### Phase 1: Foundation
- [ ] Project setup (Vite + React + TypeScript)
- [ ] PartyKit integration
- [ ] Room creation and joining flow
- [ ] Lobby UI with settings
- [ ] Player connection/disconnection handling

### Phase 2: Core Board
- [ ] Hex grid rendering (SVG)
- [ ] Board generation with 6/8 rule
- [ ] Click detection on vertices and edges
- [ ] Piece placement visualization

### Phase 3: Base Game Engine
- [ ] Redux state structure
- [ ] Turn phase state machine
- [ ] Dice rolling
- [ ] Resource distribution
- [ ] Building validation and placement
- [ ] Development card logic
- [ ] Robber mechanics
- [ ] Trading system
- [ ] Victory detection

### Phase 4: Multiplayer Sync
- [ ] Host authority implementation
- [ ] Action validation on host
- [ ] State broadcast to peers
- [ ] Reconnection with session tokens
- [ ] Host migration

### Phase 5: Complete UI
- [ ] Player panels
- [ ] Game log with visibility rules
- [ ] Chat system
- [ ] Trade modal
- [ ] Victory screen with stats
- [ ] Sound integration
- [ ] Timer display

### Phase 6: Cities & Knights
- [ ] Commodity system
- [ ] City improvements
- [ ] Knight pieces and actions
- [ ] Barbarian track and invasion
- [ ] Progress cards
- [ ] Metropolis
- [ ] Event dice

### Phase 7: Extended Modes
- [ ] 5-6 player board and special build phase
- [ ] Seafarers ships and fog

### Phase 8: Polish
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Colonist.io rule parity verification
- [ ] Obtain remaining assets

---

## 18. Success Criteria

### 18.1 Technical
- < 3 second initial load
- 60 FPS board interactions
- < 200ms action response time
- Stable 4-player games without disconnection issues

### 18.2 Functional
- All game modes fully playable
- Rules match Colonist.io behavior
- No game-breaking bugs

### 18.3 Launch Requirements
- All 4 game modes functional
- Tested with 3-6 concurrent players
- All core assets obtained and integrated
- Deployed to Cloudflare Pages

---

*Document Version: 2.0*
*Last Updated: December 29, 2025*
