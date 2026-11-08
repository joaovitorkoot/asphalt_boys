import {sessionFor,sameOrigin} from './auth.js';

// As rotas administrativas existentes continuam protegidas pelo ADMIN_TOKEN.
// A sessão validada no servidor injeta esse token SOMENTE na chamada interna,
// sem expô-lo ao navegador nem salvá-lo no dispositivo.
export async function onRequest({request,env,next}){
 const path=new URL(request.url).pathname;
 if(path==='/api/auth'||request.headers.has('Authorization'))return next();
 const session=await sessionFor(request,env);
 if(!session)return next();
 if(!['GET','HEAD','OPTIONS'].includes(request.method.toUpperCase())&&!sameOrigin(request)){
  return new Response(JSON.stringify({error:'Origem não autorizada.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
 const secret=typeof env.ADMIN_TOKEN==='string'?env.ADMIN_TOKEN.trim():'';
 if(secret.length<20)return next();
 const headers=new Headers(request.headers);
 headers.set('Authorization','Bearer '+secret);
 return next(new Request(request,{headers}));
}
