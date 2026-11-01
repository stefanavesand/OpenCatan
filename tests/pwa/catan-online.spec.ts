import { test, expect, type BrowserContext, type Route } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const address='http://127.0.0.1:4175/OpenCatan/hello/#catan-online';
const root='https://ppaixjqaixwnebhxfjeb.supabase.co';
const endpoint='https://stefan-game-shelf.lovable.app/api/public/catan';
const roomId='22222222-2222-4222-8222-222222222222';
async function backend(){
  const engine=await import(pathToFileURL(path.resolve('pwa-dist/hello/catan-runtime.js')).href);
  let game=null,host='',guest='',serial=0,seed=1,dropReply=false;
  const attempts=new Map<string,number>();
  const receipts=new Map<string,{hash:string;revision:number}>();
  const context={randomInt:(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);},now:()=>1000,id:()=>`generated-${++serial}`};
  const seats=[{id:'p1',name:'Alice',kind:'human',level:'standard'},{id:'p2',name:'Bob',kind:'human',level:'standard'},{id:'p3',name:'Bot',kind:'bot',level:'standard'}];
  const drain=()=>{for(let i=0;game&&i<24;i++){if(!engine.eligibleActors(game).includes('p3'))break;game=engine.applyCatan(game,'p3',engine.botDecision(engine.catanView(game,'p3'),'standard'),context);}};
  async function attach(browser:BrowserContext,identity:string){const handle=async (route:Route)=>{
    const request=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    if(request.url().includes('/auth/')){await route.fulfill({headers,json:{access_token:identity,refresh_token:`refresh-${identity}`,user:{id:identity},expires_at:9999999999}});return;}
    if(request.url()!==endpoint){await route.abort();return;}
    const body=request.postDataJSON();let error='',receipt;
    if(body.op==='create'){host=identity;}
    else if(body.op==='join'){
      if(body.roomId!==roomId)error='ROOM_NOT_FOUND';else if(guest&&guest!==identity&&host!==identity)error='ROOM_FULL';else if(identity!==host){guest=identity;if(!game){game=engine.newCatan(roomId,seats,context);game.revision=1;}}
    }else if(identity!==host&&identity!==guest)error='FORBIDDEN';
    else if(body.op==='command'){
      const key=`${identity}:${body.commandId}`,hash=JSON.stringify(body),prior=receipts.get(key);attempts.set(key,(attempts.get(key)||0)+1);
      if(prior){if(prior.hash!==hash)error='COMMAND_ID_CONFLICT';else receipt={commandId:body.commandId,accepted:true,duplicate:true,revision:prior.revision};}
      else if(!game||body.expectedRevision!==game.revision)error='REVISION_CONFLICT';
      else{try{game=engine.applyCatan(game,identity===host?'p1':'p2',body.action,context);receipts.set(key,{hash,revision:game.revision});receipt={commandId:body.commandId,accepted:true,revision:game.revision};}catch{error='ILLEGAL_ACTION';}}
    }
    drain();const you=identity===host?'p1':'p2';
    if(dropReply&&body.op==='command'&&!error){dropReply=false;await route.abort('failed');return;}
    await route.fulfill({headers,json:error?{ok:false,apiVersion:1,error:{code:error,message:error==='ROOM_FULL'?'The room already has two human players.':error}}:{ok:true,apiVersion:1,roomId,status:game?(game.state.game.phase==='ended'?'ended':'playing'):'waiting',you,revision:game?.revision||0,members:seats,view:game?engine.catanView(game,you):null,receipt}});
  };await browser.route(`${root}/**`,handle);await browser.route(endpoint,handle);}
  return {attach,view:(actor:string)=>engine.catanView(game,actor),engine,drop:()=>{dropReply=true;},attempts,receipts};
}
test('two human browsers create/join Catan with a managed bot and resume their seats',async({browser})=>{
  const service=await backend(),a=await browser.newContext(),b=await browser.newContext();
  try{
    await service.attach(a,'alice');await service.attach(b,'bob');const x=await a.newPage(),y=await b.newPage();
    await x.goto(address);await x.locator('#cg-create').click();await expect(x.locator('#cg-status')).toContainText('Waiting for your friend');
    const invitation=await x.locator('#cg-link').inputValue();await y.goto(invitation);await y.locator('#cg-join-button').click();await expect(y.locator('#cg-players')).toContainText('Bot');
    await x.locator('#cg-retry').click();await expect(x.locator('#cg-players')).toContainText('Bot');
    for(let moves=0;moves<8;moves++){
      const xv=service.view('p1'),yv=service.view('p2'),page=xv.choices.length?x:y,view=xv.choices.length?xv:yv;
      if(!view.choices.length)break;
      await page.locator('#cg-retry').click();await expect(page.locator('#cg-connection')).toHaveAttribute('data-state','ready');
      const target=page.locator('#cg-board [role=button]').first();await expect(target).toBeVisible();if(moves===0)service.drop();await target.click();
      if(moves===0){
        await expect(page.locator('#cg-connection')).toContainText('Outcome unknown');
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('game-shelf-catan-online-v1')).pending);
        expect(saved.body.commandId).toBeTruthy();await page.reload();await expect(page.locator('#cg-connection')).toHaveAttribute('data-state','ready');
        const key=`${page===x?'alice':'bob'}:${saved.body.commandId}`;expect(service.attempts.get(key)).toBe(2);expect(service.receipts.has(key)).toBe(true);
      }
      await expect(page.locator('#cg-board')).not.toHaveAttribute('data-revision',String(view.revision));
    }
    await x.reload();await expect(x.locator('#cg-connection')).toHaveAttribute('data-state','ready');await expect(x.locator('#cg-status')).toContainText('Alice');
    await a.setOffline(true);await expect(x.locator('#cg-connection')).toContainText('paused');await a.setOffline(false);await expect(x.locator('#cg-connection')).toHaveAttribute('data-state','ready');
  }finally{await a.close();await b.close();}
});
