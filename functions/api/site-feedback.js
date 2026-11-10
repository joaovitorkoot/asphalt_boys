import {sessionFor,sameOrigin} from './auth.js';
// Sugestões privadas de acessórios e melhorias: nenhuma publicação automática.
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
const clean=(x,n=600)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
async function prepare(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS ab_site_feedback (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('accessory','improvement')),title TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',visitor_hash TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS ab_site_feedback_created ON ab_site_feedback(created_at DESC)").run();
}
function validLink(input){
 if(!input)return '';
 try{
  const url=new URL(input);
  return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname&&url.port===''&&url.href.length<=700?url.href:'';
 }catch{return ''}
}
async function visitorHash(req,env){
 const ip=req.headers.get('CF-Connecting-IP')||'';
 if(!ip)return '';
 const salt=String(env.ADMIN_TOKEN||'asphalt-boys-feedback-v1');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+ip));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:'Envio indisponível no momento.'},503);
 if(!sameOrigin(request))return reply({error:'Envie a sugestão pelo site Asphalt Boys.'},403);
 if(Number(request.headers.get('content-length')||0)>5000)return reply({error:'Sugestão muito longa.'},413);
 try{
  const body=await request.json();
  const kind=clean(body?.kind,30),title=clean(body?.title,120),details=clean(body?.details,1500),
   category=clean(body?.category,70),rawLink=clean(body?.link,700);
  if(!['accessory','improvement'].includes(kind))return reply({error:'Tipo de sugestão inválido.'},422);
  if(kind==='accessory'&&title.length<3)return reply({error:'Informe o nome do acessório.'},422);
  if(kind==='improvement'&&details.length<5)return reply({error:'Conte sua ideia de melhoria.'},422);
  if(rawLink&&!validLink(rawLink))return reply({error:'Use um link HTTPS válido para o produto.'},422);
  await prepare(env.DB);
  const hash=await visitorHash(request,env);
  if(hash){
   const rate=await env.DB.prepare("SELECT COUNT(*) AS count FROM ab_site_feedback WHERE visitor_hash=? AND created_at >= datetime('now','-1 hour')").bind(hash).first();
   if(Number(rate?.count||0)>=5)return reply({error:'Limite de sugestões atingido. Tente novamente mais tarde.'},429);
  }
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO ab_site_feedback (id,kind,title,details,category,link,visitor_hash) VALUES (?,?,?,?,?,?,?)")
   .bind(id,kind,kind==='accessory'?title:'Melhoria do site',details,kind==='accessory'?category:'',kind==='accessory'?validLink(rawLink):'',hash).run();
  return reply({ok:true,message:'Sugestão recebida! Obrigado por ajudar a melhorar o Asphalt Boys.'},201);
 }catch(error){console.error('Feedback submission failed',String(error?.name||'Error'));return reply({error:'Não foi possível enviar sua sugestão.'},503)}
}
export async function onRequestGet({request,env}){
 if(!env.DB)return reply({error:'Banco indisponível.'},503);
 if(!await sessionFor(request,env))return reply({error:'Entre na administração.'},401);
 try{
  await prepare(env.DB);
  const rows=(await env.DB.prepare("SELECT id,kind,title,details,category,link,created_at FROM ab_site_feedback ORDER BY created_at DESC LIMIT 200").all()).results||[];
  return reply({suggestions:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,details:r.details,category:r.category,link:r.link,createdAt:r.created_at}))});
 }catch{return reply({error:'Não foi possível carregar as sugestões.'},503)}
}
export async function onRequestDelete({request,env}){
 if(!env.DB)return reply({error:'Banco indisponível.'},503);
 if(!sameOrigin(request)||!await sessionFor(request,env))return reply({error:'Acesso não autorizado.'},403);
 if(Number(request.headers.get('content-length')||0)>1000)return reply({error:'Solicitação inválida.'},413);
 try{
  const body=await request.json();
  if(!/^[0-9a-f-]{36}$/.test(String(body?.id||'')))return reply({error:'Identificador inválido.'},422);
  await prepare(env.DB);
  const removed=await env.DB.prepare('DELETE FROM ab_site_feedback WHERE id=?').bind(body.id).run();
  return Number(removed.meta?.changes)?reply({ok:true}):reply({error:'Sugestão não encontrada.'},404);
 }catch{return reply({error:'Não foi possível excluir a sugestão.'},503)}
}
