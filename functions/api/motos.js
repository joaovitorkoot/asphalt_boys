// Asphalt Boys: catálogo de motos e acessórios de afiliado, armazenado no Cloudflare D1.
import {sessionFor,sameOrigin} from './auth.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const ids=v=>/^[a-zA-Z0-9_-]{3,120}$/.test(String(v||''));
const categories=['viagem','protecao','estilo'];
const initialBikes=[
 {id:'fz25',nome:'Yamaha Fazer FZ25',descricao:'Primeiro modelo do catálogo de acessórios',foto:'https://yamahamotors.fbitsstatic.net/img/p/fazer-fz25-connected-155370/352536-1.jpg',status:'publicado',order:0},
 {id:'titan150',nome:'Honda CG Titan 150',descricao:'Outro modelo para personalizar',foto:'',status:'publicado',order:1}
];
const initialGroups=[
 {id:'suporte',nome:'Suporte para celular',categoria:'viagem',ordem:0},
 {id:'bau',nome:'Baú traseiro',categoria:'viagem',ordem:1},
 {id:'bolsa',nome:'Bolsa de tanque',categoria:'viagem',ordem:2},
 {id:'protetor',nome:'Protetor de motor',categoria:'protecao',ordem:3},
 {id:'manoplas',nome:'Manoplas',categoria:'estilo',ordem:4},
 {id:'bolha',nome:'Bolha esportiva',categoria:'estilo',ordem:5}
];
const demoVariants={
 suporte:[['trava','Suporte com trava de segurança','Fixação no guidão com mecanismo de travamento.'],['antivibracao','Suporte antivibração','Modelo com sistema para reduzir vibrações.'],['impermeavel','Suporte com capa impermeável','Capa com proteção contra respingos.']],
 bau:[['bau35','Baú compacto de 35 L','Uma opção para deslocamentos e passeios.'],['bau45','Baú de 45 L','Mais espaço para bagagens de viagem.']],
 bolsa:[['bolsa10','Bolsa compacta','Espaço prático para pequenos objetos.'],['bolsa18','Bolsa expansível','Opção maior para carregar seus pertences.']],
 protetor:[['slider','Slider de proteção','Opção de proteção lateral.'],['tubular','Protetor tubular','Estrutura metálica externa de proteção.']],
 manoplas:[['borracha','Manoplas de borracha','Acabamento discreto e confortável.'],['premium','Manoplas esportivas','Estilo personalizado para o guidão.']],
 bolha:[['fume','Bolha fumê','Visual escurecido e esportivo.'],['transparente','Bolha transparente','Acabamento discreto para a frente da moto.']]
};
function seedResponse(){
 const models=Object.fromEntries(initialBikes.map(b=>[b.id,initialGroups.map(g=>({...g,modelos:demoVariants[g.id].map(([id,nome,descricao])=>({id,nome,descricao,foto:'',shopee:'',mercadolivre:'',demo:true}))}))]));
 return {motos:initialBikes,grupos:models,demo:true};
}
async function dbInit(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS ab_motos_catalog (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,bike_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
}
function cleanUrl(value,{image=false}={}){
 const url=String(value||'').trim();
 if(!url)return '';
 if(url.length>1600)throw Error('Link muito longo.');
 if(image&&url.startsWith('/api/image?id=')&&/^\/api\/image\?id=[a-zA-Z0-9_-]{10,80}$/.test(url))return url;
 let parsed;
 try{parsed=new URL(url)}catch{throw Error('Informe links completos começando com https://.')}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Somente links seguros https:// são permitidos.');
 return parsed.href;
}
function clean(kind,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Cadastro inválido.');
 const id=String(input.id||crypto.randomUUID()).trim();
 if(!ids(id))throw Error('Identificador inválido.');
 const nome=String(input.nome||'').trim().slice(0,120);
 if(!nome)throw Error('Informe o nome.');
 const status=input.status==='publicado'?'publicado':'rascunho';
 if(kind==='moto')return {id,nome,descricao:String(input.descricao||'').trim().slice(0,320),foto:cleanUrl(input.foto,{image:true}),status,order:Math.max(0,Math.min(9999,Number(input.order)||0))};
 const bikeId=String(input.bikeId||'').trim();
 if(!ids(bikeId))throw Error('Selecione uma moto.');
 const categoria=String(input.categoria||'viagem');
 if(!categories.includes(categoria))throw Error('Categoria inválida.');
 const grupoId=String(input.grupoId||'').trim();
 if(!ids(grupoId))throw Error('Categoria de acessório inválida.');
 return {id,nome,descricao:String(input.descricao||'').trim().slice(0,500),foto:cleanUrl(input.foto,{image:true}),status,bikeId,categoria,grupoId,shopee:cleanUrl(input.shopee),mercadolivre:cleanUrl(input.mercadolivre),order:Math.max(0,Math.min(9999,Number(input.order)||0))};
}
async function load(db,all=false){
 await dbInit(db);
 const stmt=all?db.prepare("SELECT kind,payload FROM ab_motos_catalog ORDER BY updated_at ASC"):db.prepare("SELECT kind,payload FROM ab_motos_catalog WHERE status='publicado' ORDER BY updated_at ASC");
 const rows=(await stmt.all()).results||[];
 const motos=[],acessorios=[];
 for(const row of rows)try{const value=JSON.parse(row.payload);if(row.kind==='moto')motos.push(value);else if(row.kind==='acessorio')acessorios.push(value)}catch{}
 const exists=new Set(motos.map(m=>m.id));
 for(const bike of initialBikes)if(!exists.has(bike.id))motos.push({...bike});
 motos.sort((a,b)=>(a.order||0)-(b.order||0));
 const grupos={};
 for(const bike of motos){
  grupos[bike.id]=initialGroups.map(g=>({...g,modelos:[]}));
 }
 for(const item of acessorios){
  const arr=grupos[item.bikeId];if(!arr)continue;
  const group=arr.find(x=>x.id===item.grupoId);if(group)group.modelos.push(item);
 }
 for(const bike of motos){
  // Exemplos de interface disponíveis somente enquanto a moto não tem itens cadastrados.
  if(acessorios.some(x=>x.bikeId===bike.id))continue;
  for(const group of grupos[bike.id]){
   group.modelos=demoVariants[group.id].map(([id,nome,descricao])=>({
    id:bike.id+'-'+id,nome,descricao,foto:'',shopee:'',mercadolivre:'',demo:true,grupoId:group.id,bikeId:bike.id,categoria:group.categoria,status:'publicado'
   }));
  }
 }
 return {motos,grupos,acessorios,demo:acessorios.length===0};
}
async function requireAdmin(request,env){
 if(!sameOrigin(request))return false;
 return !!(await sessionFor(request,env));
}
export async function onRequestGet({request,env}){
 if(!env.DB){if(new URL(request.url).searchParams.has('admin'))return json({error:'Banco D1 não configurado.'},503);return json(seedResponse(),200);}
 try{
  const admin=new URL(request.url).searchParams.has('admin');
  if(admin&&!(await sessionFor(request,env)))return json({error:'Acesso administrativo necessário.'},401);
  const data=await load(env.DB,admin);
  if(!admin)delete data.acessorios;
  return json(data);
 }catch(e){return json({error:'Não foi possível carregar o catálogo.',detail:String(e.message||e).slice(0,100)},500)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:'Banco D1 não configurado.'},503);
 if(!(await requireAdmin(request,env)))return json({error:'Entre no painel para alterar as motos.'},401);
 try{
  if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Cadastro muito grande.'},413);
  const body=await request.json();
  if(!['moto','acessorio'].includes(body.kind))return json({error:'Tipo inválido.'},400);
  const value=clean(body.kind,body.record);
  await dbInit(env.DB);
  if(body.kind==='acessorio'){
   const motos=await load(env.DB,true);
   if(!motos.motos.some(x=>x.id===value.bikeId))return json({error:'Moto não encontrada.'},400);
  }
  await env.DB.prepare("INSERT INTO ab_motos_catalog(id,kind,bike_id,status,payload,updated_at) VALUES(?,?,?,?,?,datetime('now')) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,bike_id=excluded.bike_id,status=excluded.status,payload=excluded.payload,updated_at=datetime('now')")
  .bind(value.id,body.kind,body.kind==='acessorio'?value.bikeId:'',value.status,JSON.stringify(value)).run();
  return json({ok:true,record:value});
 }catch(e){return json({error:String(e.message||e).slice(0,220)},400)}
}
export async function onRequestDelete({request,env}){
 if(!env.DB)return json({error:'Banco D1 não configurado.'},503);
 if(!(await requireAdmin(request,env)))return json({error:'Entre no painel para excluir.'},401);
 try{
  const b=await request.json();
  if(!['moto','acessorio'].includes(b.kind)||!ids(b.id))return json({error:'Registro inválido.'},400);
  if(b.kind==='moto'&&(b.id==='fz25'||b.id==='titan150'))return json({error:'As motos iniciais podem ser editadas, mas não excluídas.'},409);
  await dbInit(env.DB);
  if(b.kind==='moto'){
   const refs=(await env.DB.prepare("SELECT id FROM ab_motos_catalog WHERE kind='acessorio' AND bike_id=? LIMIT 1").bind(b.id).all()).results||[];
   if(refs.length)return json({error:'Exclua os acessórios desta moto antes.'},409);
  }
  await env.DB.prepare('DELETE FROM ab_motos_catalog WHERE id=? AND kind=?').bind(b.id,b.kind).run();
  return json({ok:true});
 }catch(e){return json({error:'Não foi possível excluir.'},400)}
}
