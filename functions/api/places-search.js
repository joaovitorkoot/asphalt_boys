// Busca administrativa no Google Places (New), exclusivamente no servidor.
// Requer token ADMIN_TOKEN; GOOGLE_PLACES_API_KEY nunca é enviado ao navegador.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
}});
async function sameSecret(a,b){
  if(!a||!b)return false;
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([
    crypto.subtle.digest("SHA-256",enc.encode(String(a))),
    crypto.subtle.digest("SHA-256",enc.encode(String(b)))
  ]);
  const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;
  for(let i=0;i<u.length;i++)diff|=u[i]^v[i];
  return diff===0;
}
export async function onRequestPost({request,env}){
  const auth=request.headers.get("Authorization")||"";
  if(typeof env.ADMIN_TOKEN!=="string"||env.ADMIN_TOKEN.trim().length<20||
     !auth.startsWith("Bearer ")||!(await sameSecret(auth.slice(7).trim(),env.ADMIN_TOKEN.trim()))){
    return reply({error:"Conecte-se ao banco usando o token administrativo antes de pesquisar locais."},401);
  }
  if(!env.GOOGLE_PLACES_API_KEY){
    return reply({error:"GOOGLE_PLACES_API_KEY não está configurada no ambiente de produção."},503);
  }
  if(Number(request.headers.get("content-length")||0)>1024){
    return reply({error:"Consulta muito longa."},413);
  }
  let body;
  try{body=await request.json()}catch{return reply({error:"Envie uma pesquisa válida."},400)}
  const query=typeof body?.query==="string"?body.query.trim().replace(/\s+/g," "):"";
  if(query.length<3||query.length>120){
    return reply({error:"Digite entre 3 e 120 caracteres para pesquisar."},400);
  }
  try{
    // Campos de identificação e endereço, sem buscar fotos/avaliações antecipadamente.
    // Isso limita as requisições pagas; outros dados são carregados na prévia pública.
    const google=await fetch("https://places.googleapis.com/v1/places:searchText",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Goog-Api-Key":String(env.GOOGLE_PLACES_API_KEY),
        "X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.primaryTypeDisplayName"
      },
      body:JSON.stringify({textQuery:query,pageSize:5,languageCode:"pt-BR",regionCode:"BR"})
    });
    if(!google.ok){
      const msg=google.status===403?"O Google recusou a consulta (403). Verifique o faturamento e a Places API (New).":
        google.status===429?"Limite de consultas do Google Places atingido. Tente novamente mais tarde.":
        google.status===400?"O Google recusou a pesquisa (400). Verifique a configuração da Places API (New).":
        "Não foi possível consultar o Google agora ("+google.status+").";
      return reply({error:msg},502);
    }
    const payload=await google.json();
    const results=Array.isArray(payload.places)?payload.places.slice(0,5).map(p=>({
      id:String(p.id||"").slice(0,250),
      name:String(p.displayName?.text||"").slice(0,120),
      address:String(p.formattedAddress||"").slice(0,400),
      maps:String(p.googleMapsUri||"").slice(0,1200),
      category:String(p.primaryTypeDisplayName?.text||"").slice(0,100)
    })).filter(p=>p.id&&p.name):[];
    return reply({results});
  }catch{
    return reply({error:"Falha temporária ao consultar o Google Places. Tente novamente."},502);
  }
}
