import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialize,archiveAction,emptyArchive} from '../lib/storage.js';
import {apply,makeHandler} from '../lib/index.js';
import {applyOperation} from '../scripts/store.mjs';

test('fresh installation, persistent data and empty-only migration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'zhixing-'));
  try{
    await initialize(root);
    const source=applyOperation(emptyArchive(),{type:'create-topic',expectedRevision:0,topic:{id:'test',title:'Test',goal:'Reason',sources:['text'],models:[],next:'Question'}});
    await archiveAction(root,'apply',JSON.stringify({type:'restore-empty',expectedRevision:0,archive:source}));
    assert.equal((await initialize(root)).topics[0].title,'Test');
    await assert.rejects(()=>archiveAction(root,'apply',JSON.stringify({type:'restore-empty',expectedRevision:2,archive:source})),/empty/);
    assert.throws(()=>applyOperation(emptyArchive(),{type:'restore-empty',expectedRevision:0,archive:{...source,isDemo:true}}),/Demo/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('plugin registers native skill, tool and portable same-origin routes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'zhixing-plugin-'));
  const previous=process.env.DSH_ZHIXING_HOME;process.env.DSH_ZHIXING_HOME=root;
  try{
    const registered={};
    let denial;
    await apply({connection:{requestRejection:()=>denial},skills:{register:x=>registered.skill=x},tools:{register:x=>registered.tool=x},webServer:{register:x=>{registered.route=x;return ()=>{};}},effect:f=>f()});
    assert.equal(registered.skill.name,'zhixing-learning');
    assert.equal(registered.tool.name,'zhixing_archive');
    assert.equal(registered.route.path,'/api/zhixing');
    assert.ok(!registered.skill.content.includes('C:/Users/'));
    const response={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}};
    await registered.route.handler({method:'GET',url:'/api/zhixing/api/archive',socket:{remoteAddress:'127.0.0.1'}},response);
    assert.equal(JSON.parse(response.body).revision,0);
    assert.match(response.headers['Content-Security-Policy'],/frame-ancestors 'self'/);
    await registered.route.handler({method:'GET',url:'/api/zhixing/../../.credentials.yaml',socket:{remoteAddress:'127.0.0.1'}},response);
    assert.equal(response.status,404);
    await registered.route.handler({method:'POST',url:'/api/zhixing/api/archive',socket:{remoteAddress:'127.0.0.1'}},response);
    assert.equal(response.status,405);
    await registered.route.handler({method:'GET',url:'/api/zhixing/api/archive',socket:{remoteAddress:'192.168.1.2'}},response);
    assert.equal(response.status,403);
    denial=401;
    await registered.route.handler({method:'GET',url:'/api/zhixing/api/archive',socket:{remoteAddress:'127.0.0.1'}},response);
    assert.equal(response.status,401);
  }finally{if(previous===undefined)delete process.env.DSH_ZHIXING_HOME;else process.env.DSH_ZHIXING_HOME=previous;await rm(root,{recursive:true,force:true});}
});
