// Aviso privado de nova sugestão, após gravação em Cloudflare D1.
// Prioriza Gmail/Apps Script (sem domínio próprio); mantém Resend como alternativa.
// Credenciais exclusivamente em variáveis do servidor, nunca no site público.
const clean=value=>String(value??'').replace(/[\r\n\u0000-\u001F\u007F]+/g,' ').trim().slice(0,180);
function address(value){
 const v=String(value??'').trim();
 return v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?v:'';
}
function gmailWebApp(value){
 try{
  const url=new URL(String(value??'').trim());
  if(url.protocol!=='https:'||url.hostname!=='script.google.com')return '';
  if(!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname))return '';
  if(url.username||url.password||url.port||url.search||url.hash)return '';
  return url.href;
 }catch{return ''}
}
export async function notifySuggestionReceived(env,data){
 const name=clean(data.visitorName)||'Local sem nome';
 const dest=clean(data.destinationMode==='novo'?data.destinationName:data.destinationLabel)||'Destino não informado';
 const subject='Nova sugestão de visitante — Asphalt Boys';
 const body=[
  'Nova sugestão de um visitante no Asphalt Boys.',
  '',
  'Local informado: '+name,
  'Destino sugerido: '+dest,
  'Tipo: '+(data.destinationMode==='novo'?'Solicitação de novo card':'Card existente'),
  'Fotos recebidas: '+Math.min(3,Math.max(0,Number(data.photoCount)||0)),
  '',
  'A sugestão está pendente. Nada foi publicado automaticamente.',
  'Confira e decida no painel: https://asphalt-boys.pages.dev/admin.html'
 ].join('\n');
 const webapp=gmailWebApp(env.AB_GMAIL_WEBAPP_URL);
 const token=String(env.AB_GMAIL_WEBHOOK_TOKEN||'').trim();
 if(webapp&&token.length>=30){
  const response=await fetch(webapp,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   redirect:'follow',
   body:JSON.stringify({token,id:String(data.id),subject,text:body})
  });
  if(!response.ok)throw new Error('Gmail Apps Script returned HTTP '+response.status);
  const output=(await response.text()).slice(0,3000);
  let result;
  try{result=JSON.parse(output)}catch{throw new Error('Gmail Apps Script did not return JSON')}
  if(result?.ok!==true)throw new Error('Gmail Apps Script could not send notification');
  return {enabled:true,sent:true,via:'gmail'};
 }
 const key=String(env.RESEND_API_KEY||'').trim();
 const from=address(env.RESEND_FROM_EMAIL);
 if(!key||!from)return {enabled:false,reason:'email-not-configured'};
 const override=address(env.SUGGESTION_NOTIFY_EMAIL);
 const row=override?null:await env.DB.prepare('SELECT email FROM ab_admin_login WHERE id=1').first();
 const recipient=override||address(row?.email);
 if(!recipient)return {enabled:false,reason:'recipient-missing'};
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{
   'Authorization':'Bearer '+key,'Content-Type':'application/json',
   'Idempotency-Key':'asphalt-boys-suggestion/'+String(data.id)
  },
  body:JSON.stringify({from:'Asphalt Boys <'+from+'>',to:[recipient],subject,text:body})
 });
 if(!response.ok)throw new Error('Email provider returned HTTP '+response.status);
 return {enabled:true,sent:true,via:'resend'};
}
