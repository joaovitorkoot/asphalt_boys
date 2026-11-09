// Identificar um ponto de saida usando coordenadas, enderecos ou links Google Maps.
// Apenas consultas same-origin; a chave Google Places fica exclusivamente no servidor.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
}});
const VALID_PLACE=/^[A-Za-z0-9_-]{5,250}$/;
function coords(raw){
 const match=String(raw||'').trim().match(/^\s*\(?(-?\d{1,2}(?:\.\d{1,9})?)\s*[,;]\s*(-?\d{1,3}(?:\.\d{1,9})?)\)?\s*$/);
 if(!match)return '';
 const lat=Number(match[1]),lng=Number(match[2]);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?
  lat.toFixed(7)+','+lng.toFixed(7):'';
}
function googleUrl(value){
 let u;try{u=new URL(value)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase();
 if(['maps.app.goo.gl','goo.gl'].includes(host))return host==='goo.gl'&&!u.pathname.startsWith('/maps/')?null:u;
 const suffix=['google.com','google.com.br','google.pt','google.co.uk','google.es','google.fr'];
 return suffix.some(domain=>host===domain||host.endsWith('.'+domain))?u:null;
}
function mapPin(u){
 let content;try{content=decodeURIComponent(u.pathname+u.search+u.hash)}catch{content=u.pathname+u.search+u.hash}
 const pin=content.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
 if(pin){const p=coords(pin[1]+','+pin[2]);if(p)return p}
 for(const key of ['q','query','destination','daddr','ll']){
  const p=coords(u.searchParams.get(key));if(p)return p;
 }
 const exact=content.match(/\/maps\/(?:place|search)\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\/|$)/);
 return exact?coords(exact[1]+','+exact[2]):'';
}
function parsePlace(u){
 const parts=u.pathname.split('/').filter(Boolean);
 const at=parts.indexOf('place');
 const fromPath=at>=0?parts[at+1]||'':'';
 const q=u.searchParams.get('query')||u.searchParams.get('q')||fromPath||'';
 return String(q).replace(/\+/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
}
async function expandShort(input){
 let u=input;
 for(let i=0;i<5&&['maps.app.goo.gl','goo.gl'].includes(u.hostname);i++){
  const response=await fetch(u.href,{method:'GET',redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; AsphaltBoysPlanner/1.0)'}});
  const loc=response.headers.get('location');
  if(!(response.status>=300&&response.status<400&&loc))
   throw Error('Não foi possível expandir o link curto. Abra a ficha no Google Maps e copie o link completo.');
  const next=googleUrl(new URL(loc,u.href).href);
  if(!next)throw Error('O Google redirecionou para um endereço não permitido.');
  u=next;
 }
 if(['maps.app.goo.gl','goo.gl'].includes(u.hostname))throw Error('O link curto não pôde ser expandido.');
 return u;
}
const mapFor=p=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p);
function point(raw,name,address,placeId='',map=''){
 return {name:String(name||'Ponto de saída').slice(0,120),
  address:String(address||'').slice(0,350),coordinate:coords(raw),placeId:VALID_PLACE.test(placeId)?placeId:'',
  maps:map&&googleUrl(map)?map.slice(0,1200):mapFor(raw),verified:true};
}
async function lookup(query,key,pin='',placeId=''){
 if(!key)throw Error('Google Places indisponível no momento.');
 let endpoint,request;
 const fields='id,displayName,formattedAddress,location,googleMapsUri';
 if(placeId&&VALID_PLACE.test(placeId)){
  endpoint='https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId)+'?languageCode=pt-BR';
  request={headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':fields}};
 }else{
  if(query.length<4)throw Error('Informe um endereço mais completo ou um ponto do Google Maps.');
  endpoint='https://places.googleapis.com/v1/places:searchText';
  const body={textQuery:query,regionCode:'BR',languageCode:'pt-BR',pageSize:5};
  if(pin){
   const [latitude,longitude]=pin.split(',').map(Number);
   body.locationBias={circle:{center:{latitude,longitude},radius:1200}};
  }
  request={method:'POST',headers:{'Content-Type':'application/json',
   'X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.'+fields.split(',').join(',places.')},
   body:JSON.stringify(body)};
 }
 const response=await fetch(endpoint,request);
 if(!response.ok)throw Error(response.status===429?'Limite temporário de consultas do Google.':
  response.status===403?'Google Places não autorizado no servidor.':'Google Places não respondeu ('+response.status+').');
 const payload=await response.json();
 const list=Array.isArray(payload.places)?payload.places:[payload];
 return list.map(p=>{
  const raw=p.location?Number(p.location.latitude)+','+Number(p.location.longitude):'';
  const coordinate=coords(raw);
  return coordinate?point(coordinate,p.displayName?.text||query,p.formattedAddress||'',p.id||'',p.googleMapsUri||'') : null;
 }).filter(Boolean).slice(0,5);
}
async function build(input,key){
 const direct=coords(input);
 if(direct)return {results:[point(direct,'Ponto por coordenadas',direct)],notice:'Coordenadas identificadas. Confira o marcador no Maps.'};
 if(/^https?:\/\//i.test(input)){
  let url=googleUrl(input);
  if(!url)throw Error('Use somente links oficiais HTTPS do Google Maps.');
  url=await expandShort(url);
  const pin=mapPin(url);
  const placeId=String(url.searchParams.get('query_place_id')||'').trim();
  if(VALID_PLACE.test(placeId)){
   const result=await lookup('',key,pin,placeId);
   if(result.length)return {results:result};
  }
  const name=parsePlace(url);
  if(name&&coords(name))return {results:[point(coords(name),'Ponto por coordenadas',coords(name))]};
  if(name.length>=4){
   try{
    const results=await lookup(name,key,pin);
    if(pin){
     const [lat,lng]=pin.split(',').map(Number),r=Math.PI/180;
     const near=results.filter(p=>{
      const [x,y]=p.coordinate.split(',').map(Number);
      const dlat=(x-lat)*r,dlon=(y-lng)*r;
      const h=Math.sin(dlat/2)**2+Math.cos(lat*r)*Math.cos(x*r)*Math.sin(dlon/2)**2;
      return 12742000*Math.asin(Math.min(1,Math.sqrt(h)))<1500;
     });
     if(near.length)return {results:near,notice:'Escolha o local correto e confirme no mapa.'};
     return {results:[point(pin,'Ponto indicado no link',pin)],notice:'O nome não correspondeu a um local próximo. Confira o pin exato.'};
    }
    if(results.length)return {results,notice:'Confira o estabelecimento antes de selecionar.'};
   }catch(error){if(!pin)throw error}
  }
  if(pin)return {results:[point(pin,'Ponto indicado no link',pin)],notice:'Pin identificado no link. Confira no Google Maps.'};
  throw Error('Esse link não identifica um ponto exato. Compartilhe a ficha do local, não apenas a visualização do mapa.');
 }
 if(input.length<4||input.length>180)throw Error('Digite um endereço mais completo para pesquisar.');
 const results=await lookup(input,key);
 if(!results.length)throw Error('Não encontrei esse endereço. Informe rua, número e cidade ou cole o link do Maps.');
 return {results,notice:results.length>1?'Escolha o ponto correto entre os resultados.':'Confira o marcador antes de selecionar.'};
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin')||'',referer=request.headers.get('Referer')||'';
 const host=new URL(request.url).origin;
 let accepted=false;
 try{accepted=origin?new URL(origin).origin===host:referer?new URL(referer).origin===host:false}catch{}
 if(!accepted)return reply({error:'Origem não autorizada.'},403);
 if(Number(request.headers.get('content-length')||0)>2200)return reply({error:'Pesquisa muito longa.'},413);
 let body;try{body=await request.json()}catch{return reply({error:'Pesquisa inválida.'},400)}
 const input=typeof body?.input==='string'?body.input.trim():'';
 if(input.length<4||input.length>900)return reply({error:'Informe um endereço, coordenadas ou um link válido.'},400);
 try{
  const result=await build(input,String(env.GOOGLE_PLACES_API_KEY||''));
  return reply(result);
 }catch(error){return reply({error:String(error.message||error).slice(0,240)},422)}
}
