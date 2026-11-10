import {sessionFor,sameOrigin} from './auth.js';
// Sugestões públicas separadas dos rascunhos administrativos e publicações existentes.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const str=(v,max=120)=>String(v??'').trim().slice(0,max);
const idOK=v=>/^[a-zA-Z0-9_-]{3,120}$/.test(String(v||''));
function officialMaps(raw){
 try{
  const u=new URL(str(raw,1600)),host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>1200)return '';
  const google=['google.com','google.com.br','google.pt','google.co.uk','google.es','google.ca','google.fr','google.de','google.com.mx','google.com.ar'];
  const domain=google.some(d=>host===d||host.endsWith('.'+d));
  const ok=host==='maps.app.goo.gl'&&u.pathname.length>1||
    host==='goo.gl'&&u.pathname.startsWith('/maps/')||
    domain&&(u.pathname.startsWith('/maps')||u.pathname.startsWith('/search')||u.searchParams.has('q')||u.searchParams.has('query'));
  return ok?u.href:'';
 }catch{return ''}
}
function photoSignature(bytes,mime){
 if(mime==='image/webp')return bytes[0]===82&&bytes[1]===73&&bytes[8]===87&&bytes[9]===69;
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216;
 if(mime==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 return false;
}
async function dbReady(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS ab_visitor_suggestions (id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_ab_suggestion_status ON ab_visitor_suggestions(status,created_at)").run();
}
async function isPublishedDestination(db,id){
 if(!idOK(id))return false;
 if(id==='guaramiranga'||id==='canoa-quebrada')return true;
 return !!await db.prepare("SELECT id FROM site_content WHERE id=? AND kind='destinos' AND status='publicado'").bind(id).first();
}
async function verifiedAdmin(request,env){
 return !!await sessionFor(request,env);
}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({error:'Banco de dados não configurado.'},503);
 if(!await verifiedAdmin(request,env))return json({error:'Entre na administração para ver as sugestões.'},401);
 try{
  await dbReady(env.DB);
  const rows=(await env.DB.prepare('SELECT id,status,payload,created_at,updated_at FROM ab_visitor_suggestions ORDER BY created_at DESC LIMIT 200').all()).results||[];
  return json({suggestions:rows.map(row=>{try{return {...JSON.parse(row.payload),id:row.id,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}}catch{return null}}).filter(Boolean)});
 }catch{return json({error:'Erro ao carregar sugestões.'},503)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'Banco de dados não configurado.'},503);
 if(!sameOrigin(request))return json({error:'Envie pelo formulário no Asphalt Boys.'},403);
 if(!String(request.headers.get('Content-Type')||'').toLowerCase().startsWith('multipart/form-data'))return json({error:'Formato de envio inválido.'},415);
 if(Number(request.headers.get('content-length')||0)>760000)return json({error:'Envio acima do limite de tamanho.'},413);
 try{
  await dbReady(env.DB);
  const f=await request.formData(),map=officialMaps(f.get('mapsUrl')),name=str(f.get('placeName'));
  const mode=f.get('destinationMode')==='novo'?'novo':'existente',destinationId=str(f.get('destinationId')),destinationName=str(f.get('destinationName'));
  if(!map)return json({error:'Use um link verdadeiro do Google Maps (https).'},422);
  if(name.length<3)return json({error:'Informe o nome do local (mínimo 3 caracteres).'},422);
  if(mode==='novo'&&destinationName.length<3)return json({error:'Informe o nome do novo destino.'},422);
  if(mode==='existente'&&!await isPublishedDestination(env.DB,destinationId))return json({error:'Selecione um destino disponível.'},422);
  const uploaded=f.getAll('photos');
  if(uploaded.length>3)return json({error:'São permitidas no máximo três fotos.'},422);
  const photos=[];
  for(const file of uploaded){
   if(!file||typeof file.arrayBuffer!=='function'||file.size<100||file.size>180000)return json({error:'Cada foto otimizada deve ter no máximo 180 KB.'},422);
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(!photoSignature(bytes,file.type))return json({error:'Formato de imagem não permitido.'},422);
   photos.push({id:crypto.randomUUID(),mime:file.type,bytes});
  }
  // Chave de contagem opaca: nunca armazenar o endereço IP em texto.
  const client=str(request.headers.get('CF-Connecting-IP')||'visitante',120);
  const day=new Date().toISOString().slice(0,10);
  const secret=String(env.ADMIN_TOKEN||'asphalt-boys');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+'|'+client+'|'+day));
  const key=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS ab_visitor_suggestion_limits (visitor_day TEXT PRIMARY KEY, count INTEGER NOT NULL)').run();
  const limited=await env.DB.prepare('INSERT INTO ab_visitor_suggestion_limits(visitor_day,count) VALUES(?,1) ON CONFLICT(visitor_day) DO UPDATE SET count=count+1 WHERE count<5').bind(key).run();
  if(!Number(limited.meta?.changes))return json({error:'Limite diário de sugestões atingido. Tente amanhã.'},429);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS site_images (id TEXT PRIMARY KEY NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const id=crypto.randomUUID();
  const payload={visitorName:name,mapsUrl:map,destinationMode:mode,destinationId:mode==='existente'?destinationId:'',destinationName:mode==='novo'?destinationName:'',photos:photos.map(p=>'/api/image?id='+p.id),approvedName:'',nameChoice:'visitante',chosenDestinationId:'',chosenDestinationName:'',googleName:'',googlePlaceId:'',googleAddress:'',mapCoordinates:''};
  await env.DB.batch([
   ...photos.map(p=>env.DB.prepare('INSERT INTO site_images(id,mime,data) VALUES(?,?,?)').bind(p.id,p.mime,p.bytes)),
   env.DB.prepare("INSERT INTO ab_visitor_suggestions(id,status,payload) VALUES(?,'pendente',?)").bind(id,JSON.stringify(payload))
  ]);
  return json({ok:true,message:'Sugestão recebida! Será analisada antes de aparecer no site.'},201);
 }catch(e){
  console.error('Visitor suggestion error',String(e?.name||'Error'));
  return json({error:'Não foi possível receber a sugestão. Tente novamente.'},503);
 }
}
export async function onRequestPatch({request,env}){
 if(!env.DB)return json({error:'Banco indisponível.'},503);
 if(!sameOrigin(request))return json({error:'Origem não autorizada.'},403);
 if(!await verifiedAdmin(request,env))return json({error:'Entre no painel para analisar sugestões.'},401);
 if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Dados muito grandes.'},413);
 try{
  await dbReady(env.DB);
  const body=await request.json(),id=str(body.id,60),action=str(body.action,20);
  if(!/^[0-9a-f-]{36}$/.test(id)||!['salvar','publicar','rejeitar'].includes(action))return json({error:'Operação inválida.'},422);
  const row=await env.DB.prepare('SELECT status,payload FROM ab_visitor_suggestions WHERE id=?').bind(id).first();
  if(!row)return json({error:'Sugestão não encontrada.'},404);
  if(!['pendente','rascunho'].includes(row.status))return json({error:'Sugestão já encerrada. Atualize a lista.'},409);
  const original=JSON.parse(row.payload);
  if(action==='rejeitar'){
   const rejected=await env.DB.prepare("UPDATE ab_visitor_suggestions SET status='rejeitada',updated_at=datetime('now') WHERE id=? AND status IN ('pendente','rascunho')").bind(id).run();
   return Number(rejected.meta?.changes)?json({ok:true,status:'rejeitada'}):json({error:'Registro já alterado.'},409);
  }
  const map=officialMaps(body.mapsUrl??original.mapsUrl),picked=str(body.approvedName,120);
  const destMode=body.chosenDestinationMode==='novo'?'novo':'existente';
  const chosenDest=str(body.chosenDestinationId);
  const newName=str(body.chosenDestinationName);
  const nameChoice=['visitante','google','manual'].includes(body.nameChoice)?body.nameChoice:'visitante';
  const googleName=str(body.googleName),googlePlaceId=str(body.googlePlaceId,250);
  const googleAddress=str(body.googleAddress,400);
  const mapCoordinates=str(body.mapCoordinates,64);
  if(!map||picked.length<3)return json({error:'Informe nome e link válidos.'},422);
  if(nameChoice==='google'&&!googleName)return json({error:'Consulte o Google Maps antes de escolher o nome oficial.'},422);
  if(destMode==='novo'&&newName.length<3)return json({error:'Informe o nome do novo card.'},422);
  if(destMode==='existente'&&!await isPublishedDestination(env.DB,chosenDest))return json({error:'Selecione um card existente.'},422);
  if(mapCoordinates&&!/^-?\d{1,2}(?:\.\d{1,9})?,-?\d{1,3}(?:\.\d{1,9})?$/.test(mapCoordinates))return json({error:'GPS inválido.'},422);
  const edited={...original,approvedName:picked,mapsUrl:map,nameChoice,chosenDestinationMode:destMode,chosenDestinationId:destMode==='existente'?chosenDest:'',chosenDestinationName:destMode==='novo'?newName:'',googleName,googlePlaceId:googlePlaceId&&/^[a-zA-Z0-9_-]{5,250}$/.test(googlePlaceId)?googlePlaceId:'',googleAddress,mapCoordinates};
  if(action==='salvar'){
   await env.DB.prepare("UPDATE ab_visitor_suggestions SET payload=?,status='rascunho',updated_at=datetime('now') WHERE id=? AND status IN ('pendente','rascunho')").bind(JSON.stringify(edited),id).run();
   return json({ok:true,status:'rascunho'});
  }
  // Publicar novo card e parada somente após aprovação explícita, no mesmo lote.
  let finalDest=chosenDest,destinationRecord=null;
  if(destMode==='novo'){
   const all=(await env.DB.prepare("SELECT id,payload FROM site_content WHERE kind='destinos'").all()).results||[];
   const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   if(all.some(row=>{try{return norm(JSON.parse(row.payload).nome)===norm(newName)}catch{return false}}))return json({error:'Já existe um card com esse nome. Selecione o card existente para evitar duplicação.'},409);
   finalDest='destino-'+crypto.randomUUID().slice(0,12);
   destinationRecord={id:finalDest,nome:newName,descricao:'Descubra os pontos desta viagem.',mapa:newName+', Ceará, Brasil',foto:original.photos[0]||'',status:'publicado'};
  }
  const stopId='parada-'+crypto.randomUUID().slice(0,12);
  const stop={id:stopId,nome:picked,descricao:'Local sugerido por um visitante e aprovado pela administração.',destinoId:finalDest,maps:map,endereco:googleAddress,googlePlaceId:edited.googlePlaceId,mapCoordinates:mapCoordinates,categoria:'turismo',categorias:['turismo'],foto:original.photos[0]||'',status:'publicado'};
  const jobs=[];
  if(destinationRecord)jobs.push(env.DB.prepare("INSERT INTO site_content(id,kind,destino_id,status,payload,updated_at) VALUES(?,'destinos','','publicado',?,datetime('now'))").bind(finalDest,JSON.stringify(destinationRecord)));
  jobs.push(env.DB.prepare("INSERT INTO site_content(id,kind,destino_id,status,payload,updated_at) VALUES(?,'paradas',?,'publicado',?,datetime('now'))").bind(stopId,finalDest,JSON.stringify(stop)));
  jobs.push(env.DB.prepare("UPDATE ab_visitor_suggestions SET payload=?,status='publicado',updated_at=datetime('now') WHERE id=? AND status IN ('pendente','rascunho')").bind(JSON.stringify({...edited,publishedStopId:stopId,publishedDestinationId:finalDest}),id));
  await env.DB.batch(jobs);
  return json({ok:true,status:'publicado',destinationId:finalDest,stopId,createdDestination:!!destinationRecord});
 }catch(e){
  console.error('Visitor suggestion moderation error',String(e?.name||'Error'));
  return json({error:'Não foi possível concluir. Confira o cadastro e tente novamente.'},503);
 }
}