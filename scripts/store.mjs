import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function check(value, message) { if (!value) throw new Error(message); }
function text(value, field) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= 30000, `Invalid ${field}`); }
function id(value) { check(typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), 'Invalid id'); }
function strings(value, field) { check(Array.isArray(value), `Invalid ${field}`); value.forEach(v => text(v, field)); }
function choice(value, options, field) { check(options.includes(value), `Invalid ${field}`); }
function sessionsValid(t) {
  if(t.sessions===undefined){check(t.primarySessionId===undefined,'Primary session must be linked');return;}
  check(Array.isArray(t.sessions)&&t.sessions.length<=100,'Invalid sessions');
  const ids=new Set();
  for(const s of t.sessions){
    check(typeof s.id==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(s.id),'Invalid session id');
    text(s.title,'session title');check(!ids.has(s.id),'Duplicate session');ids.add(s.id);
  }
  check(t.primarySessionId===undefined||ids.has(t.primarySessionId),'Primary session must be linked');
}
function modelValid(m) {
  check(m && typeof m === 'object', 'Missing model'); id(m.id);
  choice(m.kind, ['discrimination', 'connection'], 'kind');
  choice(m.status, ['draft', 'tested', 'disputed'], 'status');
  for (const k of ['title', 'rule', 'input', 'output', 'source']) text(m[k], k);
  for (const k of ['conditions', 'examples', 'counterexamples']) strings(m[k], k);
  if (m.kind === 'connection') text(m.relation, 'relation');
  if (m.diagram !== undefined) {
    check(m.diagram && typeof m.diagram === 'object' && !Array.isArray(m.diagram), 'Invalid diagram');
    if (m.diagram.outputCriteria !== undefined) text(m.diagram.outputCriteria, 'outputCriteria');
    check(Array.isArray(m.diagram.pairs) && m.diagram.pairs.length <= 30, 'Invalid diagram pairs');
    for (const p of m.diagram.pairs) {
      check(p && typeof p === 'object', 'Invalid diagram pair');
      for (const k of ['label', 'input', 'output', 'reason', 'source']) text(p[k], `diagram pair ${k}`);
    }
  }
}
export function validateArchive(a) {
  check(a?.schemaVersion === 1 && Number.isSafeInteger(a.revision) && a.revision >= 0 && Array.isArray(a.topics), 'Unsupported archive');
  const ids = new Set();
  for (const t of a.topics) {
    id(t.id); check(!ids.has(t.id), 'Duplicate topic'); ids.add(t.id);
    text(t.title, 'title'); text(t.goal, 'goal'); strings(t.sources, 'sources');
    check(Array.isArray(t.models) && Array.isArray(t.attempts) && Array.isArray(t.history), 'Invalid topic collections');
    t.models.forEach(modelValid);
    sessionsValid(t);
  }
  return a;
}
export function applyOperation(archive, op, now = new Date()) {
  validateArchive(archive);
  check(op && op.expectedRevision === archive.revision, `Revision conflict: current ${archive.revision}`);
  const a = structuredClone(archive), stamp = now.toISOString();
  if(op.type==='restore-empty'){
    check(a.topics.length===0,'Restore requires an empty archive');
    const imported=validateArchive(structuredClone(op.archive));
    check(!imported.isDemo,'Demo cannot be restored as learner evidence');
    for(const t of imported.topics){
      text(t.next,'next');
      for(const p of t.attempts){
        id(p.id);check(t.models.some(m=>m.id===p.modelId),'Unknown restored model');
        for(const k of ['question','answer','feedback','source','reviewer'])text(p[k],k);
        choice(p.support,['independent','hinted','explained'],'support');
        choice(p.context,['initial','new-context','delayed'],'context');
        choice(p.outcome,['correct','partial','incorrect','uncertain'],'outcome');
        check(Number.isFinite(Date.parse(p.occurredAt))&&Date.parse(p.occurredAt)<=now.getTime(),'Invalid restored time');
        check(Number.isInteger(p.modelVersion)&&p.modelVersion>0&&Array.isArray(p.annotations),'Invalid restored evidence');
      }
    }
    imported.revision=Math.max(a.revision,imported.revision)+1;imported.updatedAt=stamp;
    return imported;
  }
  if (op.type === 'create-topic') {
    const t = op.topic; check(t && typeof t === 'object', 'Missing topic'); id(t.id);
    check(!a.topics.some(x => x.id === t.id), 'Topic already exists');
    text(t.title, 'title'); text(t.goal, 'goal'); strings(t.sources, 'sources'); text(t.next, 'next');
    check(Array.isArray(t.models) && t.models.length === 0, 'Create an empty topic, then add models with provenance');
    sessionsValid(t);
    a.topics.push({id:t.id, title:t.title, goal:t.goal, sources:t.sources, models:[], attempts:[], next:t.next, history:[],sessions:t.sessions||[],...(t.primarySessionId?{primarySessionId:t.primarySessionId}:{})});
  } else {
    const t = a.topics.find(x => x.id === op.topicId); check(t, 'Unknown topic');
    if(op.type==='link-session'){
      sessionsValid({sessions:[op.session]});
      t.sessions??=[];
      const old=t.sessions.find(s=>s.id===op.session.id);
      if(old)old.title=op.session.title;else t.sessions.push({id:op.session.id,title:op.session.title});
      if(!t.primarySessionId||op.primary===true)t.primarySessionId=op.session.id;
    }else if(op.type==='unlink-session'){
      check(t.sessions?.some(s=>s.id===op.sessionId),'Session is not linked');
      t.sessions=t.sessions.filter(s=>s.id!==op.sessionId);
      if(t.primarySessionId===op.sessionId)delete t.primarySessionId;
    }else if(op.type==='set-primary-session'){
      check(t.sessions?.some(s=>s.id===op.sessionId),'Session is not linked');
      t.primarySessionId=op.sessionId;
    }else if (op.type === 'revise-model') {
      modelValid(op.model); text(op.author, 'author'); text(op.reason, 'reason');
      const before = t.models.find(x => x.id === op.model.id) ?? null;
      if (op.model.status === 'tested') check(t.attempts.some(x => x.modelId === op.model.id), 'No learner evidence for tested model');
      const m = { ...op.model, version:(before?.version ?? 0)+1 };
      if (before) t.models[t.models.indexOf(before)] = m; else t.models.push(m);
      t.history.push({type:'model', at:stamp, author:op.author, reason:op.reason, before, after:m});
    } else if (op.type === 'record-attempt') {
      const p = op.attempt; check(p && typeof p === 'object', 'Missing attempt'); id(p.id);
      check(!t.attempts.some(x => x.id === p.id), 'Attempt already exists');
      const model = t.models.find(x => x.id === p.modelId); check(model, 'Unknown model');
      for (const k of ['question', 'answer', 'feedback', 'source', 'reviewer']) text(p[k], k);
      choice(p.support, ['independent', 'hinted', 'explained'], 'support');
      choice(p.context, ['initial', 'new-context', 'delayed'], 'context');
      choice(p.outcome, ['correct', 'partial', 'incorrect', 'uncertain'], 'outcome');
      const time = Date.parse(p.occurredAt);
      check(Number.isFinite(time) && time <= now.getTime(), 'Invalid or future attempt time');
      if (p.context === 'delayed') {
        const old = t.attempts.find(x => x.id === p.retestOf && x.modelId === p.modelId);
        check(old && time - Date.parse(old.occurredAt) >= 86400000, 'Delayed retest needs same model and at least 24 hours');
      }
      t.attempts.push({...p, modelVersion:model.version, recordedAt:stamp, annotations:[]});
    } else if (op.type === 'annotate-attempt') {
      const p = t.attempts.find(x => x.id === op.attemptId); check(p, 'Unknown attempt');
      text(op.author, 'author'); text(op.note, 'note');
      p.annotations.push({at:stamp, author:op.author, note:op.note});
    } else if (op.type === 'set-next') {
      text(op.next, 'next'); text(op.author, 'author');
      t.history.push({type:'next', at:stamp, author:op.author, before:t.next, after:op.next}); t.next = op.next;
    } else throw new Error('Unknown operation');
  }
  a.revision++; a.updatedAt = stamp;
  return validateArchive(a);
}
export async function readArchive(root) { return validateArchive(JSON.parse(await readFile(join(root, 'data/archive.json'), 'utf8'))); }
export async function commit(root, op) {
  const data = join(root, 'data'), lock = join(data, '.archive.lock');
  let handle;
  try { handle = await open(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new Error('Archive is locked by another writer. Retry after it finishes; inspect stale locks before removing.'); throw e; }
  let temp;
  try {
    const old = await readArchive(root), next = applyOperation(old, op);
    await mkdir(join(data, 'history'), {recursive:true});
    await writeFile(join(data, 'history', `${old.revision}-${randomUUID()}.json`), JSON.stringify(old, null, 2), {flag:'wx'});
    temp = join(data, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(next, null, 2)+'\n', {flag:'wx'});
    await rename(temp, join(data, 'archive.json')); temp = undefined;
    return next;
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    await handle.close(); await unlink(lock);
  }
}
export function handoff(a) {
  return `# 学习交接\n\n档案版本：${a.revision}\n先加载 zhixing-learning 技能，以 zhixing_archive 读取的档案为准。\n\n` +
    (a.topics.length ? a.topics.map(t => `## ${t.title}\n目标：${t.goal}\n模型：${t.models.length}；真实作答：${t.attempts.length}\n下一步：${t.next}\n`).join('\n') : '尚无真实学习记录。先确定具体学习目标和材料。\n');
}
