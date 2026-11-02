import { catanSaved, catanCommand, readCatan } from './catan-online-transport.js';
import { initialSession, sessionEvent, canAttempt } from './session-state.js';
import { axialToPixel, getHexCorners, getEdgeVertices, vertexToPixel } from './catan-engine.js';
const el=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
const resources=['brick','lumber','ore','grain','wool'];
const colors={red:'#b73a32',blue:'#2466c0',orange:'#b8670b',green:'#24714e'};
const terrain={hills:['#c7815a','Brick'],forest:['#315e4a','Lumber'],mountains:['#808a9a','Ore'],fields:['#d8b75b','Grain'],pasture:['#9cc38c','Wool'],desert:['#e2cfaa','Desert']};
let packet=null,view=null,busy=null,timer=null,session=initialSession(),mode='',replacement=null,rendered='';
const active=()=>location.hash.startsWith('#catan-online')&&!document.hidden;
const event=e=>{session=sessionEvent(session,e);};
function pending(){try{return !!catanSaved().pending;}catch(error){event({type:'FAIL',code:error.code,pending:false,retryable:false,now:Date.now(),jitter:0});el('cg-error').textContent=error.message;return true;}}
function svg(tag,attrs,text){const node=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
const name=id=>{const seat=view?.seats.find(s=>s.id===id);return seat?`${seat.name} (${seat.kind==='bot'?'Bot':seat.id.toUpperCase()})`:id;};
function label(action){
  if(action.type==='BANK_TRADE')return `Bank: ${action.give.amount} ${action.give.resource} → ${action.receive.amount} ${action.receive.resource}`;
  if(action.type==='PLAY_YEAR_OF_PLENTY')return `Year of Plenty: ${action.resources.join(' + ')}`;
  if(action.type==='PLAY_MONOPOLY')return `Monopoly: ${action.resource}`;
  if(action.type==='STEAL_RESOURCE')return `Steal from ${name(action.victimId)}`;
  return ({ROLL_DICE:'Roll dice',END_TURN:'End turn',BUY_DEVELOPMENT_CARD:'Buy development card',PLAY_KNIGHT:'Play Knight',PLAY_ROAD_BUILDING:'Play Road Building',TRADE_ACCEPT:'Accept trade',TRADE_DECLINE:'Decline trade',TRADE_CANCEL:'Cancel trade'})[action.type]||action.type.toLowerCase().replaceAll('_',' ');
}
function actionButton(text,action){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.gameControl='true';button.onclick=()=>submit(action);return button;}
function board(){
  const root=el('cg-board');root.replaceChildren();root.dataset.revision=String(view?.revision??0);if(!view)return;
  for(const tile of view.state.board.tiles){
    const p=axialToPixel(tile.coord,54),[fill,title]=terrain[tile.terrain];
    root.append(svg('polygon',{points:getHexCorners(p,54).map(v=>`${v.x},${v.y}`).join(' '),fill,stroke:'#f5ede0','stroke-width':2}));
    if(tile.number){root.append(svg('circle',{cx:p.x,cy:p.y-5,r:15,fill:'#fff9ec'}));root.append(svg('text',{x:p.x,y:p.y,'text-anchor':'middle',fill:[6,8].includes(tile.number)?'#a4372a':'#243749','font-size':17,'font-weight':750},tile.number));}
    root.append(svg('text',{x:p.x,y:p.y+25,'text-anchor':'middle',fill:tile.terrain==='forest'?'#fff':'#14243b','font-size':10},title));
    const robber=view.state.board.robberLocation;if(robber.q===tile.coord.q&&robber.r===tile.coord.r)root.append(svg('text',{x:p.x+24,y:p.y-15,fill:'#14243b','font-size':22,'font-weight':800,'aria-label':'Robber'},'R'));
  }
  for(const port of view.state.board.ports){const ends=getEdgeVertices(port.edge).map(v=>vertexToPixel(v,54));const x=(ends[0].x+ends[1].x)*.64,y=(ends[0].y+ends[1].y)*.64;root.append(svg('text',{x,y,'text-anchor':'middle',fill:'#334d69','font-size':10},port.type==='generic'?'3:1':`2:1 ${port.type}`));}
  for(const road of view.state.board.roads){const[a,b]=getEdgeVertices(road.edge).map(v=>vertexToPixel(v,54)),owner=view.state.players.players.find(p=>p.id===road.playerId);root.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#fff','stroke-width':10,'stroke-linecap':'round'}));root.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:colors[owner.color],'stroke-width':6,'stroke-linecap':'round'}));}
  for(const building of view.state.board.buildings){const p=vertexToPixel(building.vertex,54),owner=view.state.players.players.find(s=>s.id===building.playerId);root.append(svg('path',{d:building.type==='city'?`M${p.x-13},${p.y+9}v-11h8v-9h10v7h8v13z`:`M${p.x-9},${p.y+8}v-13l9,-7 9,7v13z`,fill:colors[owner.color],stroke:'#fff','stroke-width':2}));}
  const types=['PLACE_SETTLEMENT','PLACE_ROAD','MOVE_ROBBER',...(view.state.game.phase==='road-building'?['BUILD_ROAD']:[])];
  const phase=view.state.game.phase;
  el('cg-hint').textContent=phase.startsWith('setup-settlement')?'Tap a highlighted intersection to place your starting settlement.':phase.startsWith('setup-road')?'Tap a highlighted edge next to your new settlement.':phase==='robber-move'?'Tap a highlighted tile to move the robber.':phase==='road-building'?'Tap a highlighted road to place a free road.':mode?`Tap a highlighted location to ${mode.toLowerCase().replaceAll('_',' ')}.`:view.choices.length?'Choose an action below the board.':'Waiting for the next eligible player.';
  const choices=view.choices.filter(a=>types.includes(a.type)||(a.type===mode));
  for(const action of choices){
    const group=svg('g',{class:'catan-target',role:'button',tabindex:0,'data-game-control':'true','aria-label':`${label(action)} ${JSON.stringify(action.vertex||action.edge||action.hex)}`});
    if(action.edge){const[a,b]=getEdgeVertices(action.edge).map(v=>vertexToPixel(v,54));group.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'transparent','stroke-width':28}));group.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#fff','stroke-width':8,'stroke-dasharray':'5 4'}));}
    else{const p=action.vertex?vertexToPixel(action.vertex,54):axialToPixel(action.hex,54);group.append(svg('circle',{cx:p.x,cy:p.y,r:20,fill:'transparent'}));group.append(svg('circle',{cx:p.x,cy:p.y,r:7,fill:'#fff',stroke:'#1456db','stroke-width':3}));}
    const act=()=>{if(session.connection==='ready'&&!busy&&!pending())submit(action);};group.onclick=act;group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}};root.append(group);
  }
}
function renderGame(){
  el('cg-share').hidden=!packet?.roomId;
  if(packet?.roomId){const link=new URL(location.href);link.hash=`catan-online?room=${packet.roomId}`;el('cg-link').value=link.href;}
  if(!view){el('cg-status').textContent=packet?.status==='waiting'?'Waiting for your friend · share the invitation link':'Create a room or join your friend.';return;}
  const state=view.state,phase=state.game.phase,actor=state.game.currentPlayerId;
  el('cg-status').textContent=phase==='ended'?`${name(state.game.winnerId)} wins!`:`You: ${name(view.you)} · ${name(actor)} · ${phase.replaceAll('-',' ')}`;
  el('cg-roll').textContent=state.game.lastRoll?`Dice: ${state.game.lastRoll.die1} + ${state.game.lastRoll.die2} = ${state.game.lastRoll.total}`:'No dice rolled this turn.';
  board();el('cg-actions').replaceChildren();
  const spatial=['PLACE_SETTLEMENT','PLACE_ROAD','MOVE_ROBBER','BUILD_ROAD','BUILD_SETTLEMENT','BUILD_CITY'];
  for(const type of ['BUILD_ROAD','BUILD_SETTLEMENT','BUILD_CITY'])if(view.choices.some(a=>a.type===type)){const button=actionButton(type.toLowerCase().replaceAll('_',' '),null);button.onclick=()=>{mode=mode===type?'':type;board();controls();};button.setAttribute('aria-pressed',String(mode===type));el('cg-actions').append(button);}
  const selected=view.choices.filter(a=>['BANK_TRADE','PLAY_YEAR_OF_PLENTY','PLAY_MONOPOLY'].includes(a.type));
  const select=el('cg-select'),previous=select.value;select.replaceChildren();selected.forEach((a,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=label(a);select.append(option);});if(Number(previous)<selected.length)select.value=previous;
  el('cg-options').hidden=!selected.length;el('cg-selected').onclick=()=>submit(selected[Number(select.value)]);
  for(const action of view.choices)if(!spatial.includes(action.type)&&!selected.includes(action)&&action.type!=='DISCARD_RESOURCES')el('cg-actions').append(actionButton(label(action),action));
  const own=state.players.players.find(p=>p.id===view.you);el('cg-hand').hidden=false;el('cg-resources').textContent=resources.map(r=>`${r}: ${own.resources[r]}`).join(' · ');
  el('cg-cards').textContent=`Development cards: ${own.developmentCards.filter(c=>!c.isPlayed).map(c=>`${({knight:'Knight',victoryPoint:'Victory Point',roadBuilding:'Road Building',yearOfPlenty:'Year of Plenty',monopoly:'Monopoly'})[c.type]||c.type}${c.turnBought===state.game.turn?' (bought this turn)':''}`).join(', ')||'none'}`;
  el('cg-players').replaceChildren();
  for(const player of state.players.players){const card=document.createElement('article');card.className='catan-player';card.style.borderLeftColor=colors[player.color];const h=document.createElement('h3');h.textContent=`${player.name}${view.seats.find(s=>s.id===player.id).kind==='bot'?` · Bot (${view.seats.find(s=>s.id===player.id).level})`:''}`;const p=document.createElement('p');p.textContent=`${state.game.finalScores?.[player.id]??player.victoryPoints} VP · ${player.resourceCount} resources · ${player.devCardCount} development cards`;card.append(h,p);el('cg-players').append(card);}
  const discard=view.choices.find(a=>a.type==='DISCARD_RESOURCES');el('cg-discard').hidden=!discard;
  el('cg-discard-count').textContent=discard?`Discard exactly ${state.game.discardAmounts[view.you]} cards. Suggested quantities are shown.`:'';
  for(const r of resources){el(`cg-discard-${r}`).max=String(own.resources[r]);if(discard)el(`cg-discard-${r}`).value=String(discard.resources[r]||0);}
  const trading=phase==='main'&&actor===view.you&&!view.offer;el('cg-trade').hidden=!trading;
  const target=el('cg-trade-target'),old=target.value;target.replaceChildren();view.seats.filter(s=>s.id!==view.you).forEach(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=s.name;target.append(option);});if(view.seats.some(s=>s.id===old&&s.id!==view.you))target.value=old;
  el('cg-offer').hidden=!view.offer;el('cg-offer').replaceChildren();if(view.offer){const p=document.createElement('p');p.textContent=`${name(view.offer.from)} offers ${bundle(view.offer.give)} for ${bundle(view.offer.receive)} from ${name(view.offer.to)}. Respond using the buttons above.`;el('cg-offer').append(p);}
  el('cg-history').replaceChildren();for(const entry of view.history.slice(-12)){const li=document.createElement('li');li.textContent=`${name(entry.playerId)}: ${entry.message}`;el('cg-history').append(li);}
}
function bundle(value){return resources.filter(r=>value[r]).map(r=>`${value[r]} ${r}`).join(', ')||'nothing';}
function controls(){
  const blocked=!!busy||pending()||!navigator.onLine||session.connection!=='ready';
  for(const node of document.querySelectorAll('[data-game-control]')){if(node.tagName.toLowerCase()==='g'){node.setAttribute('aria-disabled',String(blocked));node.setAttribute('tabindex',blocked?'-1':'0');}else node.disabled=blocked;}
  for(const id of ['cg-selected'])el(id).disabled=blocked;
  for(const id of ['cg-create','cg-join-button'])el(id).disabled=!!busy||pending()||!navigator.onLine||!canAttempt(session,Date.now(),true);
  el('cg-retry').disabled=!!busy||!navigator.onLine||Date.now()<session.retryAt;
  el('cg-connection').dataset.state=session.connection;
  el('cg-connection').textContent=!navigator.onLine?'No network connection · internet game paused':busy?'Synchronizing with the game authority…':pending()?'Outcome unknown · the same command will be resolved before another move':session.connection==='backoff'?'Waiting before reconnecting…':session.connection==='ready'?(packet?.roomId?`Saved by the game service · revision ${packet.revision}`:'Internet connection available'):'Reconnect to synchronize before playing.';
}
function apply(data){
  if(!data)return;
  if(!data.ok){el('cg-error').textContent=data.error?.message||'The command could not be accepted.';return;}
  if(packet?.roomId===data.roomId&&packet.revision>data.revision)return;
  packet=data;view=data.view||null;
  const key=`${packet.roomId}:${packet.revision}:${packet.status}:${view?.you||''}`;if(key!==rendered){rendered=key;renderGame();}
}
function schedule(){clearTimeout(timer);if(!active()||!navigator.onLine||!canAttempt(session,Math.max(Date.now(),session.retryAt)))return;if(session.connection==='backoff'){timer=setTimeout(()=>work(),Math.min(2147483647,Math.max(1,session.retryAt-Date.now())));return;}if(pending()||packet?.status==='waiting'||packet?.status==='playing'||(!packet&&catanSaved().roomId))timer=setTimeout(()=>work(),5000);}
async function work(op,args,manual=false){
  if(busy||!active())return;clearTimeout(timer);
  if(!navigator.onLine){event({type:'DISCONNECT',pending:pending()});controls();return;}
  if(!canAttempt(session,Date.now(),manual)){controls();schedule();return;}
  el('cg-error').textContent='';event({type:'SYNC'});
  busy=(async()=>{try{const result=await catanCommand(op,args);apply(result);const latest=await readCatan();apply(latest);if(latest&&!latest.ok){event({type:'FAIL',code:['SESSION_EXPIRED','ROOM_NOT_FOUND','FORBIDDEN','SESSION_DELETED'].includes(latest.error?.code)?'SESSION_UNAVAILABLE':'PROTOCOL_ERROR',retryable:false,pending:pending(),now:Date.now(),jitter:0});}else event({type:'READY'});}catch(error){event({type:'FAIL',code:error.code||'PROTOCOL_ERROR',retryable:!!error.retryable,retryAfterMs:error.retryAfterMs,pending:pending(),now:Date.now(),jitter:Math.random()});el('cg-error').textContent=error.message;}})();
  controls();await busy;busy=null;if(!active()||!navigator.onLine)event({type:'DISCONNECT',pending:pending()});controls();schedule();
}
function submit(action){if(!action||!view||busy||pending()||session.connection!=='ready')return;work('command',{roomId:packet.roomId,expectedRevision:view.revision,action},true);}
function roomAction(op,args){if(packet?.roomId){replacement=()=>work(op,args,true);el('cg-replace').hidden=false;}else work(op,args,true);}
function route(){clearTimeout(timer);if(!active()){event({type:'DISCONNECT',pending:pending()});return;}const invitation=new URLSearchParams(location.hash.split('?')[1]||'').get('room');if(invitation)el('cg-room').value=invitation;controls();work();}
export async function prepareFullCatanUpdate(){if(busy)await busy;}
export function mountCatanOnline(){
  for(const r of resources){
    const row=document.createElement('label');row.textContent=`${r} `;const input=document.createElement('input');input.type='number';input.min='0';input.max='19';input.value='0';input.id=`cg-discard-${r}`;input.dataset.gameControl='true';row.append(input);el('cg-discard-fields').append(row);
    const tr=document.createElement('div');tr.className='trade-resource';const title=document.createElement('span');title.textContent=r;tr.append(title);
    for(const side of ['give','receive']){const label=document.createElement('label');label.textContent=side==='give'?'Give ':'Want ';const n=document.createElement('input');n.type='number';n.min='0';n.max='19';n.value='0';n.id=`cg-${side}-${r}`;n.dataset.gameControl='true';label.append(n);tr.append(label);}el('cg-trade-fields').append(tr);
  }
  for(const form of ['cg-discard','cg-trade'])el(form).querySelector('button').dataset.gameControl='true';
  el('cg-create').onclick=()=>roomAction('create',{name:el('cg-name').value.trim()||'Player',botLevel:el('cg-level').value});
  el('cg-join').onsubmit=e=>{e.preventDefault();const id=el('cg-room').value.trim();if(!/^[0-9a-f-]{36}$/i.test(id)){el('cg-error').textContent='Enter a valid room ID.';return;}roomAction('join',{roomId:id,name:el('cg-name').value.trim()||'Friend'});};
  el('cg-replace-yes').onclick=()=>{el('cg-replace').hidden=true;replacement?.();replacement=null;};el('cg-replace-no').onclick=()=>{el('cg-replace').hidden=true;replacement=null;};
  el('cg-retry').onclick=()=>work(undefined,undefined,true);
  el('cg-copy').onclick=async()=>{try{await navigator.clipboard.writeText(el('cg-link').value);}catch{el('cg-link').select();el('cg-error').textContent='Select and copy the invitation manually.';}};
  el('cg-discard').onsubmit=e=>{e.preventDefault();submit({type:'DISCARD_RESOURCES',resources:Object.fromEntries(resources.map(r=>[r,Number(el(`cg-discard-${r}`).value)]))});};
  el('cg-trade').onsubmit=e=>{e.preventDefault();submit({type:'TRADE_OFFER',to:el('cg-trade-target').value,give:Object.fromEntries(resources.map(r=>[r,Number(el(`cg-give-${r}`).value)])),receive:Object.fromEntries(resources.map(r=>[r,Number(el(`cg-receive-${r}`).value)]))});};
  window.addEventListener('hashchange',route);window.addEventListener('pageshow',route);document.addEventListener('visibilitychange',route);window.addEventListener('online',route);window.addEventListener('offline',()=>{clearTimeout(timer);event({type:'DISCONNECT',pending:pending()});controls();});
  route();controls();
}
