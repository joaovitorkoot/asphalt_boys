// Asphalt Boys: resumos de avaliações do Google Places (New), apenas sob clique.
// Não procura homônimos pelo nome: exige o Place ID confirmado ao importar o link.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'
}});
export async function onRequestGet({request,env}){
  const id=new URL(request.url).searchParams.get('stop')||'';
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(id))return json({available:false,message:'Parada inválida.'},400);
  if(!env.DB)return json({available:false,message:'Banco de paradas não conectado.'},503);
  if(!env.GOOGLE_PLACES_API_KEY)return json({available:false,message:'Serviço de avaliações ainda não configurado.'},503);
  try{
    const record=await env.DB.prepare(
      "SELECT payload FROM site_content WHERE kind = 'paradas' AND status = 'publicado' AND id = ?"
    ).bind(id).first();
    if(!record)return json({available:false,message:'Esta parada ainda não foi publicada.'},404);
    const stop=JSON.parse(record.payload);
    const placeId=String(stop.googlePlaceId||'').trim();
    if(!/^[a-zA-Z0-9_-]{5,250}$/.test(placeId)){
      return json({available:false,message:'Ainda não há um Place ID confirmado para esta parada. Abra as avaliações diretamente no Google Maps.'});
    }
    const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId)+'?languageCode=pt-BR',{
      headers:{
        'X-Goog-Api-Key':String(env.GOOGLE_PLACES_API_KEY),
        'X-Goog-FieldMask':'reviewSummary'
      }
    });
    if(!response.ok){
      const message=response.status===403?'O Google não autorizou a consulta. Verifique o acesso à Places API (New).'
        :response.status===429?'Limite de consultas do Google atingido.'
        :'Não foi possível consultar as avaliações no Google agora.';
      return json({available:false,message},502);
    }
    const place=await response.json();
    const summary=place.reviewSummary;
    const content=typeof summary?.text?.text==='string'?summary.text.text:'';
    return json({
      available:!!content,
      summary:content,
      disclosure:typeof summary?.disclosureText?.text==='string'?summary.disclosureText.text:'',
      reviewsUrl:typeof summary?.reviewsUri==='string'?summary.reviewsUri:'',
      flagUrl:typeof summary?.flagContentUri==='string'?summary.flagContentUri:'',
      message:content?'':'O Google ainda não disponibilizou um resumo de avaliações para este local.'
    });
  }catch{
    return json({available:false,message:'Não foi possível carregar o resumo das avaliações agora.'},502);
  }
}
