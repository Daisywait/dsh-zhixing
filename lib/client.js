window.__ModuleLoader__.load({id:'dsh-zhixing',factory:(require)=>{
  const React=require('react'),h=React.createElement;
  function LearningEntry({wide,openLearning}){return h('button',{type:'button',title:'知行学习','aria-label':'知行学习',onClick:openLearning,style:{background:'transparent',color:'inherit',border:'1px solid currentColor',borderRadius:5,padding:'9px 12px',margin:'8px 0',cursor:'pointer',font:'inherit',width:'100%'}},wide?'知行学习':'学习');}
  function LearningView({bridge,openSession,openView}){
    const frame=React.useRef(null);
    React.useEffect(()=>{
      let busy=false;
      const listener=async e=>{
        if(e.origin!==location.origin||e.source!==frame.current?.contentWindow||e.data?.type!=='zhixing:request')return;
        const {requestId,action,payload}=e.data;
        if(typeof requestId!=='string'||typeof action!=='string'||!payload||typeof payload!=='object')return;
        const reply=result=>e.source.postMessage({type:'zhixing:response',requestId,...result},location.origin);
        if(busy){reply({error:'正在处理，请稍后重试'});return;}
        busy=true;
        try{
          const result=await bridge(action,payload);reply({result});
          if(result.openSessionId){openSession(result.openSessionId);openView('chat','');}
        }catch{reply({error:'会话操作未完成，请检查 dsh 连接后重试'});}
        finally{busy=false;}
      };
      window.addEventListener('message',listener);
      return()=>window.removeEventListener('message',listener);
    },[bridge,openSession,openView]);
    return h('iframe',{ref:frame,src:'/api/zhixing/?embedded=1',title:'知行学习',style:{width:'100%',height:'100%',minHeight:300,border:0,display:'block',flex:1},allow:'clipboard-write'});
  }
  function apply(ctx){
    const created=new Map();
    const connect=(currentId)=>({openSession:id=>ctx.sessions.open(id),bridge:async(action,p)=>{
      if(action==='list'){
        await ctx.sessions.refresh();const list=ctx.sessions.list.getSnapshot();
        return {currentId,sessions:list.ids.map(id=>list.byId[id]).filter(s=>s&&!s.parentId&&s.origin!=='subagent').map(s=>({id:s.id,title:s.displayTitle||s.title||s.id}))};
      }
      const snapshot=ctx.sessions.list.getSnapshot();let target=p.sessionId;
      if(action==='create'){
        if(typeof p.key!=='string'||p.key.length>200)throw new Error('Invalid key');
        target=created.get(p.key);
        if(!target||!snapshot.byId[target]){
          const workspace=ctx.workspaces.list.getSnapshot().items.find(w=>w.sessionIds.includes(currentId));
          const cwd=snapshot.byId[currentId]?.cwd;
          if(!workspace&&!cwd)throw new Error('Select a workspace first');
          target=await ctx.sessions.create({...workspace?{workspaceId:workspace.workspaceId}:{cwd},sessionId:crypto.randomUUID()});
          created.set(p.key,target);
        }
        return {id:target,title:typeof p.title==='string'?p.title.slice(0,200):'学习会话'};
      }
      if(!['open','practice'].includes(action)||typeof target!=='string'||!snapshot.ids.includes(target))throw new Error('Session unavailable');
      const binding=ctx.sessions.binding(target);if(!binding)throw new Error('Session unavailable');
      if(action==='practice'){
        if(typeof p.text!=='string'||p.text.length>30000)throw new Error('Invalid prompt');
        const input=ctx.conversation.input.for(binding.ctx),existing=input.state.getSnapshot().draft||'';
        input.setDraft(existing?existing+'\n\n'+p.text:p.text);
        input.notify('info','学习请求已放入输入框');
      }
      return {openSessionId:target};
    }});
    ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'zhixing',label:()=> '学习',order:20,inject:connect},LearningView));
    ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'zhixing-entry',order:10,inject:()=>({openLearning:async()=>{let current=ctx.sessions.list.getSnapshot().current;if(!current){const w=ctx.workspaces.list.getSnapshot().items?.[0];if(!w)return;current=await ctx.sessions.create({workspaceId:w.workspaceId,sessionId:crypto.randomUUID()});}ctx.sessions.open(current);}})},LearningEntry));
  }
  return {apply,inject:['slots','sessions','conversation','workspaces']};
}});
