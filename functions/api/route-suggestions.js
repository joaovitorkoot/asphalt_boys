import {sessionFor,sameOrigin} from './auth.js';
// Sugestões de roteiros enviadas pelos visitantes. Publicação depende de aprovação.
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const text=(v,max=120)=>String(v??'').trim().slice(0,max);
const validId=s=>/^[a-zA-Z0-9_-]{3,120}$/.test(s||'');
const uuid=s=>/^[0-9a-f-]{36}$/.test(s||'');
async function ensure(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS ab_route_suggestions (id TEXT PRIMARY KEY NOT NULL,status TEXT NOT NULL DEFAULT 'pendente',payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_ab_route_suggestion_status ON ab_route_suggestions(status,created_at)").run();
}
function parseShared(value,requestUrl){
 let u;try{u=new URL(String(value||'').trim())}catch{throw Error('Cole um link compartilhado pelo planejador Asphalt Boys.')}
 const origin=new URL(requestUrl),accepted=['asphalt-boys.pages.dev','asphalt-boys.joaovitorkoot.workers.dev',origin.hostname];
 if(u.protocol!=='https:'||!accepted.includes(u.hostname)||u.port||u.username||u.password||!['/','/index.html'].includes(u.pathname))throw Error('O link deve ser do planejador Asphalt Boys.');
 const dest=text(u.searchParams.get('dest'));
 if(!validId(dest))throw Error('O link não informa um destino válido.');
 const stops=text(u.searchParams.get('stops'),3000),preset=text(u.searchParams.get('rota'),120),daysRaw=u.searchParams.get('dias'),pointsRaw=u.searchParams.get('pontos');
 if(!stops&&!preset&&!daysRaw)throw Error('Monte e compartilhe uma rota com paradas ou dias antes de enviar.');
 let ids=[],days=[],points=[];
 if(stops){
  ids=stops.split(',');
  if(ids.length>20||ids.some(x=>!validId(x))||new Set(ids).size!==ids.length)throw Error('Lista de paradas inválida ou acima do limite de 20.');
 }
 if(preset&&!validId(preset))throw Error('Identificador da rota inválido.');
 if(daysRaw){
  if(daysRaw.length>4800)throw Error('A viagem tem muitos dados para compartilhar.');
  let parsed;try{parsed=JSON.parse(daysRaw)}catch{throw Error('Dias do roteiro inválidos.')}
  if(!Array.isArray(parsed)||!parsed.length||parsed.length>7)throw Error('Informe no máximo sete dias de viagem.');
  days=parsed.map((d,i)=>{
   if(!Array.isArray(d)||!Array.isArray(d[1])||d[1].length>20||d[1].some(x=>!validId(x)))throw Error('Dia '+(i+1)+' contém paradas inválidas.');
   return [text(d[0]||'Dia '+(i+1),100),d[1]];
  });
  if(!days.some(d=>d[1].length))throw Error('Adicione pelo menos uma parada aos dias da viagem.');
 }
 if(pointsRaw){
  if(pointsRaw.length>3000)throw Error('O roteiro tem pontos personalizados demais.');
  let parsed;try{parsed=JSON.parse(pointsRaw)}catch{throw Error('Pontos personalizados inválidos.')}
  if(!Array.isArray(parsed)||parsed.length>20)throw Error('Pontos personalizados acima do limite.');
  points=parsed.map(p=>{
   if(!Array.isArray(p)||!validId(String(p[0]||'')))throw Error('Ponto personalizado inválido.');
   return [text(p[0]),text(p[1],120),text(p[2],64),text(p[3],250)];
  });
 }
 const clean=new URL('https://asphalt-boys.pages.dev/');
 clean.searchParams.set('dest',dest);
 if(ids.length)clean.searchParams.set('stops',ids.join(','));
 else if(preset)clean.searchParams.set('rota',preset);
 if(days.length)clean.searchParams.set('dias',JSON.stringify(days));
 if(points.length)clean.searchParams.set('pontos',JSON.stringify(points));
 // Origem é removida para não guardar endereços pessoais informados pelo visitante.
 if(clean.href.length>7000)throw Error('O link do roteiro é longo demais.');
 return {url:clean.href,destinationId:dest,stops:ids,days,presetId:preset,points,stopCount:days.length?days.reduce((n,d)=>n+d[1].length,0):ids.length,dayCount:days.length};
}
async function validDestination(db,id){
 const mapped=id==='canoa'?'canoa-quebrada':id;
 if(['guaramiranga','canoa-quebrada','pico'].includes(mapped))return mapped;
 const row=await db.prepare("SELECT id FROM site_content WHERE kind='destinos' AND status='publicado' AND id=?").bind(mapped).first();
 return row?.id?mapped:'';
}
async function limit(db,request,env){
 const ip=text(request.headers.get('CF-Connecting-IP')||'visitante',120);
 const day=new Date().toISOString().slice(0,10);
 const secret=String(env.ADMIN_TOKEN||'asphalt-boys');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+'|'+ip+'|'+day));
 const key=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
 await db.prepare("CREATE TABLE IF NOT EXISTS ab_visitor_suggestion_limits (visitor_day TEXT PRIMARY KEY,count INTEGER NOT NULL)").run();
 const result=await db.prepare('INSERT INTO ab_visitor_suggestion_limits(visitor_day,count) VALUES(?,1) ON CONFLICT(visitor_day) DO UPDATE SET count=count+1 WHERE count<5').bind(key).run();
 return !!Number(result.meta?.changes);
}
export async function onRequestGet({request,env}){
 if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
 if(!await sessionFor(request,env))return reply({error:'Faça login no painel administrativo.'},401);
 try{await ensure(env.DB);const rows=(await env.DB.prepare("SELECT id,status,payload,created_at FROM ab_route_suggestions ORDER BY created_at DESC LIMIT 200").all()).results||[];
 return reply({suggestions:rows.map(r=>{try{return {...JSON.parse(r.payload),id:r.id,status:r.status,createdAt:r.created_at}}catch{return null}}).filter(Boolean)});}
 catch{return reply({error:'Não foi possível carregar as sugestões de rotas.'},503)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
 if(!sameOrigin(request))return reply({error:'Envie pelo formulário do Asphalt Boys.'},403);
 if(!String(request.headers.get('content-type')||'').includes('application/json'))return reply({error:'Envie JSON.'},415);
 if(Number(request.headers.get('content-length')||0)>10500)return reply({error:'Sugestão muito grande.'},413);
 try{
  const b=await request.json(),shared=parseShared(b.routeUrl,request.url);
  const title=text(b.title,120),note=text(b.note,700);
  if(title.length<3)return reply({error:'Dê um nome à rota (mínimo de 3 caracteres).'},422);
  await ensure(env.DB);
  const destination=await validDestination(env.DB,shared.destinationId);
  if(!destination)return reply({error:'Destino não encontrado ou ainda não publicado.'},422);
  if(!await limit(env.DB,request,env))return reply({error:'Limite diário de cinco sugestões atingido. Tente amanhã.'},429);
  const id=crypto.randomUUID(),record={title,note,...shared,destinationId:destination};
  await env.DB.prepare("INSERT INTO ab_route_suggestions(id,status,payload) VALUES(?,'pendente',?)").bind(id,JSON.stringify(record)).run();
  return reply({ok:true,message:'Sugestão de rota recebida! Ela ficará pendente até ser analisada.'},201);
 }catch(e){const message=String(e?.message||'');
  if(/link|destino|rota|roteiro|dias|pontos|paradas|longo|compartilhar|identificador/i.test(message))return reply({error:message.slice(0,210)},422);
  return reply({error:'Não foi possível enviar a rota. Tente novamente.'},503)}
}
export async function onRequestPatch({request,env}){
 if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
 if(!sameOrigin(request))return reply({error:'Origem inválida.'},403);
 if(!await sessionFor(request,env))return reply({error:'Faça login no painel.'},401);
 if(Number(request.headers.get('content-length')||0)>3000)return reply({error:'Dados acima do limite.'},413);
 try{
  await ensure(env.DB);
  const b=await request.json(),id=text(b.id,60),action=text(b.action,25);
  if(!uuid(id)||!['publicar','rejeitar','reabrir'].includes(action))return reply({error:'Ação inválida.'},422);
  const row=await env.DB.prepare('SELECT status,payload FROM ab_route_suggestions WHERE id=?').bind(id).first();
  if(!row)return reply({error:'Sugestão não encontrada.'},404);
  if(action==='reabrir'){
   if(row.status!=='rejeitada')return reply({error:'Apenas rotas rejeitadas podem ser reabertas.'},409);
   await env.DB.prepare("UPDATE ab_route_suggestions SET status='pendente',updated_at=datetime('now') WHERE id=? AND status='rejeitada'").bind(id).run();
   return reply({ok:true,status:'pendente'});
  }
  if(row.status!=='pendente')return reply({error:'Esta sugestão já foi analisada.'},409);
  if(action==='rejeitar'){
   await env.DB.prepare("UPDATE ab_route_suggestions SET status='rejeitada',updated_at=datetime('now') WHERE id=? AND status='pendente'").bind(id).run();
   return reply({ok:true,status:'rejeitada'});
  }
  const record=JSON.parse(row.payload),name=text(b.title||record.title,120);
  if(name.length<3)return reply({error:'Informe o nome da rota.'},422);
  const shared=parseShared(record.url,request.url);
  if(shared.days.length)return reply({error:'Viagens com vários dias precisam ser revisadas e cadastradas individualmente na aba Rotas. A sugestão foi mantida pendente.'},422);
  if(!shared.stops.length)return reply({error:'Essa rota não contém paradas avulsas. Confira o link e cadastre-a pela aba Rotas.'},422);
  if(shared.points.length)return reply({error:'Há pontos personalizados no roteiro. Cadastre-os como paradas oficiais antes de publicar.'},422);
  const destination=await validDestination(env.DB,shared.destinationId);
  if(!destination)return reply({error:'Destino não está publicado.'},422);
  const stops=[];
  for(const sid of shared.stops){
    const stop=await env.DB.prepare("SELECT payload FROM site_content WHERE kind='paradas' AND status='publicado' AND id=?").bind(sid).first();
    if(!stop)return reply({error:'Há paradas não publicadas nesta rota. Cadastre-as antes de publicar.'},422);
    let p;try{p=JSON.parse(stop.payload)}catch{return reply({error:'Parada inválida no banco.'},422)}
    if(p.destinoId!==destination)return reply({error:'Uma parada pertence a outro destino. Revise antes de publicar.'},422);
    stops.push(sid);
  }
  const routeId='rota-'+crypto.randomUUID().slice(0,12);
  const route={id:routeId,nome:name,descricao:text(record.note,700),destinoId:destination,paradas:stops,maps:shared.url.slice(0,1200),status:'publicado'};
  await env.DB.batch([
   env.DB.prepare("INSERT INTO site_content(id,kind,destino_id,status,payload,updated_at) VALUES(?,'rotas',?,'publicado',?,datetime('now'))").bind(routeId,destination,JSON.stringify(route)),
   env.DB.prepare("UPDATE ab_route_suggestions SET status='publicado',payload=?,updated_at=datetime('now') WHERE id=? AND status='pendente'").bind(JSON.stringify({...record,publishedRouteId:routeId}),id)
  ]);
  return reply({ok:true,status:'publicado',routeId});
 }catch(e){return reply({error:'Não foi possível concluir a moderação da rota.'},503)}
}
export async function onRequestDelete({request,env}){
 if(!env.DB)return reply({error:'Banco indisponível.'},503);
 if(!sameOrigin(request))return reply({error:'Origem inválida.'},403);
 if(!await sessionFor(request,env))return reply({error:'Faça login no painel.'},401);
 try{const b=await request.json(),id=text(b.id,60);if(!uuid(id))return reply({error:'ID inválido.'},422);
  await ensure(env.DB);
  const row=await env.DB.prepare('SELECT status FROM ab_route_suggestions WHERE id=?').bind(id).first();
  if(!row)return reply({error:'Sugestão não encontrada.'},404);
  if(row.status==='publicado'&&b.deleteOnlyHistory!==true)return reply({error:'Confirme remover apenas o histórico, sem excluir a rota publicada.'},422);
  await env.DB.prepare('DELETE FROM ab_route_suggestions WHERE id=?').bind(id).run();
  return reply({ok:true,wasPublished:row.status==='publicado'});
 }catch{return reply({error:'Não foi possível excluir a sugestão.'},503)}
}
