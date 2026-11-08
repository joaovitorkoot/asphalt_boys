// Login persistente do painel Asphalt Boys. Senha com PBKDF2; sessão opaca em cookie HttpOnly.
const COOKIE='__Host-ab_admin';
const MONTH=30*24*60*60;
// Cloudflare Workers limita PBKDF2 a 100.000 iteracoes por chamada.
// HMAC com segredo do servidor protege as senhas mesmo se o banco vazar.
const ITERATIONS=100000;
const enc=new TextEncoder();
const reply=(obj,status=200,cookie='')=>{
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(cookie)headers['Set-Cookie']=cookie;
 return new Response(JSON.stringify(obj),{status,headers});
};
const toB64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const digest=async value=>toB64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
const sameBytes=(a,b)=>{
 if(a.length!==b.length)return false;
 let diff=0;
 for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
};
export function sameOrigin(request){
 const origin=request.headers.get('Origin')||'';
 try{return !!origin&&new URL(origin).origin===new URL(request.url).origin}catch{return false}
}
function cookieToken(req){
 const found=(req.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
 const value=found?found.slice(COOKIE.length+1):'';
 return /^[a-zA-Z0-9_-]{40,55}$/.test(value)?value:'';
}
const sessionCookie=token=>COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+MONTH;
const clearCookie=()=>COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function initDB(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS ab_admin_login (id INTEGER PRIMARY KEY CHECK (id=1),email TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,iterations INTEGER NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS ab_admin_sessions (token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)').run();
 await db.prepare('CREATE TABLE IF NOT EXISTS ab_admin_limits (client_key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL)').run();
}
async function pbkdf2(password,salt,iterations=ITERATIONS,env){
 const secret=String(env?.ADMIN_TOKEN||'').trim();
 if(secret.length<20)throw Error('Segredo administrativo indisponível.');
 if(!Number.isInteger(iterations)||iterations<1||iterations>100000)throw Error('Parâmetros de senha inválidos.');
 // Pepper server-side: o ADMIN_TOKEN nunca é exposto nem gravado junto com o hash.
 const pepperKey=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const peppered=new Uint8Array(await crypto.subtle.sign('HMAC',pepperKey,enc.encode('AsphaltBoys:password:v1:'+password)));
 const key=await crypto.subtle.importKey('raw',peppered,'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},key,256));
}
async function adminAccount(db){
 return db.prepare('SELECT email,salt,password_hash,iterations FROM ab_admin_login WHERE id=1').first();
}
export async function sessionFor(request,env){
 if(!env.DB)return null;
 const token=cookieToken(request);if(!token)return null;
 try{
  const tokenHash=await digest(token),now=Math.floor(Date.now()/1000);
  const record=await env.DB.prepare('SELECT expires_at FROM ab_admin_sessions WHERE token_hash=?').bind(tokenHash).first();
  if(!record||Number(record.expires_at)<=now)return null;
  const user=await adminAccount(env.DB);
  return user?{email:user.email,tokenHash}:null;
 }catch{return null}
}
async function issueSession(db){
 const token=toB64(crypto.getRandomValues(new Uint8Array(32)));
 const hash=await digest(token),now=Math.floor(Date.now()/1000);
 await db.prepare('DELETE FROM ab_admin_sessions WHERE expires_at < ?').bind(now).run();
 await db.prepare('INSERT INTO ab_admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(hash,now+MONTH).run();
 return sessionCookie(token);
}
async function verifyToken(candidate,env){
 const secret=String(env.ADMIN_TOKEN||'').trim();
 if(secret.length<20||typeof candidate!=='string')return false;
 return sameBytes(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(candidate.trim()))),new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(secret))));
}
async function checkRateLimit(db,request,email){
 const ip=(request.headers.get('CF-Connecting-IP')||'').slice(0,128)||'unknown';
 const clientKey=await digest('login:'+ip+':'+email);
 const now=Math.floor(Date.now()/1000);
 const rate=await db.prepare('SELECT attempts,reset_at FROM ab_admin_limits WHERE client_key=?').bind(clientKey).first();
 return {clientKey,attempts:rate&&Number(rate.reset_at)>now?Number(rate.attempts):0,now};
}
async function failedLogin(db,rate){
 await db.prepare('INSERT INTO ab_admin_limits(client_key,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(client_key) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at').bind(rate.clientKey,rate.attempts+1,rate.now+900).run();
}
export async function onRequestGet({request,env}){
 if(!env.DB)return reply({error:'Banco Cloudflare D1 não configurado.'},503);
 try{
  await initDB(env.DB);
  const [account,session]=await Promise.all([adminAccount(env.DB),sessionFor(request,env)]);
  return reply({configured:!!account,authenticated:!!session,email:session?.email||''});
 }catch{return reply({error:'Não consegui inicializar o login no banco D1.'},503)}
}
export async function onRequestPost({request,env}){
 if(!env.DB)return reply({error:'Banco Cloudflare D1 não configurado.'},503);
 if(!sameOrigin(request))return reply({error:'Solicitação fora do site bloqueada.'},403);
 if(Number(request.headers.get('content-length')||0)>3500)return reply({error:'Solicitação muito longa.'},413);
 let body;
 try{body=await request.json()}catch{return reply({error:'Dados inválidos.'},400)}
 const action=String(body?.action||'');
 if(!['setup','login','logout','recover'].includes(action))return reply({error:'Ação inválida.'},400);
 try{
  await initDB(env.DB);
  if(action==='logout'){
   const token=cookieToken(request);
   if(token)await env.DB.prepare('DELETE FROM ab_admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
   return reply({ok:true},200,clearCookie());
  }
  const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  if(action==='setup'||action==='recover'){
   if(!await verifyToken(body.adminToken,env))return reply({error:'Token da Cloudflare incorreto.'},401);
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'Informe um e-mail válido.'},422);
   if(password.length<12||password.length>128)return reply({error:'Crie uma senha com 12 a 128 caracteres.'},422);
   const account=await adminAccount(env.DB);
   if(action==='setup'&&account)return reply({error:'O login já foi configurado. Entre ou use a recuperação.'},409);
   if(action==='recover'&&!account)return reply({error:'Configure o primeiro acesso.'},409);
   const salt=crypto.getRandomValues(new Uint8Array(16));
   const hashed=toB64(await pbkdf2(password,salt,ITERATIONS,env));
   if(action==='setup'){
    const outcome=await env.DB.prepare('INSERT OR IGNORE INTO ab_admin_login(id,email,salt,password_hash,iterations) VALUES(1,?,?,?,?)').bind(email,toB64(salt),hashed,ITERATIONS).run();
    if(Number(outcome.meta?.changes||0)!==1)return reply({error:'Conta já configurada.'},409);
   }else{
    await env.DB.prepare('UPDATE ab_admin_login SET email=?,salt=?,password_hash=?,iterations=? WHERE id=1').bind(email,toB64(salt),hashed,ITERATIONS).run();
    await env.DB.prepare('DELETE FROM ab_admin_sessions').run();
   }
   return reply({ok:true,authenticated:true,email},200,await issueSession(env.DB));
  }
  // Mensagem genérica: não revelar qual e-mail está configurado.
  const invalid=()=>reply({error:'E-mail ou senha incorretos.'},401);
  if(!email||password.length>128)return invalid();
  const rate=await checkRateLimit(env.DB,request,email);
  if(rate.attempts>=8)return reply({error:'Muitas tentativas. Tente novamente em 15 minutos.'},429);
  const account=await adminAccount(env.DB);
  if(!account||account.email!==email){
   await failedLogin(env.DB,rate);return invalid();
  }
  const derived=await pbkdf2(password,fromB64(account.salt),Number(account.iterations),env);
  const stored=fromB64(account.password_hash);
  if(!sameBytes(derived,stored)){
   await failedLogin(env.DB,rate);return invalid();
  }
  await env.DB.prepare('DELETE FROM ab_admin_limits WHERE client_key=?').bind(rate.clientKey).run();
  return reply({ok:true,authenticated:true,email},200,await issueSession(env.DB));
 }catch{return reply({error:'Não foi possível completar o login agora.'},503)}
}
