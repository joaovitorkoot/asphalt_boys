// Sugestões assistidas para classificar uma parada já identificada por Place ID.
// Consulta ao Google Places apenas depois da escolha do local no painel.
// Horário de abertura NÃO confirma que uma refeição é servida.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
}});
async function authorized(request,env){
 const secret=typeof env.ADMIN_TOKEN==="string"?env.ADMIN_TOKEN.trim():"";
 const bearer=request.headers.get("Authorization")||"";
 if(secret.length<20||!bearer.startsWith("Bearer "))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([
  crypto.subtle.digest("SHA-256",enc.encode(secret)),
  crypto.subtle.digest("SHA-256",enc.encode(bearer.slice(7).trim()))
 ]);
 const left=new Uint8Array(a),right=new Uint8Array(b);
 let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
const slots=[
 ["cafe",8,30],["almoco",12,30],["cafe_tarde",16,0],["jantar",19,30]
];
function timePoint(point){
 if(!point||!Number.isInteger(point.day)||point.day<0||point.day>6)return null;
 const h=Number(point.hour||0),m=Number(point.minute||0);
 if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>23||m<0||m>59)return null;
 return point.day*1440+h*60+m;
}
function openAt(periods,hour,minute){
 if(!Array.isArray(periods)||!periods.length)return false;
 const target=hour*60+minute;
 for(const p of periods.slice(0,30)){
  const start=timePoint(p.open);if(start===null)continue;
  const end=p.close?timePoint(p.close):null;
  if(end===null){ // Somente o período 24h do Google.
   if(p.open.day===0&&Number(p.open.hour||0)===0&&Number(p.open.minute||0)===0)return true;
   continue;
  }
  const stop=end<=start?end+10080:end;
  for(let day=0;day<7;day++){
   const tick=day*1440+target;
   if((tick>=start&&tick<stop)||(tick+10080>=start&&tick+10080<stop))return true;
  }
 }
 return false;
}
function suggestForPlace(place){
 const rawTypes=[...(Array.isArray(place.types)?place.types:[]),place.primaryType||""].map(v=>String(v).toLowerCase());
 const types=new Set(rawTypes);
 const name=String(place.displayName?.text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const restaurant=rawTypes.some(t=>t.includes("restaurant")||["bar_and_grill","diner","bistro","steak_house","pizza_restaurant","fast_food_restaurant"].includes(t));
 const cafe=rawTypes.some(t=>["cafe","coffee_shop","bakery","breakfast_restaurant","brunch_restaurant","tea_house","juice_shop","dessert_shop","ice_cream_shop"].includes(t))||
  (!restaurant&&/\b(cafe|cafeteria|padaria|confeitaria)\b/.test(name));
 const lunchMenu=restaurant||types.has("meal_takeaway");
 const tourist=rawTypes.some(t=>["tourist_attraction","museum","historical_landmark","observation_deck","scenic_spot","monument","hiking_area","botanical_garden","amusement_park","national_park","art_gallery","zoo","aquarium","visitor_center"].includes(t));
 const rest=rawTypes.some(t=>["park","public_park","plaza","rest_stop","scenic_spot","observation_deck","botanical_garden","garden"].includes(t));
 const regular=place.regularOpeningHours||{};
 const periods=Array.isArray(regular.periods)?regular.periods:null;
 const hours=Array.isArray(regular.weekdayDescriptions)?regular.weekdayDescriptions.slice(0,7).map(x=>String(x).slice(0,170)):[];
 const proposals=[];
 const add=(id,reason)=>{if(!proposals.some(x=>x.id===id))proposals.push({id,reason})};
 const open=id=>{
  const slot=slots.find(x=>x[0]===id);
  return periods?openAt(periods,slot[1],slot[2]):null;
 };
 if(cafe){
  if(open("cafe")===true||open("cafe")===null)
   add("cafe",open("cafe")===true?"Cafeteria/padaria aberta próximo das 8h30.":"Tipo cafeteria/padaria; horário indisponível.");
  if(open("cafe_tarde")===true||open("cafe_tarde")===null)
   add("cafe_tarde",open("cafe_tarde")===true?"Cafeteria/padaria aberta próximo das 16h.":"Tipo cafeteria/padaria; horário indisponível.");
 }
 if(lunchMenu){
  if(open("almoco")===true||open("almoco")===null)
   add("almoco",open("almoco")===true?"Restaurante aberto próximo das 12h30.":"Tipo restaurante; horário indisponível.");
  if(open("jantar")===true)
   add("jantar","Restaurante aberto próximo das 19h30.");
 }
 if(tourist)add("turismo","O Google classifica o local como atração ou ponto turístico.");
 if(rest)add("descanso","O Google classifica o local como parque, praça ou mirante.");
 const closed=place.businessStatus&&place.businessStatus!=="OPERATIONAL";
 return {
  suggestions:closed?[]:proposals,
  hours,
  hasHours:!!periods?.length,
  placeType:String(place.primaryTypeDisplayName?.text||place.primaryType||"").slice(0,110),
  note:closed?"O Google indica que o estabelecimento não está em operação; confira a ficha antes de cadastrar.":
    proposals.length?"Sugestões baseadas no tipo de local e nos horários cadastrados no Google. Estar aberto não garante que a refeição seja servida.":
    "O Google não trouxe informações suficientes para sugerir categorias com segurança. Marque-as manualmente."
 };
}
export async function onRequestPost({request,env}){
 if(!(await authorized(request,env)))return json({error:"Entre como administrador antes de receber sugestões."},401);
 if(!env.GOOGLE_PLACES_API_KEY)return json({error:"Google Places não configurado."},503);
 if(Number(request.headers.get("content-length")||0)>1024)return json({error:"Solicitação muito longa."},413);
 let body;try{body=await request.json()}catch{return json({error:"Dados inválidos."},400)}
 const placeId=String(body?.placeId||"").trim();
 if(!/^[a-zA-Z0-9_-]{5,250}$/.test(placeId))return json({error:"Ficha do Google Maps indisponível para este ponto."},422);
 try{
  const response=await fetch("https://places.googleapis.com/v1/places/"+encodeURIComponent(placeId)+"?languageCode=pt-BR",{
   headers:{"X-Goog-Api-Key":String(env.GOOGLE_PLACES_API_KEY),
    "X-Goog-FieldMask":"id,displayName,primaryType,primaryTypeDisplayName,types,businessStatus,regularOpeningHours.periods,regularOpeningHours.weekdayDescriptions"}
  });
  if(!response.ok){
   return json({error:response.status===429?"Limite do Google Maps atingido. Selecione as categorias manualmente.":
     "Não foi possível consultar os horários do Google ("+response.status+"). Selecione as categorias manualmente."},502);
  }
  const data=await response.json();
  return json(suggestForPlace(data));
 }catch{return json({error:"Não consegui consultar os horários agora. Você ainda pode escolher manualmente."},502)}
}
