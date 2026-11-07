// Asphalt Boys · Cloudflare Pages Function
// D1 binding: DB. Admin secret: ADMIN_TOKEN (Cloudflare Pages secret).
const TYPES = ['destinos','paradas','rotas'];
const LIMITS = {nome:120,descricao:1500,destinoId:120,endereco:400,maps:1200,foto:1200,googlePlaceId:250};
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function safeEqual(a,b){
  if(!a||!b)return false;
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;for(let i=0;i<u.length;i++)diff|=u[i]^v[i];return diff===0;
}
async function authorized(req,env){
  if(!env.ADMIN_TOKEN||String(env.ADMIN_TOKEN).length<20)return false;
  const auth=req.headers.get('Authorization')||'';
  return auth.startsWith('Bearer ')&&await safeEqual(auth.slice(7),env.ADMIN_TOKEN);
}
function cleanRecord(kind,r){
  if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Cadastro inválido.');
  const out={};for(const [key,max] of Object.entries(LIMITS))if(r[key]!==undefined)out[key]=String(r[key]||'').trim().slice(0,max);
  if(!out.nome)throw Error('Informe o nome.');
  out.id=String(r.id||crypto.randomUUID()).trim().slice(0,120);
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(out.id))throw Error('ID inválido.');
  if(kind!=='destinos'&&!out.destinoId)throw Error('Selecione um destino.');
  if(kind==='paradas'){
    out.categoria=String(r.categoria||'turismo').toLowerCase();
    if(!['cafe','almoco','turismo','descanso'].includes(out.categoria))throw Error('Categoria inválida.');
    out.horario=String(r.horario||'').slice(0,200);
    if(out.maps){let u;try{u=new URL(out.maps)}catch{throw Error('Link Google Maps inválido.')}if(u.protocol!=='https:'||!(/(^|\\.)google\\.[a-z.]+$/.test(u.hostname)||u.hostname==='maps.app.goo.gl'))throw Error('Informe um link verdadeiro do Google Maps.');}
    if(out.foto&&(!/^https:\/\//.test(out.foto)))throw Error('Foto precisa usar https.');
  }
  if(kind==='rotas'){
    out.paradas=Array.isArray(r.paradas)?r.paradas.map(String).filter(p=>/^[a-zA-Z0-9_-]{3,120}$/.test(p)).slice(0,20):[];
  }
  out.status=r.status==='publicado'?'publicado':'rascunho';
  return out;
}
async function readData(db,admin){
  const rows=(await db.prepare('SELECT kind,payload FROM site_content '+(admin?'':'WHERE status = ?')+' ORDER BY updated_at ASC').bind(...(admin?[]:['publicado'])).all()).results||[];
  const data={destinos:[],paradas:[],rotas:[]};
  for(const row of rows){if(!TYPES.includes(row.kind))continue;try{data[row.kind].push(JSON.parse(row.payload))}catch{}}
  return data;
}
export async function onRequestGet({request,env}){
  if(!env.DB)return reply({error:'Banco de dados ainda não configurado.',code:'DB_NOT_READY'},503);
  try{
    const admin=new URL(request.url).searchParams.get('admin')==='1';
    if(admin&&!(await authorized(request,env)))return reply({error:'Acesso administrativo não autorizado.'},401);
    return reply(await readData(env.DB,admin));
  }catch(e){return reply({error:'Erro de leitura; confirme a tabela site_content no banco.',details:String(e.message||e).slice(0,170)},500)}
}
export async function onRequestPost({request,env}){
  if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
  if(!(await authorized(request,env)))return reply({error:'Token administrativo incorreto ou não configurado.'},401);
  try{
    if(Number(request.headers.get('content-length')||0)>40000)return reply({error:'Cadastro muito grande.'},413);
    const b=await request.json();if(!TYPES.includes(b.kind))return reply({error:'Tipo inválido.'},400);
    const p=cleanRecord(b.kind,b.record);
    await env.DB.prepare('INSERT INTO site_content(id,kind,destino_id,status,payload,updated_at) VALUES(?,?,?,?,?,datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,destino_id=excluded.destino_id,status=excluded.status,payload=excluded.payload,updated_at=datetime(\'now\')').bind(p.id,b.kind,p.destinoId||'',p.status,JSON.stringify(p)).run();
    return reply({ok:true,record:p});
  }catch(e){return reply({error:String(e.message||e).slice(0,200)},400)}
}
export async function onRequestDelete({request,env}){
  if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
  if(!(await authorized(request,env)))return reply({error:'Não autorizado.'},401);
  try{const b=await request.json();if(!TYPES.includes(b.kind)||!/^[a-zA-Z0-9_-]{3,120}$/.test(String(b.id||'')))return reply({error:'Registro inválido.'},400);
    await env.DB.prepare('DELETE FROM site_content WHERE id = ? AND kind = ?').bind(b.id,b.kind).run();
    return reply({ok:true});
  }catch(e){return reply({error:'Não foi possível excluir.'},400)}
}
