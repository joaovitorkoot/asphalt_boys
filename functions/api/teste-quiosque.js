// Diagnóstico temporário de UMA consulta do Google Places para este estabelecimento.
// Nunca retorna chave ou dados administrativos; D1 limita a um teste real.
const name='quiosque-pico-alto-20261108',query='Quiosque Pico Alto, Guaramiranga, Ceará, Brasil';
const output=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
export async function onRequestGet({env}){
 if(!env.DB||!env.GOOGLE_PLACES_API_KEY)return output({error:"Integração indisponível"},503);
 const db=env.DB;
 try{
  await db.prepare("CREATE TABLE IF NOT EXISTS temporary_place_diagnostics (name TEXT PRIMARY KEY, result TEXT, created_at TEXT DEFAULT (datetime('now')))").run();
  const claim=await db.prepare("INSERT OR IGNORE INTO temporary_place_diagnostics (name,result) VALUES (?,?)").bind(name,"running").run();
  if(!claim.meta?.changes){
   const row=await db.prepare("SELECT result FROM temporary_place_diagnostics WHERE name=?").bind(name).first();
   try{return output(JSON.parse(row?.result||'{"status":"running"}'))}catch{return output({status:"running"})}
  }
  let summary;
  try{
   const r=await fetch("https://places.googleapis.com/v1/places:searchText",{
    method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":String(env.GOOGLE_PLACES_API_KEY),
      "X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.photos"},
    body:JSON.stringify({textQuery:query,pageSize:8,languageCode:"pt-BR",regionCode:"BR"})
   });
   if(!r.ok)summary={status:"google-error",http:r.status};
   else{
    const json=await r.json();
    const matches=(json.places||[]).slice(0,8).map(x=>({
      name:String(x.displayName?.text||"").slice(0,130),
      address:String(x.formattedAddress||"").slice(0,200),
      photos:Array.isArray(x.photos)?x.photos.length:0
    }));
    const normalize=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const exact=matches.find(x=>normalize(x.name)==='quiosque pico alto');
    summary={status:"tested",query,exactFound:Boolean(exact),photosAvailable:Boolean(exact?.photos),
      exactPhotoCount:exact?.photos||0,matches};
   }
  }catch(e){summary={status:"network-error",reason:String(e?.message||'').slice(0,150)}}
  await db.prepare("UPDATE temporary_place_diagnostics SET result=? WHERE name=?").bind(JSON.stringify(summary),name).run();
  return output(summary);
 }catch{return output({error:"Não foi possível executar o diagnóstico."},500)}
}
