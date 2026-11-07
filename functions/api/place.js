// Consulta sob demanda ao Google Places (New) para paradas publicadas.
// Chave acessível apenas no servidor via Secret GOOGLE_PLACES_API_KEY.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const mask="id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,regularOpeningHours,photos";
async function googleFetch(url,key,init={}){
  const response=await fetch(url,{...init,headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":init.mask||mask,...(init.headers||{})}});
  if(!response.ok)throw Error("Google Places indisponível ("+response.status+")");
  return response.json();
}
export async function onRequestGet({request,env}){
  if(!env.DB)return json({available:false,message:"Banco não conectado."},503);
  if(!env.GOOGLE_PLACES_API_KEY)return json({available:false,message:"A integração do Google Places ainda não foi ativada."},503);
  const id=new URL(request.url).searchParams.get("stop")||"";
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(id))return json({available:false,message:"Parada inválida."},400);
  try{
    // Nunca consulte locais inventados pelo visitante: apenas paradas publicadas no banco.
    const record=await env.DB.prepare("SELECT payload FROM site_content WHERE kind = 'paradas' AND status = 'publicado' AND id = ?").bind(id).first();
    if(!record)return json({available:false,message:"Parada não publicada."},404);
    const stop=JSON.parse(record.payload);
    const key=String(env.GOOGLE_PLACES_API_KEY),query=[stop.nome,stop.endereco].filter(Boolean).join(", ").slice(0,350);
    let placeId=String(stop.googlePlaceId||"").trim();
    if(placeId&&!/^[a-zA-Z0-9_-]{5,250}$/.test(placeId))placeId="";
    if(!placeId){
      if(!query)return json({available:false,message:"Local sem nome ou endereço."},422);
      // Pesquisa apenas quando o visitante solicita a prévia; sem consultas em background.
      const found=await googleFetch("https://places.googleapis.com/v1/places:searchText",key,{
        method:"POST",mask:"places.id",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({textQuery:query,languageCode:"pt-BR",regionCode:"BR",pageSize:1})
      });
      placeId=found.places?.[0]?.id||"";
    }
    if(!placeId)return json({available:false,message:"Não encontramos esse local no Google."},404);
    const place=await googleFetch("https://places.googleapis.com/v1/places/"+encodeURIComponent(placeId)+"?languageCode=pt-BR",key);
    let photo="";
    const firstPhoto=place.photos?.[0]?.name||"";
    if(firstPhoto&&/^places\/[^/]+\/photos\/[^/]+$/.test(firstPhoto)){
      try{
        const media=await fetch("https://places.googleapis.com/v1/"+firstPhoto+"/media?maxWidthPx=900&skipHttpRedirect=true",{headers:{"X-Goog-Api-Key":key}});
        if(media.ok){const p=await media.json();if(typeof p.photoUri==="string"&&p.photoUri.startsWith("https://"))photo=p.photoUri;}
      }catch{}
    }
    const result={available:true,source:"Google Maps",name:place.displayName?.text||stop.nome,
      address:place.formattedAddress||stop.endereco||"",rating:typeof place.rating==="number"?place.rating:null,
      count:typeof place.userRatingCount==="number"?place.userRatingCount:null,
      hours:Array.isArray(place.regularOpeningHours?.weekdayDescriptions)?place.regularOpeningHours.weekdayDescriptions:[],
      map:place.googleMapsUri||stop.maps||"",photo,photoAttributions:(place.photos?.[0]?.authorAttributions||[]).map(a=>({name:String(a.displayName||"").slice(0,120),uri:String(a.uri||"").slice(0,500)}))};
    const output=json(result);
    return output;
  }catch(e){return json({available:false,message:"Informações do Google indisponíveis neste momento. Consulte a ficha no Maps."},502);}
}
