import {readFile} from 'node:fs/promises';
import {dataRoot,initialize,archiveAction,readArchive} from './storage.js';
import {handoff} from '../scripts/store.mjs';

export const name='zhixing';
export const inject=['webServer','skills','tools','connection'];
const base='/api/zhixing';
const assets=new Map([['/',['public/index.html','text/html']],['/app.js',['public/app.js','text/javascript']],['/style.css',['public/worktable.css','text/css']],['/lucide.js',['public/lucide.js','text/javascript']]]);
export function makeHandler(root,authorize){return async(req,res)=>{
  if(!authorize(req,res))return;
  const peer=req.socket?.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)){res.writeHead(403);return res.end('Local access only');}
  if(req.method==='POST'&&new URL(req.url,'http://localhost').pathname===base+'/api/sessions'){
    if(req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`){res.writeHead(403);return res.end('Same origin required');}
    if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);return res.end('JSON required');}
    try{
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>64000){res.writeHead(413);return res.end('Request too large');}}
      const op=JSON.parse(body);
      if(!['create-topic','link-session','unlink-session','set-primary-session'].includes(op.type)){res.writeHead(400);return res.end('Session operation required');}
      const archive=await archiveAction(root,'apply',JSON.stringify(op));
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(archive));
    }catch(e){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:e.message}));}
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end('Read only');}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'");
  const route=new URL(req.url,'http://localhost').pathname.slice(base.length);
  try{
    let content,type='application/json';
    if(route==='/api/archive'||route==='/download/archive')content=JSON.stringify(await readArchive(root),null,2);
    else if(route==='/api/demo'||route==='/download/demo')content=await readFile(new URL('../examples/demo.json',import.meta.url));
    else if(route==='/api/handoff'||route==='/download/handoff'){content=handoff(await readArchive(root));type='text/plain';}
    else if(assets.has(route)){const [file,mime]=assets.get(route);content=await readFile(new URL('../'+file,import.meta.url));type=mime;}
    else{res.writeHead(404);return res.end('Not found');}
    if(route.startsWith('/download/'))res.setHeader('Content-Disposition',`attachment; filename="zhixing-${route.split('/').pop()}.${type==='text/plain'?'md':'json'}"`);
    res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(content);
  }catch{res.writeHead(500);res.end('Learning archive unavailable');}
};}
export async function apply(ctx){
  const root=dataRoot();await initialize(root);
  const content=await readFile(new URL('../skills/zhixing-learning/SKILL.md',import.meta.url),'utf8');
  const protocol=await readFile(new URL('../skills/zhixing-learning/archive.md',import.meta.url),'utf8');
  ctx.skills.register({name:'zhixing-learning',description:'知行学习陪练：构建判别模型、联结模型与渐构靶图；用新案例诊断理解并保存真实学习证据。',source:'bundled',provider:'dsh-zhixing',content:content+'\n\n'+protocol});
  ctx.tools.register({
    name:'zhixing_archive',description:'Read or update the personal Zhixing learning archive. Read before each learning session. Apply only evidence-backed operations with expectedRevision. Never record assistant examples as learner answers.',
    parameters:{type:'object',properties:{action:{type:'string',enum:['read','apply']},operation:{type:'string',description:'JSON-encoded operation per zhixing-learning skill. Required for apply.'}},required:['action'],additionalProperties:false},
    output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
    async execute(args){return JSON.stringify(await archiveAction(root,args.action,args.operation),null,2);},
    presentCall(args){return {card:'generic',title:args.action==='read'?'读取学习档案':'更新学习档案',kind:args.action==='read'?'read':'edit',rawInput:args.action};}
  });
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:base,handler:makeHandler(root,(req,res)=>{
    const rejection=ctx.connection.requestRejection(req);
    if(rejection===undefined)return true;
    res.writeHead(rejection,{'Cache-Control':'no-store'});res.end('dsh authentication required');return false;
  })}),'zhixing routes');
}
