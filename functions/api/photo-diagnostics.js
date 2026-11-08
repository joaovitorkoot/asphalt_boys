// Diagnóstico temporário para verificar se Cloudflare Workers consegue consultar
// as duas fontes de fotos abertas. Não revela tokens, URLs privadas nem dados do usuário.
const reply=(data)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function onRequestGet(){
 const urls=[
  ['commons','https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=Pico%20Alto%20Guaramiranga&gsrnamespace=6&gsrlimit=2&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=980&format=json&formatversion=2'],
  ['openverse','https://api.openverse.org/v1/images/?q=Pico%20Alto%20Guaramiranga&page_size=2&license=by%2Cby-sa%2Ccc0%2Cpdm&mature=false']
 ];
 const results=await Promise.all(urls.map(async([name,url])=>{
  try{
   const r=await fetch(url,{headers:{'User-Agent':'AsphaltBoys/1.0 (https://github.com/joaovitorkoot/asphalt_boys; photos from open licenses)','Accept':'application/json'},redirect:'manual'});
   const type=r.headers.get('Content-Type')||'';
   let snippet='';
   try{snippet=(await r.text()).slice(0,150).replace(/[^a-zA-Z0-9 ,.:/_-]/g,'_')}catch{}
   return {name,status:r.status,type,snippet};
  }catch(e){return {name,error:String(e?.name||'Error'),message:String(e?.message||'').slice(0,240)}}
 }));
 return reply({results});
}
