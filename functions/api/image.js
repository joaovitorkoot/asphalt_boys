// Imagens do Asphalt Boys armazenadas no D1, carregadas por URL de ID opaco.
export async function onRequestGet({request,env}){
 const id=new URL(request.url).searchParams.get("id")||"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))return new Response("Imagem inválida",{status:400});
 if(!env.DB)return new Response("Banco indisponível",{status:503});
 try{
  const img=await env.DB.prepare("SELECT mime,data FROM site_images WHERE id=?").bind(id).first();
  if(!img||!["image/webp","image/jpeg","image/png"].includes(img.mime))return new Response("Imagem não encontrada",{status:404});
  const bytes=img.data instanceof Uint8Array?img.data:new Uint8Array(img.data);
  if(!bytes.length||bytes.length>220000)return new Response("Imagem inválida",{status:422});
  return new Response(bytes,{status:200,headers:{
   "Content-Type":img.mime,
   "Cache-Control":"public, max-age=604800, immutable",
   "X-Content-Type-Options":"nosniff"
  }});
 }catch{return new Response("Imagem indisponível",{status:404})}
}
