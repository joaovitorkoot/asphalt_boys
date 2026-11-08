// Busca de imagens com licenças abertas. Não usa Google Places nem chaves externas.
// Pesquisa explícita do administrador (não executa automaticamente ao abrir um card).
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
async function isAdmin(request,env){
 const secret=typeof env.ADMIN_TOKEN==='string'?env.ADMIN_TOKEN.trim():'';
 const hdr=request.headers.get('Authorization')||'';
 if(secret.length<20||!hdr.startsWith('Bearer '))return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(secret)),crypto.subtle.digest('SHA-256',enc.encode(hdr.slice(7).trim()))]);
 const left=new Uint8Array(a),right=new Uint8Array(b);let diff=0;
 for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
 return diff===0;
}
function clean(v,max=300){return String(v||'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot|lt|gt);/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function safeUrl(value,hosts){
 try{const u=new URL(value);return u.protocol==='https:'&&hosts.some(h=>u.hostname===h)?u.href:''}catch{return ''}
}
function allowedLicense(value){
 const l=clean(value,60).toLowerCase();
 return /^(?:cc\s*by(?:-sa)?\s*\d(?:\.\d)?|cc0(?:\s*\d(?:\.\d)?)?|public\s*domain|pd|pdm)(?:\b|$)/i.test(l);
}
function licenseLabel(value){
 const lic=clean(value,70);
 if(/^(?:pd|pdm|public domain)/i.test(lic))return 'Domínio público';
 return lic;
}
async function fetchJson(url){
 const res=await fetch(url,{headers:{'User-Agent':'AsphaltBoys/1.0 (https://github.com/joaovitorkoot/asphalt_boys; photos from open licenses)','Accept':'application/json'},redirect:'error'});
 if(!res.ok)throw Error('HTTP '+res.status);
 return res.json();
}
async function wikimedia(query){
 const qs=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'980',format:'json',formatversion:'2'});
 const json=await fetchJson('https://commons.wikimedia.org/w/api.php?'+qs);
 const matches=[];
 for(const page of json.query?.pages||[]){
  const info=page.imageinfo?.[0],metadata=info?.extmetadata||{},lic=licenseLabel(metadata.LicenseShortName?.value);
  if(!info||!allowedLicense(lic)||!/^image\/(?:jpeg|png|webp)$/i.test(info.mime||''))continue;
  const thumb=safeUrl(info.thumburl||info.url,['upload.wikimedia.org']);
  const pageUrl=safeUrl(info.descriptionurl,['commons.wikimedia.org']);
  if(!thumb||!pageUrl)continue;
  const id=clean(page.title,280);
  if(!id.startsWith('File:'))continue;
  matches.push({source:'commons',id,title:clean(page.title.replace(/^File:/i,'').replace(/\.[a-z0-9]+$/i,'').replace(/_/g,' '),160),
   thumb,pageUrl,license:lic,licenseUrl:safeUrl(metadata.LicenseUrl?.value,['creativecommons.org','www.creativecommons.org'])||'',
   creator:clean(metadata.Artist?.value||metadata.Attribution?.value||'Autor informado na fonte',180)});
 }
 return matches.slice(0,10);
}
async function openverse(query){
 const params=new URLSearchParams({q:query,page_size:'12',license:'by,by-sa,cc0,pdm',mature:'false'});
 const json=await fetchJson('https://api.openverse.org/v1/images/?'+params);
 const matches=[];
 for(const item of json.results||[]){
  if(!/^[0-9a-f-]{36}$/i.test(item.id||''))continue;
  const lic0=clean(item.license,30).toLowerCase();
  if(!['by','by-sa','cc0','pdm'].includes(lic0))continue;
  const thumb=safeUrl(item.thumbnail,['api.openverse.org']);if(!thumb)continue;
  const pageUrl=safeUrl(item.foreign_landing_url,['commons.wikimedia.org','www.flickr.com','flickr.com','www.wikimedia.org','www.pexels.com','www.pixabay.com','www.geograph.org.uk','www.rawpixel.com','wordpress.org']);
  // Fonte pode ser outro acervo aberto indexado: apresentar link de origem
  // somente se o endpoint devolve um URL HTTPS seguro para navegação.
  const otherPage=(()=>{try{let u=new URL(item.foreign_landing_url);return u.protocol==='https:'?u.href.slice(0,1100):''}catch{return ''}})();
  matches.push({source:'openverse',id:item.id,title:clean(item.title,160),thumb,
   pageUrl:pageUrl||otherPage,license:lic0==='pdm'?'Domínio público':lic0==='cc0'?'CC0':('CC BY'+(lic0==='by-sa'?'-SA':'')+' '+clean(item.license_version||'4.0',10)),
   licenseUrl:(()=>{try{const u=new URL(item.license_url||'');return u.protocol==='https:'&&u.hostname.endsWith('creativecommons.org')?u.href:''}catch{return ''}})(),
   creator:clean(item.creator||'Autor informado na fonte',180)});
 }
 return matches.slice(0,10);
}
export async function onRequestPost({request,env}){
 if(!(await isAdmin(request,env)))return reply({error:'Conecte ao banco para buscar fotos.'},401);
 if(Number(request.headers.get('content-length')||0)>2000)return reply({error:'Pesquisa muito longa.'},413);
 let body;try{body=await request.json()}catch{return reply({error:'Pesquisa inválida.'},400)}
 const query=clean(body?.query,160),region=clean(body?.region,100),scope=body?.scope==='region'?'region':'place';
 if(query.length<3)return reply({error:'Digite o nome do local ou da região para buscar fotos.'},422);
 const term=scope==='region'?query:([query,region].filter(Boolean).join(' ')).slice(0,200);
 const searches=await Promise.allSettled([wikimedia(term),openverse(term)]);
 const commons=searches[0].status==='fulfilled'?searches[0].value:[];
 const ov=searches[1].status==='fulfilled'?searches[1].value:[];
 if(searches.every(x=>x.status==='rejected'))return reply({error:'As fontes de fotos não responderam. Tente novamente mais tarde.'},502);
 return reply({results:[...commons,...ov],term,sources:{
  commons:{count:commons.length,ok:searches[0].status==='fulfilled'},
  openverse:{count:ov.length,ok:searches[1].status==='fulfilled'}
 },note:'As fotos são resultados de pesquisa, não identificação garantida do local. Confira a imagem, origem e licença antes de usá-la.'});
}
