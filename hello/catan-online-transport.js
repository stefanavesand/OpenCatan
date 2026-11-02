import { identity, OnlineError } from './online-transport.js';
import { retryAfter } from './session-state.js';
const ENDPOINT = 'https://stefan-game-shelf.lovable.app/api/public/catan';
const KEY = 'sb_publishable_i1LT3xs1l0Fm0ozPVlo7pA_HBfIbcoq';
const STORE = 'game-shelf-catan-online-v1';
export function catanSaved() {
  try {
    const value = localStorage.getItem(STORE);
    const state = value ? JSON.parse(value) : { schemaVersion: 1, roomId: null, pending: null };
    if (state.schemaVersion !== 1) throw new OnlineError('This online Catan save requires a compatible app.', 'UNSUPPORTED_VERSION');
    return state;
  } catch(error) { if(error instanceof OnlineError) throw error; throw new OnlineError('Online Catan data could not be read. Original data has been kept.', 'STORAGE_FAILURE'); }
}
function save(state) { try { localStorage.setItem(STORE,JSON.stringify(state)); } catch { throw new OnlineError('The browser could not save the pending command. Fix storage before continuing.','STORAGE_FAILURE'); } }
async function request(body, session) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(ENDPOINT,{method:'POST',cache:'no-store',signal:controller.signal,headers:{apikey:KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(response.status===429) throw new OnlineError('The game service is busy. Wait before retrying.','RATE_LIMITED',true,retryAfter(response.headers.get('Retry-After'),Date.now()));
    if(response.status===401||response.status===403) throw new OnlineError('Player sign-in could not be verified. Your identity has been kept.','AUTH_REQUIRED');
    if(response.status>=500) throw new OnlineError('The game service is temporarily unavailable. The same command will be retried.','SERVER_UNAVAILABLE',true);
    let data;try {data=await response.json();}catch{throw new OnlineError('Unreadable response. Your pending command has been kept.','PROTOCOL_ERROR');}
    if(data?.apiVersion!==1||typeof data.ok!=='boolean') throw new OnlineError('The game service requires a compatible app version.','UNSUPPORTED_VERSION');
    if(!data.ok&&typeof data.error?.code==='string')data.error.code=data.error.code.toUpperCase();
    if(data.view&&(data.view.apiVersion!==1||data.view.engineVersion!=='1.0.0'||!Number.isSafeInteger(data.view.revision))) throw new OnlineError('This Catan rules version is not supported by the app.','UNSUPPORTED_VERSION');
    return data;
  } catch(error) { if(error instanceof OnlineError)throw error;throw new OnlineError('Cannot reach the Catan service. Your pending command has been kept.','NETWORK_UNAVAILABLE',true); }
  finally {clearTimeout(timer);}
}
export async function catanCommand(op, args={}) {
  const execute=async()=>{
    const state=catanSaved();if(!op&&!state.pending)return null;
    const session=await identity({allowCreate:!state.roomId&&!state.pending});let pending=state.pending;
    if(!pending) {pending={principalId:session.user.id,body:{apiVersion:1,op,...args,commandId:crypto.randomUUID()}};save({...state,pending});}
    if(pending.principalId!==session.user.id)throw new OnlineError('The pending command belongs to another identity.','AUTH_REQUIRED');
    const data=await request(pending.body,session);
    if(!data.ok&&['AUTH_REQUIRED','UNAUTHENTICATED','UNSUPPORTED_VERSION','SERVER_UNAVAILABLE'].includes(data.error?.code))throw new OnlineError(data.error.message,data.error.code,data.error.code==='SERVER_UNAVAILABLE');
    save({schemaVersion:1,roomId:data.ok?data.roomId:state.roomId,pending:null});return data;
  };
  return navigator.locks?navigator.locks.request('game-shelf-catan-command',execute):execute();
}
export async function readCatan() {
  const state=catanSaved();if(!state.roomId)return null;
  return request({apiVersion:1,op:'view',roomId:state.roomId},await identity({allowCreate:false}));
}
