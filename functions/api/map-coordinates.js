// Resolve coordenadas de links do Google Maps sem usar Google Places API.
// Proteção de domínios: nunca abrir URLs arbitrárias informadas pelo navegador.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function auth(req,env){
 const secret=String(env.ADMIN_TOKEN||'').trim(),hdr=req.headers.get('Authorization')||'';
 if(secret.length<20||!hdr.startsWith('Bearer '))return false;
 const enc=new TextEncoder(),[a,b]=await Promise.all([
   crypto.subtle.digest('SHA-256',enc.encode(secret)),
   crypto.subtle.digest('SHA-256',enc.encode(hdr.slice(7).trim()))
 ]);
 let diff=0;const x=new Uint8Array(a),y=new Uint8Array(b);
 for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
function allowed(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const name=u.hostname.toLowerCase();
  if(['maps.app.goo.gl','www.google.com','google.com','maps.google.com','google.com.br',
      'www.google.com.br','goo.gl'].includes(name))return u;
  return null;
 }catch{return null}
}
function coords(u){
 const v=decodeURIComponent(u.pathname);
 const m=v.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)||
   v.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
 if(!m)return '';
 const lat=Number(m[1]),lng=Number(m[2]);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return '';
 return lat.toFixed(7)+','+lng.toFixed(7);
}
export async function onRequestPost({request,env}){
 if(!(await auth(request,env)))return json({error:'Conecte ao banco para verificar o link.'},401);
 if(Number(request.headers.get('content-length')||0)>2100)return json({error:'Link muito longo.'},413);
 let body;try{body=await request.json()}catch{return json({error:'Link inválido.'},400)}
 let u=allowed(body?.url);
 if(!u)return json({error:'Use apenas um link oficial https do Google Maps.'},400);
 try{
  for(let i=0;i<5;i++){
   let position=coords(u);
   if(position)return json({mapCoordinates:position,verified:true});
   if(!['maps.app.goo.gl','goo.gl'].includes(u.hostname))break;
   const result=await fetch(u.href,{method:'GET',redirect:'manual',
      headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'}});
   if(result.status>=300&&result.status<400&&result.headers.has('location')){
    const next=allowed(new URL(result.headers.get('location'),u.href).href);
    if(!next)break;
    u=next;
   }else break;
  }
  return json({mapCoordinates:'',verified:false,
    message:'O link foi salvo, mas não consegui extrair coordenadas. A abertura direta usa o link original.'});
 }catch{return json({mapCoordinates:'',verified:false,message:'Não foi possível expandir este link curto agora.'})}
}
