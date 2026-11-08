// Transferência autenticada de uma foto escolhida de um acervo licenciado.
// URL final é sempre obtida de API confiável, nunca fornecida pelo visitante.
// A imagem não é armazenada neste endpoint: o navegador adapta para o card
// e envia ao /api/image-upload, que já armazena no D1.
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function auth(request,env){
 const password=String(env.ADMIN_TOKEN||'').trim(),header=request.headers.get('Authorization')||'';
 if(password.length<20||!header.startsWith('Bearer '))return false;
 const encoder=new TextEncoder();
 const [left,right]=await Promise.all([
 crypto.subtle.digest('SHA-256',encoder.encode(password)),
 crypto.subtle.digest('SHA-256',encoder.encode(header.slice(7).trim()))]);
 const a=new Uint8Array(left),b=new Uint8Array(right);let diff=0;
 for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}
function isFreeLicense(input){
 const s=String(input||'').toLowerCase().trim();
 return /^(?:cc\s*by(?:-sa)?\s*\d|cc0|public domain|pd|pdm)(?:[\s\d.-]|$)/i.test(s);
}
async function getJson(url){
 const r=await fetch(url,{headers:{'User-Agent':'AsphaltBoys/1.0 (https://github.com/joaovitorkoot/asphalt_boys)','Accept':'application/json'},redirect:'error'});
 if(!r.ok)throw Error('Fonte indisponível');
 return r.json();
}
function approvedPhotoUrl(input,source){
 try{
  const u=new URL(input);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
  if(source==='commons'&&u.hostname==='upload.wikimedia.org')return u.href;
  if(source==='openverse'&&u.hostname==='api.openverse.org'&&/^\/v1\/images\/[0-9a-f-]{36}\/thumb\//i.test(u.pathname))return u.href;
  return '';
 }catch{return ''}
}
export async function onRequestPost({request,env}){
 if(!(await auth(request,env)))return answer({error:'Conecte ao painel administrativo para usar a foto.'},401);
 if(Number(request.headers.get('content-length')||0)>1200)return answer({error:'Dados inválidos.'},413);
 let body;try{body=await request.json()}catch{return answer({error:'Dados inválidos.'},400)}
 let media='',expected='';
 try{
  if(body?.source==='commons'){
   const id=String(body.id||'');
   if(!id.startsWith('File:')||id.length>280||/[\[\]{}|<>\n\r]/.test(id))return answer({error:'Arquivo Wikimedia inválido.'},400);
   const args=new URLSearchParams({action:'query',prop:'imageinfo',titles:id,format:'json',formatversion:'2',iiprop:'url|mime|extmetadata',iiurlwidth:'1000'});
   const info=(await getJson('https://commons.wikimedia.org/w/api.php?'+args)).query?.pages?.[0]?.imageinfo?.[0];
   const lic=info?.extmetadata?.LicenseShortName?.value||'';
   if(!info||!isFreeLicense(lic)||!/^image\/(jpeg|png|webp)$/i.test(info.mime||''))return answer({error:'A foto não tem licença aberta compatível ou mudou de licença.'},422);
   media=approvedPhotoUrl(info.thumburl||info.url,'commons');
   expected=info.mime;
  }else if(body?.source==='openverse'){
   const id=String(body.id||'');
   if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))return answer({error:'Imagem Openverse inválida.'},400);
   const item=await getJson('https://api.openverse.org/v1/images/'+id+'/');
   if(!['by','by-sa','cc0','pdm'].includes(String(item.license||'').toLowerCase()))return answer({error:'Esta imagem não tem licença aberta compatível.'},422);
   media=approvedPhotoUrl(item.thumbnail,'openverse');
  }else return answer({error:'Fonte de foto não reconhecida.'},400);
  if(!media)return answer({error:'Essa imagem não está disponível para transferência segura. Escolha outra.'},422);
  const response=await fetch(media,{redirect:'manual',headers:{'User-Agent':'AsphaltBoys/1.0 (https://github.com/joaovitorkoot/asphalt_boys)'}});
  if(!response.ok)return answer({error:'O acervo não permitiu o download dessa imagem. Tente outra.'},502);
  const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!/^image\/(jpeg|png|webp)$/.test(mime))return answer({error:'Este arquivo não é uma foto compatível.'},422);
  if(expected&&mime!==expected&&!(expected==='image/jpeg'&&mime==='image/png'))return answer({error:'Formato de imagem inesperado.'},422);
  const max=6000000;
  if(Number(response.headers.get('content-length')||0)>max)return answer({error:'Imagem muito grande. Escolha outra.'},413);
  const reader=response.body?.getReader();
  if(!reader)return answer({error:'Não consegui ler a imagem.'},502);
  let bytes=0,chunks=[];
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   bytes+=value.length;
   if(bytes>max){await reader.cancel();return answer({error:'Imagem maior que 6 MB. Escolha outra.'},413)}
   chunks.push(value);
  }
  if(bytes<100)return answer({error:'A imagem está incompleta.'},422);
  const blob=new Uint8Array(bytes);let i=0;for(const c of chunks){blob.set(c,i);i+=c.length}
  const magicOk=mime==='image/jpeg'?(blob[0]===255&&blob[1]===216):
   mime==='image/png'?(blob[0]===137&&blob[1]===80&&blob[2]===78&&blob[3]===71):
   (blob[0]===82&&blob[1]===73&&blob[8]===87&&blob[9]===69);
  if(!magicOk)return answer({error:'A foto retornou dados inválidos.'},422);
  return new Response(blob,{status:200,headers:{'Content-Type':mime,'Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
 }catch(e){return answer({error:'Não consegui carregar esta imagem da fonte agora. Tente outra.'},502)}
}
