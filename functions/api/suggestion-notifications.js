// Notificações administrativas enviadas somente após a gravação da sugestão no D1.
// A conta do administrador é a destinatária padrão; nenhuma informação é enviada
// a serviços externos até que RESEND_API_KEY e RESEND_FROM_EMAIL sejam configurados.
const clean=value=>String(value??'').replace(/[\r\n\u0000-\u001F\u007F]+/g,' ').trim().slice(0,180);
function address(value){
 const v=String(value??'').trim();
 return v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?v:'';
}
export async function notifySuggestionReceived(env,data){
 const key=String(env.RESEND_API_KEY||'').trim();
 const from=address(env.RESEND_FROM_EMAIL);
 if(!key||!from)return {enabled:false,reason:'email-not-configured'};
 const override=address(env.SUGGESTION_NOTIFY_EMAIL);
 const row=override?null:await env.DB.prepare('SELECT email FROM ab_admin_login WHERE id=1').first();
 const recipient=override||address(row?.email);
 if(!recipient)return {enabled:false,reason:'recipient-missing'};
 const name=clean(data.visitorName)||'Local sem nome';
 const dest=clean(data.destinationMode==='novo'?data.destinationName:data.destinationLabel)||'Destino não informado';
 const admin='https://asphalt-boys.pages.dev/admin.html';
 const body=[
  'Nova sugestão de um visitante no Asphalt Boys.',
  '',
  'Local informado: '+name,
  'Destino sugerido: '+dest,
  'Tipo: '+(data.destinationMode==='novo'?'Solicitação de novo card':'Card existente'),
  'Fotos recebidas: '+Math.min(3,Math.max(0,Number(data.photoCount)||0)),
  '',
  'A sugestão está pendente. Nada foi publicado automaticamente.',
  'Confira e decida no painel: '+admin
 ].join('\n');
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{
   'Authorization':'Bearer '+key,
   'Content-Type':'application/json',
   'Idempotency-Key':'asphalt-boys-suggestion/'+String(data.id)
  },
  body:JSON.stringify({
   from:'Asphalt Boys <'+from+'>',
   to:[recipient],
   subject:'Nova sugestão de visitante — Asphalt Boys',
   text:body
  })
 });
 if(!response.ok)throw new Error('Email provider returned HTTP '+response.status);
 return {enabled:true,sent:true};
}
