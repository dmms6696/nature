import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../zep/main.js',import.meta.url),'utf8');
function harness(diagnostics=false){
 const handlers:Record<string,Function>={}, messages:string[]=[], links:string[]=[], timers:Function[]=[], requests:unknown[]=[];
 const event=(name:string)=>({Add:(fn:Function)=>{handlers[name]=fn;}});
 const player={name:'가상 학생',id:'test-id',showAlert:(s:string)=>messages.push(s),showCenterLabel:(s:string)=>messages.push(s),sendMessage:(s:string)=>messages.push(s),openWebLink:(url:string)=>links.push(url)};
 const app={onTriggerObject:event('trigger'),onStart:event('start'),onJoinPlayer:event('join'),addOnKeyDown:(key:number,fn:Function)=>{handlers['key'+key]=fn;},sayToAll:(s:string)=>messages.push(s),runLater:(fn:Function)=>timers.push(fn),httpPostJson:(_url:string,_headers:unknown,body:unknown,callback:Function)=>{requests.push(body);callback(JSON.stringify({ok:true,url:'https://example.com/#launch=test-token'}));}};
 runInNewContext(source.replace('diagnostics: false','diagnostics: '+diagnostics),{App:app});return {handlers,messages,links,timers,requests,player,app};
}
test('ZEP 공개 스크립트: 여섯 식별 키를 올바른 서버 화면으로 연결',()=>{const h=harness();const mapping={submit_potato:'potato',submit_branch:'branch',submit_flower:'flower',submit_rooster:'rooster',check_progress:'progress',open_group:'group'};for(const [key,route] of Object.entries(mapping)){h.handlers.trigger(h.player,3,10,10,key);assert.equal((h.requests.at(-1) as {route:string}).route,route);}assert.equal(h.links.length,6);assert.ok(!('key81' in h.handlers));});
test('ZEP 진단: 빈 키를 안내하고 Q키로 독립 서버 연결 시험',()=>{const h=harness(true);h.handlers.start();h.handlers.join(h.player);h.handlers.trigger(h.player,3,10,10,undefined);assert.ok(h.messages.some(s=>s.includes('key=(비어 있음)')));assert.equal(h.requests.length,0);h.handlers.key81(h.player);assert.equal((h.requests[0] as {route:string}).route,'progress');assert.equal(h.links.length,1);});
test('ZEP 요청 실패·응답 시간 초과는 조용히 멈추지 않고 재시도 가능',()=>{const h=harness(true);h.app.httpPostJson=()=>{throw new Error('network');};h.handlers.key81(h.player);assert.ok(h.messages.some(s=>s.includes('서버 통신을 시작하지 못했습니다')));h.app.httpPostJson=()=>{};h.handlers.key81(h.player);h.timers.at(-1)!();assert.ok(h.messages.some(s=>s.includes('15초 동안 서버 응답이 없습니다')));h.handlers.key81(h.player);assert.equal(h.messages.filter(s=>s.includes('연결 중입니다. 잠시')).length,0);});
