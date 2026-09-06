import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import vm from 'node:vm';
import {applyOperation,validateArchive} from '../scripts/store.mjs';
import {emptyArchive,initialize} from '../lib/storage.js';
import {makeHandler} from '../lib/index.js';

const topic={id:'probability',title:'Probability',goal:'Understand',sources:[],models:[],next:'First question'};
test('session association lifecycle preserves evidence and survives migration',()=>{
  let a=applyOperation(emptyArchive(),{type:'create-topic',expectedRevision:0,topic});
  const apply=op=>a=applyOperation(a,{...op,topicId:topic.id,expectedRevision:a.revision});
  apply({type:'link-session',session:{id:'chat-1',title:'First'}});
  apply({type:'link-session',session:{id:'chat-2',title:'Second'}});
  apply({type:'link-session',session:{id:'chat-2',title:'Renamed'}});
  assert.equal(a.topics[0].sessions.length,2);
  assert.equal(a.topics[0].primarySessionId,'chat-1');
  apply({type:'set-primary-session',sessionId:'chat-2'});
  const restored=applyOperation(emptyArchive(),{type:'restore-empty',expectedRevision:0,archive:a});
  assert.deepEqual(restored.topics[0].sessions,a.topics[0].sessions);
  apply({type:'unlink-session',sessionId:'chat-2'});
  assert.equal(a.topics[0].primarySessionId,undefined);
  assert.equal(a.topics[0].sessions[0].id,'chat-1');
  assert.deepEqual(a.topics[0].attempts,[]);
  assert.throws(()=>apply({type:'set-primary-session',sessionId:'deleted'}),/not linked/);
  assert.throws(()=>validateArchive({...a,topics:[{...a.topics[0],primarySessionId:'missing'}]}),/must be linked/);
  assert.throws(()=>applyOperation(a,{type:'unlink-session',expectedRevision:0,topicId:topic.id,sessionId:'chat-1'}),/Revision conflict/);
});

test('metadata endpoint requires authentication and same-origin JSON and rejects evidence writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'zhixing-sessions-'));
  try{
    await initialize(root);
    const call=async(op,origin='http://localhost:3080',authorized=true)=>{
      const req=Readable.from([JSON.stringify(op)]);
      Object.assign(req,{method:'POST',url:'/api/zhixing/api/sessions',socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3080',origin,'content-type':'application/json'}});
      const res={setHeader(){},writeHead(s){this.status=s;},end(b){this.body=b;}};
      await makeHandler(root,(_,r)=>{if(authorized)return true;r.writeHead(401);r.end();return false;})(req,res);return res;
    };
    const op={type:'create-topic',expectedRevision:0,topic};
    assert.equal((await call(op,'https://example.com')).status,403);
    assert.equal((await call(op,undefined,false)).status,401);
    assert.equal((await call({type:'record-attempt'})).status,400);
    assert.equal((await call(op)).status,200);
    assert.equal((await call(op)).status,409);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('dsh bridge creates an independent session and preserves drafts without sending',async()=>{
  let plugin,View,props,listener,creates=0,opened,view;
  const child={postMessage:message=>replies.push(message)},replies=[];
  const drafts={old:'Existing draft'};
  const snapshot={ids:['old'],byId:{old:{id:'old',cwd:'/work',displayTitle:'Original'}}};
  const binding=id=>({ctx:{id},session:{rename:async()=>({})}});
  const ctx={slots:{inject:(_,f)=>f(),register:(spec,component)=>{props=spec.inject('old');View=component;}},
    sessions:{list:{getSnapshot:()=>snapshot},refresh:async()=>{},binding,open:id=>opened=id,
      create:async opts=>{creates++;assert.equal(opts.cwd,'/work');assert.ok(opts.sessionId);snapshot.ids.push(opts.sessionId);snapshot.byId[opts.sessionId]={id:opts.sessionId};return opts.sessionId;}},
    conversation:{input:{for:scope=>({state:{getSnapshot:()=>({draft:drafts[scope.id]||''})},setDraft:text=>drafts[scope.id]=text,notify(){}})}}};
  const React={createElement:()=>null,useRef:()=>({current:{contentWindow:child}}),useEffect:f=>f()};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{
    window:{__ModuleLoader__:{load:m=>plugin=m.factory(()=>React)},addEventListener:(_,fn)=>listener=fn,removeEventListener(){}},
    location:{origin:'http://localhost:3080'},crypto:globalThis.crypto});
  plugin.apply(ctx);View({...props,openView:id=>view=id});
  const request=async(action,payload,origin='http://localhost:3080')=>listener({origin,source:child,data:{type:'zhixing:request',requestId:'request',action,payload}});
  await request('create',{key:'topic-a',title:'Study'},'https://example.com');assert.equal(creates,0);
  await request('create',{key:'topic-a',title:'Study'});const target=replies.at(-1).result.id;
  await request('create',{key:'topic-a',title:'Study'});assert.equal(creates,1);
  assert.notEqual(target,'old');assert.equal(drafts.old,'Existing draft');assert.equal(opened,undefined);
  drafts[target]='Unsent note';await request('practice',{sessionId:target,text:'Learn'});
  assert.equal(drafts[target],'Unsent note\n\nLearn');assert.equal(opened,target);assert.equal(view,'chat');
  await request('open',{sessionId:'missing'});assert.ok(replies.at(-1).error);
});
