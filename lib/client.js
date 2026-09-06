window.__ModuleLoader__.load({id:'dsh-zhixing',factory:(require)=>{
  const React=require('react'),h=React.createElement;
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
          if(result.openSessionId){openView('chat','');openSession(result.openSessionId);}
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
    ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'zhixing',label:()=> '学习',order:20,inject:(currentId)=>({openSession:id=>ctx.sessions.open(id),bridge:async(action,p)=>{
      if(action==='list'){
        await ctx.sessions.refresh();const list=ctx.sessions.list.getSnapshot();
        return {currentId,sessions:list.ids.map(id=>list.byId[id]).filter(s=>s&&!s.parentId&&s.origin!=='subagent').map(s=>({id:s.id,title:s.displayTitle||s.title||s.id}))};
      }
      const snapshot=ctx.sessions.list.getSnapshot();let target=p.sessionId;
      if(action==='create'){
        if(typeof p.key!=='string'||p.key.length>200)throw new Error('Invalid key');
        target=created.get(p.key);
        if(!target||!snapshot.byId[target]){
          target=await ctx.sessions.create({cwd:snapshot.byId[currentId]?.cwd,sessionId:crypto.randomUUID()});
          created.set(p.key,target);
          if(typeof p.title==='string')await ctx.sessions.binding(target).session.rename(p.title.slice(0,100));
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
    }})},LearningView));
  }
  return {apply,inject:['slots','sessions','conversation']};
}});
