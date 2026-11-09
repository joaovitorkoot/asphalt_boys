// Resolucao pontual de coordenadas para rotas do Asphalt Boys.
// Apenas paradas publicadas no D1; nomes arbitrarios e Place IDs arbitrarios sao recusados.
// Usado sob demanda quando o visitante toca em "Ver rota".
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
}});
const VALID_ID=/^[a-zA-Z0-9_-]{3,120}$/;
const VALID_PLACE=/^[a-zA-Z0-9_-]{5,250}$/;
function validCoords(raw){
 const m=String(raw||'').trim().match(/^(-?\d{1,2}(?:\.\d{1,9})?),\s*(-?\d{1,3}(?:\.\d{1,9})?)$/);
 if(!m)return '';
 const lat=Number(m[1]),lng=Number(m[2]);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?
  lat.toFixed(7)+','+lng.toFixed(7):'';
}
async function officialPosition(placeId,key){
 const uri='https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId)+'?languageCode=pt-BR';
 // A cache armazena somente coordenadas de um Google Place ID, nunca a chave.
 const cacheKey='https://asphalt-boys.pages.dev/.well-known/place-position/'+encodeURIComponent(placeId);
 let cache;
 try{cache=typeof caches!=='undefined'?caches.default:null}catch{cache=null}
 if(cache){
  try{
   const hit=await cache.match(cacheKey);
   if(hit){const parsed=await hit.json();if(validCoords(parsed.coordinate))return parsed.coordinate}
  }catch{}
 }
 const response=await fetch(uri,{headers:{
  'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,location'
 }});
 if(!response.ok)throw Error('Google Places '+response.status);
 const place=await response.json();
 const coordinate=place.location?validCoords(place.location.latitude+','+place.location.longitude):'';
 if(!coordinate)throw Error('Google Places não retornou o ponto');
 if(cache){
  try{await cache.put(cacheKey,new Response(JSON.stringify({coordinate}),{
   headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=21600'}
  }))}catch{}
 }
 return coordinate;
}
export async function onRequestPost({request,env}){
 if(!env.DB)return respond({error:'Banco de dados indisponível.'},503);
 const origin=request.headers.get('Origin')||'';
 const ref=request.headers.get('Referer')||'';
 const host=new URL(request.url).origin;
 let same=false;
 try{same=origin?new URL(origin).origin===host:(ref?new URL(ref).origin===host:false)}catch{}
 if(!same)return respond({error:'Origem não autorizada.'},403);
 if(Number(request.headers.get('content-length')||0)>4000)return respond({error:'Lista muito longa.'},413);
 let body;try{body=await request.json()}catch{return respond({error:'Pedido inválido.'},400)}
 const ids=body?.ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||
    ids.some(id=>typeof id!=='string'||!VALID_ID.test(id))||new Set(ids).size!==ids.length)
  return respond({error:'Escolha de uma a vinte paradas válidas.'},400);
 try{
  const placeholders=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare("SELECT payload FROM site_content WHERE kind='paradas' AND status='publicado' AND id IN ("+placeholders+")").bind(...ids).all()).results||[];
  const found=new Map();
  for(const row of rows){
   try{const stop=JSON.parse(row.payload);found.set(stop.id,stop)}catch{}
  }
  const key=typeof env.GOOGLE_PLACES_API_KEY==='string'?env.GOOGLE_PLACES_API_KEY:'';
  // Sem chave, as coordenadas auditadas continuam válidas, mas não inventar GPS para Places.
  const positions=[];
  for(const id of ids){
   const stop=found.get(id);
   if(!stop){positions.push({id,missing:true});continue}
   const stored=validCoords(stop.mapCoordinates);
   if(stop.mapCoordinatesSource==='google-places'&&stored){
    positions.push({id,coordinate:stored,source:'google-places'});
    continue;
   }
   const place=String(stop.googlePlaceId||'');
   if(key&&VALID_PLACE.test(place)){
    try{
     const coordinate=await officialPosition(place,key);
     positions.push({id,coordinate,source:'google-places',changed:!!stored&&stored!==coordinate});
     continue;
    }catch(e){
     positions.push({id,coordinate:stored||'',source:stored?'stored-unverified':'unresolved',
      warning:'Não foi possível confirmar o Google Place ID ('+String(e.message||e).slice(0,80)+').'});
     continue;
    }
   }
   positions.push({id,coordinate:stored||'',source:stored?'stored-unverified':'unresolved',
    warning:stored?'O ponto ainda não foi confirmado pelo Google Places.':'Este local ainda não possui coordenadas ou Place ID confirmado.'});
  }
  return respond({positions,source:'Google Places para locais identificados',count:positions.length});
 }catch(e){return respond({error:'Não foi possível preparar os locais da rota.'},503)}
}
