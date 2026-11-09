// Asphalt Boys: auditoria administrativa dos pontos cadastrados no Cloudflare D1.
// Cada consulta ao Places API (New) ocorre somente após o administrador solicitar.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
async function authorized(req,env){
 const token=String(env.ADMIN_TOKEN||'').trim(),value=req.headers.get('Authorization')||'';
 if(token.length<20||!value.startsWith('Bearer '))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([
  crypto.subtle.digest('SHA-256',enc.encode(token)),
  crypto.subtle.digest('SHA-256',enc.encode(value.slice(7).trim()))
 ]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
const validId=s=>/^[a-zA-Z0-9_-]{3,120}$/.test(String(s||''));
const validPlace=s=>/^[a-zA-Z0-9_-]{5,250}$/.test(String(s||''));
function coordinates(value){
 const m=String(value||'').match(/^\s*(-?\d{1,2}(?:\.\d{1,9})?),\s*(-?\d{1,3}(?:\.\d{1,9})?)\s*$/);
 if(!m)return null;
 const lat=Number(m[1]),lng=Number(m[2]);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{latitude:lat,longitude:lng}:null;
}
function embeddedPin(raw){
 let u;try{u=new URL(raw)}catch{return null}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||!(['maps.app.goo.gl','goo.gl'].includes(host)||
  ['google.com','google.com.br'].some(h=>host===h||host.endsWith('.'+h))))return null;
 let full;try{full=decodeURIComponent(u.pathname+u.search+u.hash)}catch{full=u.pathname+u.search+u.hash}
 const m=full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
 if(m)return coordinates(m[1]+','+m[2]);
 for(const key of ['q','query','destination','daddr']){
  const point=coordinates(u.searchParams.get(key));if(point)return point;
 }
 return null; // '/maps/@' é o centro da câmera, NÃO o pin.
}
function meters(a,b){
 if(!a||!b)return null;
 const d=Math.PI/180,da=(b.latitude-a.latitude)*d,db=(b.longitude-a.longitude)*d;
 const q=Math.sin(da/2)**2+Math.cos(a.latitude*d)*Math.cos(b.latitude*d)*Math.sin(db/2)**2;
 return Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(q))));
}
function normalize(s){
 return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
async function details(id,key){
 const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(id)+'?languageCode=pt-BR',{
  headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,displayName,formattedAddress,location,googleMapsUri'}
 });
 if(!response.ok)throw Error('Google Places '+response.status);
 const p=await response.json();
 return {id:p.id||id,name:p.displayName?.text||'',address:p.formattedAddress||'',
  coordinates:p.location&&Number.isFinite(p.location.latitude)&&Number.isFinite(p.location.longitude)?
   {latitude:p.location.latitude,longitude:p.location.longitude}:null,
  maps:typeof p.googleMapsUri==='string'?p.googleMapsUri:''};
}
async function candidatesFor(stop,key){
 const query=[stop.nome,stop.endereco].filter(Boolean).join(', ').slice(0,300);
 if(query.length<4)return [];
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
  method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,
    'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri'},
  body:JSON.stringify({textQuery:query,languageCode:'pt-BR',regionCode:'BR',pageSize:3})
 });
 if(!response.ok)throw Error('Google Places busca '+response.status);
 const payload=await response.json();
 return (payload.places||[]).filter(p=>validPlace(p.id)&&p.location).slice(0,3).map(p=>({
  id:p.id,name:p.displayName?.text||'',address:p.formattedAddress||'',maps:p.googleMapsUri||'',
  coordinates:{latitude:p.location.latitude,longitude:p.location.longitude}
 }));
}
async function auditOne(stop,key){
 const stored=coordinates(stop.mapCoordinates),pin=embeddedPin(stop.maps);
 const base={id:stop.id,destinoId:stop.destinoId,nome:stop.nome,
  link:stop.maps||'',googlePlaceId:stop.googlePlaceId||'',
  cadastrado:stored,linkPin:pin,google:null,options:[],distanceMeters:null,
  originalDistanceMeters:null,status:'revisar',problems:[]};
 const id=validPlace(stop.googlePlaceId)?stop.googlePlaceId:'';
 try{
  if(id){
   base.google=await details(id,key);
   const target=base.google.coordinates;
   base.distanceMeters=meters(stored,target);
   base.originalDistanceMeters=meters(pin,target);
   if(!target)base.problems.push('O Google não retornou coordenadas para este Place ID.');
   if(base.distanceMeters!==null&&base.distanceMeters>250)
    base.problems.push('GPS cadastrado difere '+base.distanceMeters+' m do Google Places.');
   if(base.originalDistanceMeters!==null&&base.originalDistanceMeters>250)
    base.problems.push('Pin do link original difere '+base.originalDistanceMeters+' m do Google Places.');
   const savedName=normalize(stop.nome),placeName=normalize(base.google.name);
   if(savedName&&placeName&&!savedName.includes(placeName)&&!placeName.includes(savedName)){
    const first=savedName.split(' ').filter(x=>x.length>=4);
    const shared=first.some(x=>placeName.split(' ').includes(x));
    if(!shared)base.problems.push('Nome do Google não parece corresponder ao nome cadastrado.');
   }
   base.status=base.problems.length?'divergente':(!stored?'gps_disponivel':'compativel');
  }else{
   base.options=await candidatesFor(stop,key);
   base.problems.push('Sem Place ID confirmado: confirme manualmente um dos resultados sugeridos.');
   if(!stored&&!pin)base.problems.push('Sem coordenada exata nem pin extraível do link.');
   base.status='revisar';
  }
 }catch(error){
  base.status='erro';base.problems.push('Não foi possível consultar o Google: '+String(error.message||error));
 }
 return base;
}
export async function onRequestPost({request,env}){
 if(!(await authorized(request,env)))return json({error:'Acesso administrativo necessário.'},401);
 if(!env.DB)return json({error:'Banco D1 indisponível.'},503);
 if(!env.GOOGLE_PLACES_API_KEY)return json({error:'GOOGLE_PLACES_API_KEY não configurada.'},503);
 if(Number(request.headers.get('content-length')||0)>1500)return json({error:'Lote grande demais.'},413);
 let body;try{body=await request.json()}catch{return json({error:'JSON inválido.'},400)}
 const ids=body?.ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>6||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)
  return json({error:'Envie de uma a seis paradas com IDs válidos.'},400);
 try{
  const q=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare("SELECT payload FROM site_content WHERE kind = 'paradas' AND id IN ("+q+")").bind(...ids).all()).results||[];
  const byId=new Map();
  for(const row of rows)try{const p=JSON.parse(row.payload);byId.set(p.id,p)}catch{}
  const results=[];
  for(const id of ids){
   const stop=byId.get(id);
   if(!stop){results.push({id,status:'ausente',nome:id,problems:['Parada não encontrada no banco D1.']});continue}
   results.push(await auditOne(stop,String(env.GOOGLE_PLACES_API_KEY)));
  }
  return json({results});
 }catch(error){return json({error:'Falha ao consultar a auditoria: '+String(error.message||error).slice(0,130)},502)}
}
