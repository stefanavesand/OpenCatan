import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const {newCatan,applyCatan,catanView,eligibleActors,botDecision,RESOURCES}=await import('file:///tmp/catan-runtime.js');
const count=Number(process.argv.find(a=>a.startsWith('--games='))?.split('=')[1]||100);
if(!Number.isInteger(count)||count<1||count>1000)throw Error('Choose 1–1000 games');
const results=[],times=[],started=performance.now();
for(let seed=1;seed<=count;seed++){
 let entropy=seed,serial=0;
 const ctx={randomInt:n=>{entropy=(Math.imul(entropy,1664525)+1013904223)>>>0;return Math.floor(entropy/4294967296*n);},now:()=>1000,id:()=>`id-${++serial}`};
 const seats=Array.from({length:seed%2?3:4},(_,i)=>({id:`p${i+1}`,name:`Bot ${i+1}`,kind:'bot',level:seed%3?'standard':'easy'}));
 let game=newCatan(`regression-${seed}`,seats,ctx),actions=0;
 while(game.state.game.phase!=='ended'&&actions<10000){
  const actor=eligibleActors(game)[0],view=catanView(game,actor),time=performance.now();
  const choice=botDecision(view,seats.find(s=>s.id===actor).level);times.push(performance.now()-time);
  game=applyCatan(game,actor,choice,ctx);actions++;
  for(const r of RESOURCES)if(game.state.game.bank[r]+game.state.players.players.reduce((n,p)=>n+p.resources[r],0)!==19||game.state.game.bank[r]<0||game.state.players.players.some(p=>p.resources[r]<0))throw Error(`Resource invariant seed ${seed}`);
 }
 if(game.state.game.phase!=='ended')throw Error(`No natural completion: seed ${seed}, ${actions} actions, turn ${game.state.game.turn}`);
 results.push({seed,players:seats.length,actions,turns:game.state.game.turn,winner:game.state.game.winnerId});
 if(seed%10===0)console.log('Completed',seed,'/',count);
}
times.sort((a,b)=>a-b);const summary={games:count,seconds:(performance.now()-started)/1000,decisionP95Ms:times[Math.floor(times.length*.95)],decisionMaxMs:times.at(-1),heapUsedBytes:process.memoryUsage().heapUsed,results};
await writeFile('/tmp/catan-bot-regression.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));
