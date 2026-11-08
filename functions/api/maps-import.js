// Importação de links do Google Maps para destinos, paradas e rotas prontas.
// Secret e token são usados somente no servidor. URLs externas nunca são abertas livremente.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
function allowedUrl(input){
  let u;try{u=new URL(input)}catch{return null}
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase();
  const domains=["google.com","google.com.br","google.pt","google.co.uk","google.es","google.fr","google.de","google.com.mx","google.com.ar","maps.app.goo.gl"];
  const ok=domains.some(d=>host===d||host.endsWith("."+d))||(host==="goo.gl"&&u.pathname.startsWith("/maps/"));
  return ok?u:null;
}
async function auth(req,env){
  if(typeof env.ADMIN_TOKEN!=="string"||env.ADMIN_TOKEN.trim().length<20)return false;
  const value=req.headers.get("Authorization")||"";
  if(!value.startsWith("Bearer "))return false;
  const enc=new TextEncoder();
  const a=await crypto.subtle.digest("SHA-256",enc.encode(value.slice(7).trim()));
  const b=await crypto.subtle.digest("SHA-256",enc.encode(env.ADMIN_TOKEN.trim()));
  const left=new Uint8Array(a),right=new Uint8Array(b);let diff=0;
  for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
  return diff===0;
}
async function resolveShortUrl(u){
  for(let i=0;i<5;i++){
    if(u.hostname!=="maps.app.goo.gl"&&u.hostname!=="goo.gl")break;
    const res=await fetch(u.href,{method:"GET",redirect:"manual",headers:{"User-Agent":"Mozilla/5.0 (compatible; AsphaltBoysPlacesImport/1.0)"}});
    const loc=res.headers.get("location");
    if(res.status>=300&&res.status<400&&loc){
      const next=allowedUrl(new URL(loc,u.href).href);
      if(!next)throw Error("O link do Google redirecionou para um endereço não permitido.");
      u=next;
    }else if(res.status===200){
      // Alguns links curtos são páginas HTML sem redirecionamento HTTP.
      throw Error("Não foi possível expandir o link curto. Abra-o no Google Maps e copie o link completo.");
    }else throw Error("Não foi possível abrir o link curto do Google Maps.");
  }
  if(u.hostname==="maps.app.goo.gl"||u.hostname==="goo.gl")throw Error("O link curto não pôde ser resolvido.");
  return u;
}
function decoded(v){try{return decodeURIComponent(String(v||"").replace(/\+/g," ")).replace(/\s+/g," ").trim().slice(0,350)}catch{return String(v||"").slice(0,350)}}
function parseMaps(u){
 const parts=u.pathname.split("/").filter(Boolean);
 const idx=parts.indexOf("dir");
 const origin=u.searchParams.get("origin")||u.searchParams.get("saddr")||"";
 const destination=u.searchParams.get("destination")||u.searchParams.get("daddr")||"";
 const waypoints=(u.searchParams.get("waypoints")||"").split("|").map(decoded).filter(Boolean);
 if(idx!==-1||destination||origin||waypoints.length){
   let o=decoded(origin),d=decoded(destination),w=waypoints;
   const routeParts=idx>=0?parts.slice(idx+1).filter(p=>p&&!p.startsWith("@")&&!p.startsWith("data=")&&p!=="data"):[]; 
   const list=routeParts.map(decoded).filter(Boolean);
   if(!o&&list.length>=2)o=list[0];
   if(!d&&list.length>=2)d=list[list.length-1];
   if(!w.length&&list.length>2)w=list.slice(1,-1);
   if(!d)return {error:"Não foi possível identificar o destino final do trajeto. Compartilhe a rota completa pelo Google Maps."};
   return {type:"route",route:{origin:o,destination:d,waypoints:w.slice(0,20),maps:u.href.slice(0,1200),name:"Rota para "+d.slice(0,100)}};
 }
 const placeIndex=parts.indexOf("place");
 const placeName=placeIndex>=0?parts[placeIndex+1]||"":"";
 const query=decoded(u.searchParams.get("query")||u.searchParams.get("q")||placeName||"");
 const placeId=String(u.searchParams.get("query_place_id")||"").trim().slice(0,250);
 if(!query&&!placeId)return {error:"Não encontrei o nome desse local no link. Tente compartilhar a ficha do lugar pelo Google Maps."};
 return {type:"place",query,placeId};
}
export async function onRequestPost({request,env}){
 if(!(await auth(request,env)))return json({error:"Conecte ao banco usando a senha de administrador antes de importar."},401);
 if(!env.GOOGLE_PLACES_API_KEY)return json({error:"A chave GOOGLE_PLACES_API_KEY não está disponível neste ambiente."},503);
 if(Number(request.headers.get("content-length")||0)>3000)return json({error:"O link é muito longo."},413);
 let body;try{body=await request.json()}catch{return json({error:"Envie um link válido."},400)}
 const value=typeof body?.url==="string"?body.url.trim():"";
 if(value.length<15||value.length>1800)return json({error:"Cole um link completo do Google Maps."},400);
 let u=allowedUrl(value);
 if(!u)return json({error:"Use apenas links https oficiais do Google Maps."},400);
 try{
   u=await resolveShortUrl(u);
   const parsed=parseMaps(u);
   if(parsed.error)return json({error:parsed.error},422);
   if(parsed.type==="route")return json(parsed);
   const key=String(env.GOOGLE_PLACES_API_KEY);
   let url,init;
   if(parsed.placeId&&/^[a-zA-Z0-9_-]{5,250}$/.test(parsed.placeId)){
     url="https://places.googleapis.com/v1/places/"+encodeURIComponent(parsed.placeId)+"?languageCode=pt-BR";
     init={method:"GET",headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":"id,displayName,formattedAddress,googleMapsUri,primaryTypeDisplayName"}};
   }else{
     if(parsed.query.length<3)return json({error:"O link não contém um nome de local válido."},422);
     url="https://places.googleapis.com/v1/places:searchText";
     init={method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.primaryTypeDisplayName"},body:JSON.stringify({textQuery:parsed.query,languageCode:"pt-BR",regionCode:"BR",pageSize:5})};
   }
   const resp=await fetch(url,init);
   if(!resp.ok)return json({error:resp.status===403?"O Google recusou a consulta (403); confira faturamento e Places API (New).":resp.status===429?"Limite de consultas do Google atingido.":"O Google não conseguiu identificar o local ("+resp.status+")."},502);
   const payload=await resp.json();
   const list=Array.isArray(payload.places)?payload.places:[payload];
   const matches=list.slice(0,5).map(p=>({
     id:String(p.id||"").slice(0,250),name:String(p.displayName?.text||"").slice(0,120),
     address:String(p.formattedAddress||"").slice(0,400),maps:String(p.googleMapsUri||u.href).slice(0,1200),
     category:String(p.primaryTypeDisplayName?.text||"").slice(0,100)
   })).filter(p=>p.id&&p.name);
   if(!matches.length)return json({error:"O Google não retornou locais. Tente buscar pelo nome do destino."},404);
   return json({type:"place",results:matches});
 }catch(e){
   const message=String(e?.message||"");
   return json({error:message.startsWith("Não foi")||message.includes("não permitido")?message:"Não foi possível importar esse link agora. Tente novamente."},502);
 }
}
