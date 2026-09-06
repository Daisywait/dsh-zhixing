window.__ModuleLoader__.load({id:'dsh-zhixing',factory:(require)=>{
  const React=require('react');
  const h=React.createElement;
  function LearningView({prepare,openView}){
    const frame=React.useRef(null);
    React.useEffect(()=>{
      const listener=e=>{
        if(e.origin!==location.origin||e.source!==frame.current?.contentWindow||e.data?.type!=='zhixing:practice'||typeof e.data.text!=='string'||e.data.text.length>30000)return;
        prepare(e.data.text);
        openView('chat','');
      };
      window.addEventListener('message',listener);
      return ()=>window.removeEventListener('message',listener);
    },[prepare,openView]);
    return h('iframe',{ref:frame,src:'/api/zhixing/?embedded=1',title:'知行学习',style:{width:'100%',height:'100%',minHeight:300,border:0,display:'block',flex:1},allow:'clipboard-write'});
  }
  function apply(ctx){
    ctx.slots.inject('conversation.view',()=>ctx.slots.register({name:'conversation.view',id:'zhixing',label:()=> '学习',order:20,inject:(sessionId)=>({prepare:(text)=>{
      const binding=ctx.sessions.binding(sessionId);
      if(!binding)throw new Error('Session unavailable');
      const input=ctx.conversation.input.for(binding.ctx);
      const existing=input.state.getSnapshot().draft||'';
      input.setDraft(existing?existing+'\n\n'+text:text);
      input.notify('info','学习请求已放入输入框');
    }})},LearningView));
  }
  return {apply,inject:['slots','sessions','conversation']};
}});
