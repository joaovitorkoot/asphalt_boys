// Asphalt Boys: upload autenticado de imagens otimizadas, usando o D1 já existente.
// Não precisa configurar outra conta ou armazenamento externo.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function auth(req,env){
 const secret=typeof env.ADMIN_TOKEN==="string"?env.ADMIN_TOKEN.trim():"";
 const value=req.headers.get("Authorization")||"";
 if(secret.length<20||!value.startsWith("Bearer "))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([
   crypto.subtle.digest("SHA-256",enc.encode(secret)),
   crypto.subtle.digest("SHA-256",enc.encode(value.slice(7).trim()))
 ]);
 const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;
 for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
 return difference===0;
}
export async function onRequestPost({request,env}){
 if(!env.DB)return json({error:"Banco de imagens não configurado."},503);
 if(!(await auth(request,env)))return json({error:"Conecte ao banco com o token de administrador."},401);
 const mime=(request.headers.get("Content-Type")||"").toLowerCase().split(";")[0].trim();
 if(!["image/webp","image/jpeg","image/png"].includes(mime))return json({error:"Use imagem WebP, JPEG ou PNG."},415);
 if(Number(request.headers.get("Content-Length")||0)>220000)return json({error:"Imagem muito grande. Tente outra imagem."},413);
 try{
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.length<100||bytes.length>220000)return json({error:"A foto precisa ter no máximo 220 KB após otimização."},413);
  if(mime==="image/webp"&&!(bytes[0]===82&&bytes[1]===73&&bytes[8]===87&&bytes[9]===69))return json({error:"Arquivo WebP inválido."},400);
  if(mime==="image/jpeg"&&!(bytes[0]===255&&bytes[1]===216))return json({error:"Arquivo JPEG inválido."},400);
  if(mime==="image/png"&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71))return json({error:"Arquivo PNG inválido."},400);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS site_images (id TEXT PRIMARY KEY NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO site_images(id,mime,data) VALUES(?,?,?)").bind(id,mime,bytes).run();
  return json({url:"/api/image?id="+id});
 }catch(e){
  return json({error:"Não foi possível salvar a imagem no banco. Tente outra foto."},500);
 }
}
