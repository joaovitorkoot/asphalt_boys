// Asphalt Boys · Cloudflare Pages Function
// D1 binding: DB. Admin secret: ADMIN_TOKEN (Cloudflare Pages secret).
const TYPES = ['destinos','paradas','rotas'];
const LIMITS = {nome:120,descricao:1500,destinoId:120,endereco:400,mapa:400,maps:1200,foto:1200,fotoAutor:200,fotoLicenca:80,fotoLicencaUrl:600,fotoFonteUrl:1200,fotoOrigem:80,fotoAdaptada:12,fotoEnquadramento:12,googlePlaceId:250,googlePhotoIndex:2,mapCoordinates:64};
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function safeEqual(a,b){
  if(!a||!b)return false;
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;for(let i=0;i<u.length;i++)diff|=u[i]^v[i];return diff===0;
}
function adminReady(env){return typeof env.ADMIN_TOKEN==='string'&&env.ADMIN_TOKEN.trim().length>=20}
async function authorized(req,env){
  if(!adminReady(env))return false;
  const auth=req.headers.get('Authorization')||'';
  return auth.startsWith('Bearer ')&&await safeEqual(auth.slice(7).trim(),env.ADMIN_TOKEN.trim());
}
function cleanRecord(kind,r){
  if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Cadastro inválido.');
  const out={};for(const [key,max] of Object.entries(LIMITS))if(r[key]!==undefined)out[key]=String(r[key]||'').trim().slice(0,max);
  if(!out.nome)throw Error('Informe o nome.');
  if(out.fotoEnquadramento)out.fotoEnquadramento=out.fotoEnquadramento==='zoom'?'zoom':'blur';
  out.id=String(r.id||crypto.randomUUID()).trim().slice(0,120);
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(out.id))throw Error('ID inválido.');
  if(kind!=='destinos'&&!out.destinoId)throw Error('Selecione um destino.');
  // Cards iniciais têm títulos fixos, mas mantêm fotos e demais campos editáveis.
  if(kind==='destinos'&&out.id==='guaramiranga')out.nome='Guaramiranga';
  if(kind==='destinos'&&out.id==='canoa-quebrada')out.nome='Canoa Quebrada';
  if(out.mapCoordinates&&!/^-?\d{1,2}(?:\.\d{1,9})?,-?\d{1,3}(?:\.\d{1,9})?$/.test(out.mapCoordinates))
   throw Error('Coordenadas do ponto inválidas.');
  // Fotos abertas: manter créditos e licença também na resposta pública.
  for(const field of ['fotoLicencaUrl','fotoFonteUrl']){
    if(!out[field])continue;
    try{const u=new URL(out[field]);if(u.protocol!=='https:')throw Error('URL inválida')}
    catch{throw Error('Fonte ou licença da foto precisa ser um link https válido.')}
  }
  if(kind==='paradas'){
    out.categoria=String(r.categoria||'turismo').toLowerCase();
    if(!['cafe','almoco','turismo','descanso'].includes(out.categoria))throw Error('Categoria inválida.');
    out.horario=String(r.horario||'').slice(0,200);
    out.googlePhotoIndex=String(Math.max(0,Math.min(9,parseInt(r.googlePhotoIndex,10)||0)));

    if(out.maps){let u;try{u=new URL(out.maps)}catch{throw Error('Link Google Maps inválido.')}const domains=['google.com','google.com.br','google.pt','google.co.uk','google.es','google.ca','google.fr','google.de','google.com.mx','google.com.ar'];const h=u.hostname.toLowerCase();const valid=domains.some(d=>h===d||h.endsWith('.'+d))||h==='maps.app.goo.gl'||(h==='goo.gl'&&u.pathname.startsWith('/maps/'));if(u.protocol!=='https:'||!valid)throw Error('Informe um link verdadeiro do Google Maps.');}
    if(out.foto&&(!/^https:\/\//.test(out.foto)))throw Error('Foto precisa usar https.');
  }
  if(kind==='rotas'){
    out.paradas=Array.isArray(r.paradas)?r.paradas.map(String).filter(p=>/^[a-zA-Z0-9_-]{3,120}$/.test(p)).slice(0,20):[];
  }
  out.status=r.status==='publicado'?'publicado':'rascunho';
  return out;
}
async function readData(db,admin){
  const sql='SELECT kind,payload FROM site_content '+(admin?'':'WHERE status = ?')+' ORDER BY updated_at ASC';
  const stmt=admin?db.prepare(sql):db.prepare(sql).bind('publicado');
  const rows=(await stmt.all()).results||[];
  const data={destinos:[],paradas:[],rotas:[]};
  for(const row of rows){if(!TYPES.includes(row.kind))continue;try{
    const p=JSON.parse(row.payload);
    // Dados legados podem ter sido importados como "Pico Alto" no card Guaramiranga.
    // Corrigir somente o título retornado, mantendo a mesma foto, ID e paradas.
    if(row.kind==='destinos'&&p.id==='guaramiranga')p.nome='Guaramiranga';
    if(row.kind==='destinos'&&p.id==='canoa-quebrada')p.nome='Canoa Quebrada';
    data[row.kind].push(p);
   }catch{}}
  return data;
}
export async function onRequestGet({request,env}){
  if(!env.DB)return reply({error:'Banco de dados ainda não configurado.',code:'DB_NOT_READY'},503);
  try{
    const admin=new URL(request.url).searchParams.get('admin')==='1';
    if(admin&&!adminReady(env))return reply({error:'O ADMIN_TOKEN não está disponível na produção do Cloudflare Pages ou tem menos de 20 caracteres.',code:'ADMIN_NOT_READY'},503);
    if(admin&&!(await authorized(request,env)))return reply({error:'Senha do administrador diferente do ADMIN_TOKEN salvo na Cloudflare. Confira a senha nova, sem espaços extras.',code:'ADMIN_INVALID_TOKEN'},401);
    return reply(await readData(env.DB,admin));
  }catch(e){return reply({error:'Erro de leitura; confirme a tabela site_content no banco.',details:String(e.message||e).slice(0,170)},500)}
}
export async function onRequestPost({request,env}){
  if(!env.DB)return reply({error:'Banco de dados não configurado.'},503);
  if(!adminReady(env))return reply({error:'ADMIN_TOKEN não configurado na produção ou com menos de 20 caracteres.',code:'ADMIN_NOT_READY'},503);
  if(!(await authorized(request,env)))return reply({error:'Senha do administrador incorreta. Digite o valor novo do ADMIN_TOKEN.',code:'ADMIN_INVALID_TOKEN'},401);
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
  if(!adminReady(env))return reply({error:'ADMIN_TOKEN não configurado na produção ou com menos de 20 caracteres.',code:'ADMIN_NOT_READY'},503);
  if(!(await authorized(request,env)))return reply({error:'Senha do administrador incorreta.',code:'ADMIN_INVALID_TOKEN'},401);
  try{const b=await request.json();if(!TYPES.includes(b.kind)||!/^[a-zA-Z0-9_-]{3,120}$/.test(String(b.id||'')))return reply({error:'Registro inválido.'},400);
    if(b.kind==='paradas'){
      const routes=(await env.DB.prepare("SELECT payload FROM site_content WHERE kind = 'rotas'").all()).results||[];
      for(const row of routes){
        try{
          const route=JSON.parse(row.payload);
          if(Array.isArray(route.paradas)&&route.paradas.includes(b.id))
            return reply({error:'Esta parada faz parte de uma rota pronta. Remova-a da rota antes de excluir.'},409);
        }catch{}
      }
    }
    await env.DB.prepare('DELETE FROM site_content WHERE id = ? AND kind = ?').bind(b.id,b.kind).run();
    return reply({ok:true});
  }catch(e){return reply({error:'Não foi possível excluir.'},400)}
}
