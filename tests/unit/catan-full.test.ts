import { describe, expect, it } from 'vitest';
import { newCatan, applyCatan, catanView, eligibleActors, RESOURCES, type CatanSession, type Seat, type Entropy } from '@/game/session/catan';
import { botDecision } from '@/game/session/bot';
function entropy(seed: number): Entropy {
  let serial=0;
  return { randomInt: upper=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*upper);}, now:()=>1000, id:()=>`id-${++serial}` };
}
function seats(count=3): Seat[] { return Array.from({length:count},(_,i)=>({id:`p${i+1}`,name:`Player ${i+1}`,kind:'bot',level:'standard'})); }
function invariants(game: CatanSession) {
  for (const r of RESOURCES) expect(game.state.game.bank[r]+game.state.players.players.reduce((sum,p)=>sum+p.resources[r],0)).toBe(19);
  expect(game.deck.length+game.state.players.players.reduce((sum,p)=>sum+p.developmentCards.length,0)).toBe(25);
  for (const p of game.state.players.players) {
    expect(p.resources).toEqual(expect.objectContaining(Object.fromEntries(RESOURCES.map(r=>[r,expect.any(Number)]))));
    for (const r of RESOURCES) expect(p.resources[r]).toBeGreaterThanOrEqual(0);
  }
}
describe('shared full Catan session',()=>{
  it.each([3,4])('plays a natural %i-player bot game to a winner without state fixtures',count=>{
    const context=entropy(count);let game=newCatan('natural-game',seats(count),context), actions=0;
    while(game.state.game.phase!=='ended'&&actions<8000){
      const actor=eligibleActors(game)[0], view=catanView(game,actor);
      expect(view.choices.length,`${game.state.game.phase} has no choices`).toBeGreaterThan(0);
      const choice=botDecision(view,'standard');
      const before=game.revision;game=applyCatan(game,actor,choice,context);expect(game.revision).toBe(before+1);
      if(actions%25===0)invariants(game);actions++;
    }
    invariants(game);
    console.log('Natural game',count,'players:',actions,'actions,',game.state.game.turn,'turns,',game.state.game.winnerId||'NO WINNER');
    expect(game.state.game.phase).toBe('ended');expect(game.state.game.finalScores![game.state.game.winnerId!]).toBeGreaterThanOrEqual(10);
  },120000);
  it('never exposes the deck or opponents hands to players or bots',()=>{
    const context=entropy(7), game=newCatan('privacy',seats(),context);
    const actor=game.state.game.currentPlayerId!;
    const opponent=game.state.players.players.find(p=>p.id!==actor)!;
    const before=catanView(game,actor);
    opponent.resources.ore=9;
    opponent.developmentCards.push({id:'secret-card',type:'monopoly',turnBought:1,isPlayed:false});
    game.deck.reverse();
    const after=catanView(game,actor);
    expect(after.state.players.players.find(p=>p.id===opponent.id)!.resources.ore).toBe(0);expect(after.state.players.players.find(p=>p.id===opponent.id)!.developmentCards).toEqual([]);
    expect(after).not.toHaveProperty('deck');
    // Public counts legitimately change; policy has no access to hidden contents.
    expect(botDecision(before,'standard')).toEqual(botDecision(after,'standard'));
    expect(JSON.stringify(after)).not.toContain('secret-card');
  });
  it('rejects forged actors, wrong turns and invalid actions without mutating the snapshot',()=>{
    const context=entropy(1),game=newCatan('reject',seats(),context),before=structuredClone(game);
    expect(()=>applyCatan(game,'outsider',{type:'ROLL_DICE'},context)).toThrow();
    expect(()=>applyCatan(game,game.state.game.currentPlayerId!,{type:'ROLL_DICE'},context)).toThrow();
    expect(game).toEqual(before);
  });
});

describe('full-session trading and public decision boundaries',()=>{
  function mainGame(){const context=entropy(12);let game=newCatan('trade',seats(),context);while(game.state.game.phase.startsWith('setup-')){const actor=eligibleActors(game)[0];game=applyCatan(game,actor,botDecision(catanView(game,actor),'standard'),context);}const actor=game.state.game.currentPlayerId!;game=applyCatan(game,actor,{type:'ROLL_DICE'},context);game.state.game.phase='main';const other=game.seats.find(s=>s.id!==actor)!.id;return {game,context,actor,other};}
  it('commits a mutual player trade atomically and prevents stale/repeated acceptance',()=>{
    const {game:base,context,actor,other}=mainGame();
    for(const p of base.state.players.players)for(const r of RESOURCES){base.state.game.bank[r]+=p.resources[r];p.resources[r]=0;}
    base.state.players.players.find(p=>p.id===actor)!.resources.brick=2;base.state.game.bank.brick-=2;
    base.state.players.players.find(p=>p.id===other)!.resources.grain=1;base.state.game.bank.grain--;
    const give={brick:2,lumber:0,ore:0,grain:0,wool:0},receive={brick:0,lumber:0,ore:0,grain:1,wool:0};
    const offered=applyCatan(base,actor,{type:'TRADE_OFFER',to:other,give,receive},context);
    expect(()=>applyCatan(offered,actor,{type:'END_TURN'},context)).toThrow('pending trade');
    const done=applyCatan(offered,other,{type:'TRADE_ACCEPT',offerId:offered.offer!.id},context);
    invariants(done);expect(done.state.players.players.find(p=>p.id===actor)!.resources.grain).toBe(1);
    expect(done.state.players.players.find(p=>p.id===other)!.resources.brick).toBe(2);
    expect(()=>applyCatan(done,other,{type:'TRADE_ACCEPT',offerId:offered.offer!.id},context)).toThrow();
    expect(base.offer).toBe(null);
  });
  it('does not let a bot inspect hidden contents even when searching a main-phase action',()=>{
    const {game,actor,other}=mainGame();const before=catanView(game,actor),opponent=game.state.players.players.find(p=>p.id===other)!;
    opponent.resources.brick=5;opponent.resources.ore=0;const first=catanView(game,actor);
    opponent.resources.brick=0;opponent.resources.ore=5;game.deck.reverse();const second=catanView(game,actor);
    expect(first).toEqual(second);expect(botDecision(first,'standard')).toEqual(botDecision(second,'standard'));expect(before.you).toBe(actor);
  });
  it('offers off-turn discards only to the player who must discard',()=>{
    const {game,actor,other}=mainGame();game.state.game.phase='discard';game.state.game.pendingDiscard=[other];game.state.game.discardAmounts={[other]:4};game.state.players.players.find(p=>p.id===other)!.resources.brick=8;
    const view=catanView(game,other);expect(view.choices).toContainEqual({type:'DISCARD_RESOURCES',resources:{brick:4,lumber:0,ore:0,grain:0,wool:0}});
    expect(catanView(game,actor).choices).toEqual([]);
  });
});
