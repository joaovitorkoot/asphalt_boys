// Fotos do Google Places (New) apenas para visualização temporária no painel.
// Não salva nem coloca em cache URLs ou referências de fotos do Google.
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
}});
const validId=id=>/^[a-zA-Z0-9_-]{5,250}$/.test(id);
function clean(value,max){return typeof value==="string"?value.trim().replace(/\s+/g," ").slice(0,max):""}
async function isAdmin(req,env){
 const secret=String(env.ADMIN_TOKEN||"").trim();
 const header=req.headers.get("Authorization")||"";
 if(secret.length<20||!header.startsWith("Bearer "))return false;
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([
  crypto.subtle.digest("SHA-256",encoder.encode(secret)),
  crypto.subtle.digest("SHA-256",encoder.encode(header.slice(7).trim()))
 ]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
async function placeRequest(url,key,mask,body){
 const res=await fetch(url,{method:body?"POST":"GET",headers:{
  "X-Goog-Api-Key":key,"X-Goog-FieldMask":mask,...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 if(!res.ok)throw new Error("Google Places HTTP "+res.status);
 return res.json();
}
function safePhoto(value){
 try{
  const u=new URL(value);
  return u.protocol==="https:"&&(u.hostname==="googleusercontent.com"||u.hostname.endsWith(".googleusercontent.com")||
    u.hostname==="ggpht.com"||u.hostname.endsWith(".ggpht.com"))?u.href:"";
 }catch{return ""}
}
function safeAuthorUri(value){
 try{const u=new URL(value);return u.protocol==="https:"?u.href.slice(0,500):""}catch{return ""}
}
function normalName(s){
 return clean(s,150).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
// Exige correspondência exata do nome para não mostrar foto de outro estabelecimento.
// Requer clique explícito no painel para consultas adicionais.
async function searchExactPlace(key,name,destination){
 const query=[name,destination].filter(Boolean).join(", ").slice(0,300);
 const result=await placeRequest("https://places.googleapis.com/v1/places:searchText",key,
  "places.id,places.displayName,places.formattedAddress,places.photos,places.googleMapsUri",
  {textQuery:query,pageSize:8,languageCode:"pt-BR",regionCode:"BR"});
 const wanted=normalName(name);
 const found=(result.places||[]).filter(p=>validId(p.id)).map(p=>({
  place:p,name:clean(p.displayName?.text,120),address:clean(p.formattedAddress,400),
  photoCount:Array.isArray(p.photos)?p.photos.length:0
 }));
 const exact=found.filter(x=>normalName(x.name)===wanted);
 exact.sort((a,b)=>b.photoCount-a.photoCount);
 return {match:exact[0]||null,candidates:found.slice(0,5).map(x=>({
   name:x.name,address:x.address,photoCount:x.photoCount
 }))};
}
export async function onRequestPost({request,env}){
 if(!(await isAdmin(request,env)))return reply({error:"Conecte ao banco para visualizar fotos do Google."},401);
 if(!env.GOOGLE_PLACES_API_KEY)return reply({error:"A API Google Places não está configurada."},503);
 if(Number(request.headers.get("content-length")||0)>2400)return reply({error:"Pesquisa muito longa."},413);
 let input;try{input=await request.json()}catch{return reply({error:"Envie um local válido."},400)}
 const placeId=clean(input?.placeId,250);
 const name=clean(input?.name,120),address=clean(input?.address,400),destination=clean(input?.destination,120);
 const mode=input?.mode==="gallery"?"gallery":"single";
 const photoIndex=Number.isInteger(input?.photoIndex)&&input.photoIndex>=0&&input.photoIndex<=9?input.photoIndex:0;
 if(!validId(placeId)&&name.length<3)return reply({error:"Informe um nome de local ou Place ID válido."},422);
 const key=String(env.GOOGLE_PLACES_API_KEY);
 try{
  const searchExact=input?.forceExact===true||mode==="gallery";
  let id=validId(placeId)?placeId:"";
  let place=null,candidates=[];
  if(searchExact&&name.length>=3){
   const search=await searchExactPlace(key,name,destination||address);
   candidates=search.candidates;
   if(search.match){
    id=search.match.place.id;
    place=search.match.place;
   }else{
    return reply({available:false,placeId:"",placeName:name,candidates,
     message:"A busca por \""+name+"\" não encontrou uma ficha com esse nome exato. Verifique o nome no Google Maps ou use sua foto autorizada."});
   }
  }
  if(!id&&!place){
   const found=await placeRequest("https://places.googleapis.com/v1/places:searchText",key,
    "places.id,places.displayName", {textQuery:[name,address||destination].filter(Boolean).join(", ").slice(0,350),pageSize:1,languageCode:"pt-BR",regionCode:"BR"});
   id=found.places?.[0]?.id||"";
  }
  if(!validId(id))return reply({available:false,message:"Não encontrei esse local no Google Maps."},200);
  // Quando a Text Search já entregou fotos, não faça outra consulta paga de detalhes.
  if(!place)place=await placeRequest("https://places.googleapis.com/v1/places/"+encodeURIComponent(id)+"?languageCode=pt-BR",
   key,"id,displayName,googleMapsUri,photos");
  const photos=Array.isArray(place.photos)?place.photos:[];
  if(!photos.length){
   return reply({available:false,placeId:id,placeName:clean(place.displayName?.text,120),candidates,
    message:"Encontrei \""+(clean(place.displayName?.text,120)||name)+"\", mas a API oficial do Google não disponibilizou fotos. A galeria do Google Maps pode mostrar imagens que não são entregues pela API; nesse caso, use o envio manual com autorização."});
  }
  const selected=mode==="gallery"?photos.slice(0,5).map((p,i)=>({p,i})):photos[photoIndex]?[{p:photos[photoIndex],i:photoIndex}]:[{p:photos[0],i:0}];
  const result=[];
  for(const {p,i} of selected){
   if(!/^places\/[^/]+\/photos\/[^/]+$/.test(p.name||""))continue;
   const media=await fetch("https://places.googleapis.com/v1/"+p.name+"/media?maxWidthPx=800&skipHttpRedirect=true",{
    headers:{"X-Goog-Api-Key":key}
   });
   if(!media.ok)continue;
   const json=await media.json(),url=safePhoto(json.photoUri);
   if(!url)continue;
   result.push({index:i,url,attributions:(p.authorAttributions||[]).slice(0,3).map(x=>({
    name:clean(x.displayName,120),url:safeAuthorUri(x.uri)
   }))});
  }
  return reply({available:Boolean(result.length),placeId:id,placeName:clean(place.displayName?.text,120),candidates,
   mapsUrl:safeAuthorUri(place.googleMapsUri),photos:result,total:photos.length,
   message:result.length?"":"Nenhuma foto disponível no momento."});
 }catch(e){
  const code=String(e.message||"").match(/HTTP (\d+)/)?.[1]||"";
  return reply({error:code==="403"?"Google Places recusou a consulta (403). Confira o faturamento e a API (New).":
   code==="429"?"O limite de consultas do Google Places foi alcançado. Tente mais tarde.":
   "Não consegui consultar as fotos agora. Tente novamente."},502);
 }
}
