import { test, expect, chromium, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const address='http://127.0.0.1:4175/OpenCatan/hello/#catan-online';
async function client(page:Page,method:string,args:unknown[]=[]){for(let attempt=0;attempt<15;attempt++){const result=await page.evaluate(async({method,args})=>{
  const module=await import('/OpenCatan/hello/catan-online-transport.js');
  try{return await module[method](...args);}catch(error){return {failure:{code:error.code,message:error.message,retryAfterMs:error.retryAfterMs||0}};}
},{method,args});if(!result?.failure||!['RATE_LIMITED','NETWORK_UNAVAILABLE','SERVER_UNAVAILABLE'].includes(result.failure.code))return result;await new Promise(resolve=>setTimeout(resolve,Math.max(2000,result.failure.retryAfterMs||0)));}throw Error('Catan request retry budget exhausted');}
test('LIVE: two human identities and one managed bot finish a natural full Catan game',async({browserName},testInfo)=>{
  test.skip(process.env.PWA_CATAN_LIVE!=='1','Opt in: creates two real users, a room and plays a complete game.');
  test.setTimeout(900000);expect(browserName).toBe('chromium');
  const engine=await import(pathToFileURL(path.resolve('pwa-dist/hello/catan-runtime.js')).href);
  const browser=await chromium.launch({proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
  try{
    const a=await browser.newContext({viewport:{width:820,height:1180}}),b=await browser.newContext({viewport:{width:820,height:1180}}),x=await a.newPage(),y=await b.newPage();
    await x.goto(address);await x.locator('#cg-name').fill('Alice');await x.locator('#cg-create').click();await expect(x.locator('#cg-status')).toContainText('Waiting for your friend',{timeout:45000});
    const link=await x.locator('#cg-link').inputValue();await y.goto(link);await y.locator('#cg-name').fill('Bob');await y.locator('#cg-join-button').click();
    await expect(y.locator('#cg-players')).toContainText('Bot',{timeout:45000});
    await x.locator('#cg-retry').click();await expect(x.locator('#cg-players')).toContainText('Bot');
    let packet=await client(x,'readCatan'),commands=0,traded=false,reconnected=false;
    const pages:Record<string,Page>={p1:x,p2:y};
    while(packet.ok&&packet.status!=='ended'&&commands<1800){
      const shared=packet.view,phase=shared.state.game.phase;
      const actor=shared.offer?shared.offer.to:phase==='discard'?shared.state.game.pendingDiscard.find((id:string)=>id!=='p3'):shared.state.game.currentPlayerId;
      if(!pages[actor]){await new Promise(resolve=>setTimeout(resolve,5000));packet=await client(x,'readCatan');continue;}
      const page=pages[actor];packet=await client(page,'readCatan');
      if(packet.failure){await new Promise(resolve=>setTimeout(resolve,Math.max(1500,packet.failure.retryAfterMs)));packet=await client(page,'readCatan');continue;}
      if(!packet.ok)throw Error(JSON.stringify(packet.error));
      const view=packet.view;if(!view.choices.length){packet=await client(x,'readCatan');continue;}
      const serialized=JSON.stringify(view);expect(view).not.toHaveProperty('deck');
      for(const player of view.state.players.players)if(player.id!==actor){expect(Object.values(player.resources).every(n=>n===0)).toBe(true);expect(player.developmentCards).toEqual([]);}
      expect(serialized).not.toContain('access_token');
      let action;
      // Exercise a real mutually owned player trade if natural play presents one.
      if(!traded&&phase==='main'&&!view.offer){
        const other=actor==='p1'?'p2':'p1',otherView=await client(pages[other],'readCatan');
        if(otherView.ok){const own=view.state.players.players.find((p: {id:string})=>p.id===actor).resources,peer=otherView.view.state.players.players.find((p:{id:string})=>p.id===other).resources;
          const pair=engine.RESOURCES.flatMap((give:string)=>engine.RESOURCES.map((receive:string)=>({give,receive}))).find((p:{give:string;receive:string})=>p.give!==p.receive&&own[p.give]>0&&peer[p.receive]>0);
          if(pair){const empty=()=>({brick:0,lumber:0,ore:0,grain:0,wool:0});action={type:'TRADE_OFFER',to:other,give:{...empty(),[pair.give]:1},receive:{...empty(),[pair.receive]:1}};traded=true;}
        }
      }
      if(!action)action=view.offer&&view.offer.to===actor?view.choices.find((a:{type:string})=>a.type==='TRADE_ACCEPT')||engine.botDecision(view,'standard'):engine.botDecision(view,'standard');
      const result=await client(page,'catanCommand',['command',{roomId:packet.roomId,expectedRevision:view.revision,action}]);
      if(result.failure){await new Promise(resolve=>setTimeout(resolve,Math.max(1500,result.failure.retryAfterMs)));packet=await client(page,'catanCommand');if(packet.failure)throw Error(packet.failure.message);}
      else packet=result;
      if(!packet.ok&&packet.error.code==='REVISION_CONFLICT')packet=await client(page,'readCatan');
      if(!packet.ok)throw Error(JSON.stringify(packet.error));commands++;
      if(!reconnected&&commands>20){await a.setOffline(true);await x.reload();await expect(x.locator('#cg-connection')).toContainText('paused');await a.setOffline(false);await expect(x.locator('#cg-connection')).toHaveAttribute('data-state','ready',{timeout:45000});reconnected=true;}
      if(commands%20===0)console.log('Live Catan progress:',commands,'human commands, turn',packet.view.state.game.turn,'revision',packet.revision);
    }
    expect(packet.ok).toBe(true);expect(packet.status).toBe('ended');expect(packet.view.state.game.finalScores[packet.view.state.game.winnerId]).toBeGreaterThanOrEqual(10);
    await x.locator('#cg-retry').click();await y.locator('#cg-retry').click();
    await expect(x.locator('#cg-status')).toContainText('wins!');await expect(y.locator('#cg-status')).toContainText('wins!');
    await x.screenshot({path:testInfo.outputPath('full-catan-victory.png'),fullPage:true});
    console.log('Complete real managed game:',commands,'human commands; trade exercised:',traded);
  }finally{await browser.close();}
});
