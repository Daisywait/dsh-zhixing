import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyOperation, commit, readArchive } from '../scripts/store.mjs';
const empty=()=>({schemaVersion:1,revision:0,updatedAt:null,topics:[]});
const topic={id:'topic',title:'Test',goal:'Classify new cases',sources:['textbook'],models:[],next:'diagnose'};
const model={id:'model',kind:'discrimination',title:'Test model',rule:'Rule',conditions:['condition'],input:'cases',output:'classes',examples:[],counterexamples:[],source:'textbook',status:'draft'};
function base(){let a=applyOperation(empty(),{type:'create-topic',expectedRevision:0,topic});return applyOperation(a,{type:'revise-model',expectedRevision:1,topicId:'topic',model,author:'learner',reason:'initial proposal'});}
test('diagram material requires provenance and never creates learner evidence',()=>{
  const op={type:'revise-model',expectedRevision:2,topicId:'topic',model:{...model,diagram:{pairs:[{label:'example',input:'x',output:'y',reason:'rule',source:'assistant material'}]}},author:'codex',reason:'visual material'};
  const a=applyOperation(base(),op);
  assert.equal(a.topics[0].models[0].diagram.pairs[0].output,'y');
  assert.equal(a.topics[0].attempts.length,0);
  delete op.model.diagram.pairs[0].source;
  assert.throws(()=>applyOperation(base(),op),/source/);
});
const attempt={id:'attempt',modelId:'model',question:'Question?',answer:'Original answer',support:'independent',context:'initial',outcome:'incorrect',feedback:'Missed condition',source:'textbook',reviewer:'codex',occurredAt:'2026-09-05T00:00:00Z'};
test('rejects stale revision and fabricated tested state',()=>{
  const a=base();assert.throws(()=>applyOperation(a,{type:'set-next',expectedRevision:1,topicId:'topic',next:'x',author:'codex'}),/conflict/);
  assert.throws(()=>applyOperation(a,{type:'revise-model',expectedRevision:2,topicId:'topic',model:{...model,status:'tested'},author:'codex',reason:'guess'}),/No learner evidence/);
});
test('preserves original evidence, model version and disagreements',()=>{
  let a=base();a=applyOperation(a,{type:'record-attempt',expectedRevision:2,topicId:'topic',attempt});
  a=applyOperation(a,{type:'annotate-attempt',expectedRevision:3,topicId:'topic',attemptId:'attempt',author:'deepseek',note:'Needs source verification'});
  a=applyOperation(a,{type:'revise-model',expectedRevision:4,topicId:'topic',model:{...model,rule:'Revised'},author:'learner',reason:'counterexample'});
  assert.equal(a.topics[0].attempts[0].answer,'Original answer');assert.equal(a.topics[0].attempts[0].outcome,'incorrect');
  assert.equal(a.topics[0].attempts[0].modelVersion,1);assert.equal(a.topics[0].models[0].version,2);
  assert.equal(a.topics[0].history[1].before.rule,'Rule');assert.equal(a.topics[0].attempts[0].annotations.length,1);
});
test('delayed retests require elapsed time and matching evidence',()=>{
  let a=applyOperation(base(),{type:'record-attempt',expectedRevision:2,topicId:'topic',attempt},new Date('2026-09-05T02:00:00Z'));
  const op={type:'record-attempt',expectedRevision:3,topicId:'topic',attempt:{...attempt,id:'retest',context:'delayed',retestOf:'attempt',occurredAt:'2026-09-05T01:00:00Z'}};
  assert.throws(()=>applyOperation(a,op,new Date('2026-09-06T02:00:00Z')),/24 hours/);
  op.attempt.occurredAt='2026-09-06T01:00:00Z';assert.equal(applyOperation(a,op,new Date('2026-09-06T02:00:00Z')).revision,4);
  op.attempt.occurredAt='2027-01-01T00:00:00Z';assert.throws(()=>applyOperation(a,op,new Date('2026-09-06T02:00:00Z')),/future/);
});
test('diagnosis preserves its evidence and history without inventing attempts',()=>{
  let a=base();
  const diagnosis={modelId:'model',gap:'Need a concrete example',basisType:'prior',basis:'No response yet',attemptIds:[],material:'Worked example'};
  const next=d=>({type:'set-next',expectedRevision:a.revision,topicId:'topic',author:'assistant',next:'Compare examples',diagnosis:d});
  a=applyOperation(a,next(diagnosis));
  assert.equal(a.topics[0].attempts.length,0);
  assert.throws(()=>applyOperation(a,next({...diagnosis,basisType:'attempts'})),/basisType/);
  assert.throws(()=>applyOperation(a,next({...diagnosis,basisType:'attempts',attemptIds:['missing']})),/evidence/);
  assert.throws(()=>applyOperation(a,next({...diagnosis,modelId:'missing'})),/model/);
  a=applyOperation(a,{type:'record-attempt',expectedRevision:a.revision,topicId:'topic',attempt});
  a=applyOperation(a,next({...diagnosis,basisType:'attempts',attemptIds:['attempt'],basis:'Missed condition'}));
  assert.equal(a.topics[0].history.at(-1).beforeDiagnosis.basisType,'prior');
  assert.equal(a.topics[0].diagnosis.basisType,'attempts');
  assert.equal(a.topics[0].attempts.length,1);
  const restored=applyOperation(empty(),{type:'restore-empty',expectedRevision:0,archive:a});
  assert.deepEqual(restored.topics[0].diagnosis,a.topics[0].diagnosis);
  a=applyOperation(a,next(undefined));
  assert.equal(a.topics[0].diagnosis,undefined);
  assert.equal(a.topics[0].history.at(-1).beforeDiagnosis.basisType,'attempts');
});
test('concurrent writers cannot overwrite each other; backups remain readable',async()=>{
  const root=await mkdtemp(join(tmpdir(),'learning-lab-test-'));
  try {
    await mkdir(join(root,'data'));await writeFile(join(root,'data/archive.json'),JSON.stringify(empty()));
    const op={type:'create-topic',expectedRevision:0,topic};
    const results=await Promise.allSettled([commit(root,op),commit(root,op)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal((await readArchive(root)).revision,1);
    const files=await readdir(join(root,'data/history'));assert.equal(files.length,1);
    assert.equal(JSON.parse(await readFile(join(root,'data/history',files[0]),'utf8')).revision,0);
    assert.ok(!(await readdir(join(root,'data'))).includes('.archive.lock'));
  } finally {await rm(root,{recursive:true,force:true});}
});
