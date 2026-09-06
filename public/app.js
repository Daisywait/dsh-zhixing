const $ = s => document.querySelector(s);
const embedded=new URLSearchParams(location.search).has('embedded');
const apiPath=path=>new URL(path.replace(/^\//,''),new URL('./',location.href)).href;
if(embedded)document.body.classList.add('embedded');
const state = {data:null, mode:'archive', topic:null, model:null, tab:'models', view:'learn', part:'rule', pair:0, filter:'all'};
const names = {draft:'当前草案', tested:'已有验证', disputed:'待核实', independent:'独立作答', hinted:'有提示', explained:'讲解后作答', initial:'初次诊断', 'new-context':'新情境', delayed:'延后复测', correct:'答对', partial:'部分正确', incorrect:'答错', uncertain:'待核实', discrimination:'判别模型', connection:'联结模型'};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge = (v, cls='') => `<span class="badge ${cls}">${esc(names[v] ?? v)}</span>`;
const date = v => v ? new Date(v).toLocaleString('zh-CN',{hour12:false}) : '尚未开始';
const list = a => a.length ? `<ul>${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="source">尚未记录</span>';
const starter = '请使用 zhixing-learning 技能开始学习。先读取共享学习档案。帮我把学习目标转化为可判别或可预测的具体任务，然后用一道题诊断，每次等待我回答。不要提前给出答案；真实作答后再更新档案。';
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const chrome = (title, name, extra='') => `<div class="window-bar"><span>${icon(name)}${title}</span>${extra}</div>`;
function icons(){window.lucide?.createIcons({attrs:{width:17,height:17,'stroke-width':1.6}});}
function preference(k,v){try{if(v!==undefined)localStorage.setItem('learning.worktable.'+k,v);return localStorage.getItem('learning.worktable.'+k);}catch{return null;}}
document.documentElement.dataset.theme=preference('theme')||'dark';
document.body.classList.toggle('collapsed',preference('collapsed')==='true');
document.body.classList.toggle('focused',preference('focused')==='true');
$('#overview').setAttribute('aria-label','我的学习');
$('#overview').title='我的学习';
$('#overview span').textContent='我的学习';
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,2500);}
const requests=new Map();
let hostSessions=null,busy=false,newTopic=false;
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='zhixing:response')return;
  const pending=requests.get(e.data.requestId);if(!pending)return;
  requests.delete(e.data.requestId);clearTimeout(pending.timer);
  e.data.error?pending.reject(new Error(e.data.error)):pending.resolve(e.data.result);
});
function host(action,payload={}){
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID(),timer=setTimeout(()=>{requests.delete(requestId);reject(new Error('dsh 连接超时，请重试'));},30000);
    requests.set(requestId,{resolve,reject,timer});parent.postMessage({type:'zhixing:request',requestId,action,payload},location.origin);
  });
}
async function saveSession(op){
  const response=await fetch(apiPath('/api/sessions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...op,expectedRevision:state.data.revision})});
  if(!response.ok){await load();throw new Error('关联未保存，请刷新后重试');}
  state.data=await response.json();render();
}
function sessionSection(t){
  if(!embedded||state.mode==='demo'||!t)return '';
  return `<details class="related-sessions"><summary>相关会话 · ${t.sessions?.length||0}</summary><div class="session-links">${(t.sessions||[]).map(s=>{
    const live=hostSessions?.sessions.find(x=>x.id===s.id),missing=hostSessions&&!live;
    return `<div class="session-row"><button data-session-open="${esc(s.id)}" ${missing?'disabled':''}>${icon('messages-square')}<span>${esc(live?.title||s.title)}<small>${missing?'会话不可用 · 需要重新关联':s.id===t.primarySessionId?'主要学习会话':''}</small></span></button><button class="icon-button" data-session-primary="${esc(s.id)}" title="设为主要会话" aria-label="设为主要会话" ${missing||s.id===t.primarySessionId?'disabled':''}>${icon('pin')}</button><button class="icon-button" data-session-unlink="${esc(s.id)}" title="解除关联" aria-label="解除关联">${icon('unlink')}</button></div>`;
  }).join('')||'<p class="source">尚未关联会话</p>'}</div><button id="link-session">${icon('plus')}关联会话</button></details>`;
}
async function chooseSession(t,onChoose){
  hostSessions=await host('list');
  const dialog=document.createElement('dialog');dialog.className='session-dialog';
  dialog.innerHTML=`<form method="dialog" class="dialog-heading"><h2>选择学习会话</h2><button class="icon-button" aria-label="关闭" title="关闭">${icon('x')}</button></form><button id="session-create">${icon('plus')}新建独立会话</button><label for="session-search">已有会话</label><input id="session-search" type="search" placeholder="搜索会话标题"><div class="session-options"></div><p role="status" class="source"></p>`;
  document.body.append(dialog);
  const draw=()=>{const query=dialog.querySelector('input').value.toLowerCase();dialog.querySelector('.session-options').innerHTML=hostSessions.sessions.filter(s=>s.title.toLowerCase().includes(query)).map(s=>`<button data-choose="${esc(s.id)}">${icon('message-circle')}<span>${esc(s.title)}${s.id===hostSessions.currentId?'<small>当前会话</small>':''}</span></button>`).join('')||'<p>没有匹配的会话</p>';icons();};
  draw();dialog.querySelector('input').oninput=draw;
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  let choosing=false;
  dialog.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button||choosing||(!button.dataset.choose&&button.id!=='session-create'))return;
    choosing=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const session=button.id==='session-create'?await host('create',{key:t.id,title:t.title}):hostSessions.sessions.find(s=>s.id===button.dataset.choose);
      await onChoose(session);dialog.close();
    }catch(error){dialog.querySelector('[role=status]').textContent=error.message;}
    finally{choosing=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
  dialog.showModal();
}
async function sendPrompt(text){
  if(embedded&&parent!==window){
    const t=state.mode==='archive'?state.data.topics.find(x=>x.id===state.topic):null;
    if(!t){toast('请先在真实学习空间创建学习主题');return;}
    text+=` 学习主题 ID：${t.id}，请沿用该主题。`;
    hostSessions=await host('list');
    if(t.primarySessionId&&hostSessions.sessions.some(s=>s.id===t.primarySessionId))return host('practice',{sessionId:t.primarySessionId,text});
    return chooseSession(t,async session=>{await saveSession({type:'link-session',topicId:t.id,session,primary:true});await host('practice',{sessionId:session.id,text});});
  }
  await navigator.clipboard.writeText(text);toast('学习请求已复制');
}
function learningHome(t){
  const attempts=t?.attempts||[],last=attempts.at(-1);
  $('#content').innerHTML=`<div class="learning-home"><div class="home-nav"><strong>${icon('book-open')}知行</strong><div><button id="new-topic" class="icon-button" title="新建学习主题" aria-label="新建学习主题">${icon('plus')}</button><button data-view="map">${icon('workflow')}我的理解</button></div></div>
    ${state.data.topics.length>1?`<label for="home-topic">学习主题</label><select id="home-topic">${state.data.topics.map(x=>`<option value="${esc(x.id)}" ${x.id===state.topic?'selected':''}>${esc(x.title)}</option>`).join('')}</select>`:''}
    <div class="learning-intro"><span class="eyebrow">${t?'继续上次的学习':'新的开始'}</span><h1>${esc(t?.title||'今天想弄明白什么？')}</h1>${t?`<p>${esc(t.goal)}</p>`:''}</div>
    ${t?`<div class="current-task"><span class="task-label">接下来</span><h2>${esc(t.next)}</h2><button class="primary" id="copy-next">${icon('play')}继续练一题</button></div>`:`<form id="start-learning"><label for="learning-goal">一个问题、一个概念，或者你想做成的事</label><textarea id="learning-goal" rows="3" required maxlength="2000" placeholder="例如：为什么我总分不清负强化和惩罚？"></textarea><button class="primary" type="submit">${icon('arrow-right')}从这里开始</button></form>`}
    ${!t&&embedded?'<button id="start-existing">关联已有会话开始</button>':''}${sessionSection(t)}
    <div class="learning-route" aria-label="学习过程"><span class="current">${icon('message-circle-question')}试着回答</span>${icon('arrow-right')}<span>${icon('scan-line')}找到差距</span>${icon('arrow-right')}<span>${icon('refresh-cw')}换例子再试</span></div>
    ${last?`<div class="last-feedback"><span class="task-label">上次停在这里</span><p>${esc(last.feedback)}</p><span class="source">${esc(names[last.support])} · ${esc(names[last.outcome])}</span><details><summary>查看那次回答</summary><p>${esc(last.question)}</p><blockquote>${esc(last.answer)}</blockquote></details></div>`:`<div class="home-empty">${icon('sprout')}<p>还没有学习记录</p><button id="home-demo">看看一次学习的样子${icon('arrow-right')}</button></div>`}
    <div class="home-bottom"><span>${attempts.length} 次作答 · ${t?.models.length||0} 条理解记录</span><button data-view="map">查看我的理解${icon('arrow-up-right')}</button></div></div>`;
  icons();
}
let pendingStart=null;
async function startLearning(existing=false){
  const goal=$('#learning-goal').value.trim();if(!goal){$('#learning-goal').focus();return;}
  if(busy)return;busy=true;$('#start-learning button').disabled=true;
  const text=`请使用 zhixing-learning 开始学习。我的问题是：${goal}。先用 zhixing_archive 读取档案，每次只问一道题，等待我回答，先不要泄露答案。`;
  try{
    if(!embedded){await sendPrompt(text);return;}
    if(!pendingStart||pendingStart.goal!==goal)pendingStart={id:'topic-'+crypto.randomUUID(),title:goal.slice(0,100),goal,sources:[],models:[],next:'回答第一道诊断题'};
    const topic=pendingStart;
    const finish=async session=>{
      if(!state.data.topics.some(t=>t.id===topic.id))await saveSession({type:'create-topic',topic:{...topic,sessions:[session],primarySessionId:session.id}});
      state.topic=topic.id;newTopic=false;render();
      await host('practice',{sessionId:session.id,text:text+` 学习主题 ID：${topic.id}，主题已建立，请沿用。`});pendingStart=null;
    };
    if(existing)await chooseSession(topic,finish);else await finish(await host('create',{key:topic.id,title:topic.title}));
  }catch(error){toast(error.message);}finally{busy=false;const button=$('#start-learning button');if(button)button.disabled=false;}
}
document.addEventListener('submit',e=>{if(e.target.id==='start-learning'){e.preventDefault();startLearning();}});
document.addEventListener('change',e=>{if(e.target.id==='home-topic'){newTopic=false;state.topic=e.target.value;state.model=null;render();}});
function targetMap(t,m){
  if(!m)return '<div class="blank-message">尚无模型</div>';
  const pairs=m.diagram?.pairs||[], pair=pairs[state.pair];
  const node=(part,label,value,symbol)=>`<button class="target-node ${state.part===part?'active':''}" data-part="${part}" aria-pressed="${state.part===part}"><span>${icon(symbol)}${label}</span><strong>${esc(value)}</strong></button>`;
  return `<div class="model-switch" aria-label="选择模型">${t.models.map(x=>`<button data-model="${esc(x.id)}" aria-pressed="${x.id===m.id}">${icon(x.kind==='discrimination'?'scan-line':'git-branch')}${esc(x.title)}</button>`).join('')}</div>
    <div class="target-heading"><strong>渐构靶图</strong>${badge(m.status,m.status==='disputed'?'gold':'')}<small>v${m.version}</small></div>
    <div class="target-level-label">上层 · 概念与规则</div><div class="target-level concepts">
    ${node('input','输入概念',m.input,'log-in')}<button class="mapping ${state.part==='rule'?'active':''}" data-part="rule" aria-pressed="${state.part==='rule'}"><span>映射规则</span>${icon('move-right')}<small>${m.kind==='discrimination'?'满足哪些条件？':'怎样产生变化？'}</small></button>${node('output','输出概念',m.output,'log-out')}</div>
    <div class="target-bridges"><button data-part="conditions">${icon('list-filter')}输入内涵</button><span>规则 ↓ 实例</span><button data-part="outputCriteria">${icon('list-filter')}输出内涵</button></div>
    <div class="target-level-label">下层 · 对象与具体预测 <span>说明材料，不计入作答证据</span></div><div class="target-level instances">
    ${node('pair','输入实例',pair?.input||'待补充实例','circle-dot')}<div class="mapping concrete"><span>${esc(pair?.label||'具体预测')}</span>${icon('move-right')}</div>${node('pair','输出实例',pair?.output||'待补充结果','circle-dot')}</div>
    <div class="pair-switch" aria-label="选择说明实例">${pairs.map((p,i)=>`<button data-pair="${i}" aria-pressed="${i===state.pair}">${esc(p.label)}</button>`).join('')}</div>
    <div class="target-source">依据《学习观》图34-3改编 · 输出实例属于陪域，非全部可能结果</div>`;
}
function selectionDetail(m){
  const pair=m.diagram?.pairs?.[state.pair];
  const parts={input:['输入概念',m.input],output:['输出概念',m.output],rule:['映射规则',m.rule],conditions:['输入内涵 / 适用条件',m.conditions.join('；')],outputCriteria:['输出内涵',m.diagram?.outputCriteria||'尚未记录输出的判别条件。'],pair:[pair?.label||'具体预测',pair?`${pair.input} → ${pair.output}`:'尚未记录成对实例。']};
  const [label,value]=parts[state.part]||parts.rule;
  return `<div class="selected-detail" tabindex="-1"><div class="section-label">${icon('crosshair')}${esc(label)}</div><p>${esc(value)}</p>${state.part==='pair'&&pair?`<p class="source">${esc(pair.reason)}<br>${esc(pair.source)}</p>`:''}<button id="practice-part">${icon('message-circle-question')}围绕这里练一题</button></div>`;
}
function evidenceChart(t){
  const groups=[['all','全部','layers'],['independent','独立作答','user-round'],['assisted','有辅助','messages-square'],['delayed','延后复测','history']];
  return `<div class="evidence-chart" aria-label="作答证据分布">${groups.map(([key,label,symbol])=>{const count=t.attempts.filter(p=>matchesEvidence(p,key)).length;return `<button data-filter="${key}" aria-pressed="${state.filter===key}">${icon(symbol)}<span>${label}</span><strong>${count}</strong><meter min="0" max="${Math.max(1,t.attempts.length)}" value="${count}" aria-label="${label} ${count} 次"></meter></button>`;}).join('')}</div>`;
}
function matchesEvidence(p,key){return key==='all'||(key==='independent'?p.support==='independent':key==='assisted'?p.support!=='independent':p.context==='delayed');}
function worktable(t){
  const m=t?.models.find(x=>x.id===state.model);
  const main=$('#content');
  const top=`<div class="workspace-heading"><div class="breadcrumb">学习空间 <span>/</span> ${esc(t?.title||'学习总览')}</div><div class="layout-tools"><span>布局</span><button class="icon-button" data-layout="split" aria-label="分屏布局" title="分屏布局">${icon('columns-2')}</button><button class="icon-button" data-layout="focus" aria-label="专注布局" title="专注布局">${icon('panel-top')}</button></div></div>`;
  const title=`<div class="topic-heading"><div><span class="eyebrow">${t?'LEARNING PROJECT':'PERSONAL WORKSPACE'}</span><h1>${esc(t?.title||'学习总览')}</h1><p class="goal">${esc(t?.goal||'我的模型、验证与学习进展')}</p></div><button class="primary" id="copy-session">${icon('play')} ${t?'继续学习':'开始学习'}</button></div>`;
  const graph=t?targetMap(t,m):`<div class="empty-canvas"><div class="empty-symbol">${icon('workflow')}</div><h2>第一个模型，尚待构建</h2><p>从一个想弄明白的问题开始。</p><button id="open-demo">${icon('panels-top-left')} 打开示例工作台</button><div class="empty-process"><span>01 / 判别</span><span>02 / 联结</span><span>03 / 验证</span></div></div>`;
  const detail=m?`<div class="inspector-body"><div class="meta">${badge(m.kind,m.kind==='connection'?'blue':'')}${badge(m.status,m.status==='disputed'?'gold':'')}</div><h2>${esc(m.title)}</h2><div class="io"><span>输入</span><p>${esc(m.input)}</p><div class="io-arrow">${icon('arrow-down')}</div><span>输出</span><p>${esc(m.output)}</p></div><div class="section-label">判别条件 / 适用边界</div>${list(m.conditions)}${m.relation?`<div class="section-label">关系性质</div><p>${esc(m.relation)}</p>`:''}<details><summary>正例与反例</summary><div class="section-label">正例</div>${list(m.examples)}<div class="section-label">反例</div>${list(m.counterexamples)}</details><div class="section-label">材料依据</div><p class="source">${esc(m.source)}</p></div>`:`<div class="inspector-empty">${icon('scan-line')}<h3>尚未选择模型</h3><p>暂无判别条件与联结关系。</p></div>`;
  const attempts=t?.attempts||[];
  const stats=`<div class="stats">${[[t?.models.length||0,'模型','boxes'],[attempts.filter(x=>x.support==='independent'&&x.outcome==='correct').length,'独立答对','circle-check'],[attempts.filter(x=>x.support!=='independent').length,'有辅助作答','message-circle'],[attempts.filter(x=>x.context==='delayed').length,'延后复测','history']].map(([n,l,i])=>`<div class="stat">${icon(i)}<strong>${n}</strong><span>${l}</span></div>`).join('')}</div>`;
  main.innerHTML=`<button data-view="learn" class="back-learning">${icon('arrow-left')}返回学习</button>`+top+title+stats+`<div class="work-grid"><section class="window canvas-window">${chrome('模型画布','workflow',`<span class="window-meta">${state.mode==='demo'?'DEMO':'LIVE ARCHIVE'}</span>`)}<div class="graph-canvas">${graph}</div></section><section class="window inspector-window">${chrome('模型检查器','sliders-horizontal')}<div class="scroll-body">${detail}</div></section><section class="window evidence-window"><div class="window-bar"><div class="tabs" role="tablist" aria-label="学习记录视图">${[['evidence','作答证据','list-checks'],['history','修订历史','history']].map(([k,l,i])=>`<button id="tab-${k}" role="tab" aria-controls="panel" aria-selected="${(state.tab==='models'?'evidence':state.tab)===k}" tabindex="${(state.tab==='models'?'evidence':state.tab)===k?0:-1}" data-tab="${k}">${icon(i)}${l}</button>`).join('')}</div><span class="window-meta">${attempts.length} RECORDS</span></div><div class="scroll-body" id="panel" role="tabpanel" aria-labelledby="tab-${state.tab==='history'?'history':'evidence'}">${t?(state.tab==='history'?history(t):evidence(t)):`<div class="empty-evidence">${icon('list-checks')}<span>尚无作答证据</span><small>独立作答 · 新情境验证 · 延后复测</small></div>`}</div></section><section class="window next-window">${chrome('下一步验证','crosshair')}<div class="next-body"><span class="next-tag">${t?'待验证':'尚未开始'}</span><p>${esc(t?.next||'确定一个具体学习目标，进行第一轮诊断。')}</p><button id="copy-next">${icon('copy')} 复制到助手</button></div></section></div><footer><span>${icon('hard-drive')} ${state.mode==='demo'?'示例空间 · 不计入学习记录':'本地学习档案'}</span><span>${date(state.data.updatedAt)}</span></footer>`;
  if(t){
    if(m)$('.inspector-body').insertAdjacentHTML('afterbegin',selectionDetail(m));
    if(state.tab!=='history')$('#panel').insertAdjacentHTML('afterbegin',evidenceChart(t));
  }
  icons();
}
async function load() {
  const mode = state.mode;
  try {
    const response = await fetch(apiPath(`/api/${mode}`)); if (!response.ok) throw new Error('无法读取学习档案，请检查本地服务与档案格式。');
    const data = await response.json(); if (mode !== state.mode) return;
    const changed = !state.data || state.data.revision !== data.revision || !!state.data.isDemo !== !!data.isDemo;
    state.data = data; $('#error').hidden = true; $('#sync').textContent = mode === 'demo' ? '示例数据' : `已连接 · v${data.revision}`;
    if(changed) render();
  } catch(e) { $('#error').textContent=e.message; $('#error').hidden=false; $('#sync').textContent='连接中断'; }
}
function render() {
  const a = state.data; if(!a)return;
  $('#notice').hidden=state.mode!=='demo'; $('#notice').textContent='示例空间 · 以下作答、评价和修订均为模拟，不计入你的学习档案。';
  $('#revision').textContent=`档案 v${a.revision} · ${a.topics.length} 个主题`;
  $('#topic-count').textContent=a.topics.length;
  if(!a.topics.some(t=>t.id===state.topic))state.topic=a.topics[0]?.id;
  $('#topics').innerHTML=a.topics.map(t=>`<button class="${t.id===state.topic?'active':''}" data-topic="${esc(t.id)}" title="${esc(t.title)}" aria-current="${t.id===state.topic?'page':'false'}">${icon('book-open')}<span>${esc(t.title)}<small>${t.models.length} 个模型 · ${t.attempts.length} 次作答</small></span></button>`).join('') || '<div class="empty-list">尚无主题</div>';
  $('#handoff').disabled=state.mode==='demo';
  if(newTopic&&state.mode==='archive'){learningHome(null);return;}
  if(!a.topics.length){state.view==='learn'?learningHome(null):worktable(null);return;}
  const t=a.topics.find(t=>t.id===state.topic);
  if(!t.models.some(m=>m.id===state.model))state.model=t.models[0]?.id;
  state.view==='learn'?learningHome(t):worktable(t);
}
function evidence(t){
  if(state.filter!=='all'&&!t.attempts.some(p=>matchesEvidence(p,state.filter)))return '<p class="source">这类作答尚无记录。</p>';
  t={...t,attempts:t.attempts.filter(p=>matchesEvidence(p,state.filter))};
  return t.attempts.length?t.attempts.slice().reverse().map(p=>`<details class="evidence"><summary>${esc(p.question)}</summary><div class="meta">${badge(p.outcome,p.outcome==='incorrect'?'red':p.outcome==='uncertain'?'gold':'')}${badge(p.support,'blue')}${badge(p.context)}<span class="source">模型 v${p.modelVersion}</span></div><div class="answer-block"><span class="source">原始作答</span><p>${esc(p.answer)}</p></div><p>${esc(p.feedback)}</p><div class="source">${esc(p.source)}</div><div class="source">评价：${esc(p.reviewer)} · <time>${date(p.occurredAt)}</time></div>${p.annotations?.map(x=>`<div class="answer-block"><span class="source">追加评价 · ${esc(x.author)} · ${date(x.at)}</span><p>${esc(x.note)}</p></div>`).join('')||''}</details>`).join(''):'<p class="source">尚无真实作答。模型中的例子不计入学习证据。</p>';
}
function history(t){
  return t.history.length?`<ol class="timeline">${t.history.slice().reverse().map(h=>`<li><time>${date(h.at)} · ${esc(h.author)}</time><h3>${h.type==='model'?esc(h.after.title):'下一步更新'}</h3><p class="before history-text">${esc(h.type==='model'?(h.before?.rule??'尚无模型'):h.before)}</p><p class="after history-text">→ ${esc(h.type==='model'?h.after.rule:h.after)}</p>${h.reason?`<p class="source">${esc(h.reason)}</p>`:''}</li>`).join('')}</ol>`:'<p class="source">尚无模型修订。</p>';
}
function download(kind){const a=document.createElement('a');a.href=apiPath(`/download/${kind}`);a.download=kind==='handoff'?'learning-handoff.md':`learning-${kind}.json`;document.body.append(a);a.click();a.remove();}
$('#dataset').addEventListener('change',()=>{state.mode=$('#dataset').value;state.data=null;state.topic=null;state.model=null;state.pair=0;state.part='rule';state.filter='all';load();});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='new-topic'){newTopic=true;state.mode='archive';$('#dataset').value='archive';await load();render();return;}
  if(b.id==='start-existing'){await startLearning(true);return;}
  if(b.id==='link-session'||b.dataset.sessionOpen||b.dataset.sessionUnlink||b.dataset.sessionPrimary){
    const t=state.data.topics.find(x=>x.id===state.topic);if(!t||busy)return;busy=true;
    try{
      if(b.id==='link-session')await chooseSession(t,session=>saveSession({type:'link-session',topicId:t.id,session}));
      else if(b.dataset.sessionOpen)await host('open',{sessionId:b.dataset.sessionOpen});
      else await saveSession({type:b.dataset.sessionUnlink?'unlink-session':'set-primary-session',topicId:t.id,sessionId:b.dataset.sessionUnlink||b.dataset.sessionPrimary});
    }catch(error){toast(error.message);}finally{busy=false;}return;
  }
  if(b.dataset.view){state.view=b.dataset.view;render();return;}
  if(b.id==='home-demo'){state.mode='demo';state.data=null;$('#dataset').value='demo';await load();return;}
  if(b.dataset.topic){newTopic=false;state.topic=b.dataset.topic;state.model=null;state.pair=0;state.part='rule';state.filter='all';render();}
  else if(b.dataset.model){state.model=b.dataset.model;state.pair=0;state.part='rule';render();}
  else if(b.dataset.part){state.part=b.dataset.part;render();$('.selected-detail')?.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('.selected-detail')?.scrollIntoView({block:'center',behavior:'smooth'});}
  else if(b.dataset.pair!==undefined){state.pair=Number(b.dataset.pair);state.part='pair';render();$(`[data-pair="${state.pair}"]`)?.focus({preventScroll:true});}
  else if(b.dataset.filter){state.filter=b.dataset.filter;render();$(`[data-filter="${state.filter}"]`)?.focus({preventScroll:true});}
  else if(b.id==='practice-part'){const t=state.data.topics.find(x=>x.id===state.topic),m=t.models.find(x=>x.id===state.model);const prompt=`请使用 zhixing-learning 技能，调用 zhixing_archive 读取真实档案。围绕「${t.title}」的「${m.title}」，诊断我对${({input:'输入概念',output:'输出概念',rule:'映射规则',conditions:'适用条件',outputCriteria:'输出判别条件',pair:'具体实例与规则的对应'})[state.part]}的理解。${state.mode==='demo'?'当前查看的是演示材料，不能视为我的学习记录。':''}先出一道未见过的新题，等待我回答，不泄露答案。`;try{await sendPrompt(prompt);}catch{toast('复制失败，请检查剪贴板权限');}}
  else if(b.dataset.tab){state.tab=b.dataset.tab;render();$(`#tab-${state.tab}`).focus();}
  else if(b.id==='open-demo'){$('#dataset').value='demo';$('#dataset').dispatchEvent(new Event('change'));}
  else if(b.id==='theme'){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;preference('theme',theme);}
  else if(b.id==='collapse'){const collapsed=document.body.classList.toggle('collapsed');preference('collapsed',String(collapsed));b.setAttribute('aria-label',collapsed?'展开侧栏':'收起侧栏');b.title=collapsed?'展开侧栏':'收起侧栏';}
  else if(b.dataset.layout){const focused=b.dataset.layout==='focus';document.body.classList.toggle('focused',focused);preference('focused',String(focused));}
  else if(b.id==='overview'||b.id==='space-toggle'){$('#dataset').value=b.id==='overview'?'archive':state.mode==='archive'?'demo':'archive';$('#dataset').dispatchEvent(new Event('change'));}
  else if(['copy-session','copy-next'].includes(b.id)){const t=state.data?.topics.find(x=>x.id===state.topic);const prompt=t?`请使用 zhixing-learning 技能继续学习「${t.title}」。先读取真实学习档案。${state.mode==='demo'?'当前是演示主题，请勿把模拟记录作为我的成绩。':''}下一步：${t.next} 每次一道题，等待我回答。`:starter;try{await sendPrompt(prompt);}catch{toast('复制失败，请检查浏览器剪贴板权限');}}
});
document.addEventListener('keydown',e=>{if(e.target.getAttribute('role')!=='tab'||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const keys=['evidence','history'];let i=keys.indexOf(state.tab==='models'?'evidence':state.tab);i=e.key==='Home'?0:e.key==='End'?1:(i+1)%2;state.tab=keys[i];render();$(`#tab-${state.tab}`).focus();});
$('#export').onclick=()=>{if(state.data)download(state.mode);};
$('#handoff').onclick=()=>download('handoff');
load();setInterval(load,3000);
if(embedded)host('list').then(result=>{hostSessions=result;render();}).catch(()=>toast('会话列表暂不可用，打开相关会话时可重试'));
