(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('bikePrev'))return;
const bikesDefault=[{id:'fz25',nome:'Yamaha Fazer FZ25',descricao:'Primeiro modelo do catálogo',foto:'https://yamahamotors.fbitsstatic.net/img/p/fazer-fz25-connected-155370/352536-1.jpg'},{id:'titan150',nome:'Honda CG Titan 150',descricao:'Segundo modelo do catálogo',foto:'https://commons.wikimedia.org/wiki/Special:FilePath/Honda%20Titan%20150%20Paranagua%2004%202009%205551.JPG'}];
const defs=[['suporte','Suporte para celular','viagem'],['bau','Baú traseiro','viagem'],['bolsa','Bolsa de tanque','viagem'],['protetor','Protetor de motor','protecao'],['manoplas','Manoplas','estilo'],['bolha','Bolha esportiva','estilo']];
const demo={suporte:[['trava','Suporte com trava','Fixação com trava de segurança'],['antivibracao','Suporte antivibração','Sistema de redução de vibração'],['impermeavel','Suporte impermeável','Capa para respingos']],bau:[['bau35','Baú de 35 L','Compacto para passeios'],['bau45','Baú de 45 L','Mais espaço para bagagem']],bolsa:[['bolsa10','Bolsa compacta','Objetos pequenos'],['bolsa18','Bolsa expansível','Mais capacidade']],protetor:[['slider','Slider de proteção','Proteção lateral'],['tubular','Protetor tubular','Proteção externa']],manoplas:[['borracha','Manoplas de borracha','Acabamento discreto'],['premium','Manoplas esportivas','Visual personalizado']],bolha:[['fume','Bolha fumê','Visual escurecido'],['transparente','Bolha transparente','Visual discreto']]};
const outlines={suporte:'<rect x="8" y="2" width="8" height="16" rx="2"/><path d="M7 8H4v8h3M17 8h3v8h-3"/>',bau:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M3 12h18"/>',bolsa:'<path d="M4 8h16l1 12H3L4 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',protetor:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',manoplas:'<rect x="2" y="8" width="20" height="8" rx="4"/><path d="M6 8v8M9 8v8M12 8v8M15 8v8M18 8v8"/>',bolha:'<path d="M4 17c4-1 6-6 8-13 2 7 4 12 8 13M6 20h12M8 16h8"/>'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{const u=new URL(s||'',location.origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return''}};
let bikes=[...bikesDefault],data=null,index=0,chosen={},tab='catalogo',category='todos',active='',shops='',fade=null,tick=0;
const galleryIndexes={},galleryPhotos=m=>[...new Set([...(Array.isArray(m.fotos)?m.fotos:[]),m.foto].filter(x=>url(x)))].slice(0,5);
const bike=()=>bikes[index];
const groupList=()=>defs.map(([id,name,type])=>{const saved=data?.grupos?.[bike().id]?.find(g=>g.id===id);return{id,name:saved?.nome||name,type:saved?.categoria||type,foto:saved?.foto||''}});
const options=id=>{const group=data?.grupos?.[bike().id]?.find(g=>g.id===id);return group?.modelos?.length?group.modelos.map(m=>({id:m.id,name:m.nome,desc:m.descricao||'',foto:m.foto||'',fotos:Array.isArray(m.fotos)?m.fotos:[],shopee:m.shopee||'',mercadolivre:m.mercadolivre||'',demo:!!m.demo})):[]};
const svg=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="#ffae6c" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(outlines[id]||'')+'</svg>';
const image=(id,m)=>url(m?.foto)?'<img class="group-photo" loading="lazy" src="'+esc(url(m.foto))+'" alt="'+esc(m.name)+'">':svg(id);
const key=()=> 'asphalt-boys-'+bike().id+'-montagem-v2';
const vibe=()=>{try{navigator.vibrate?.(8)}catch{}};
function read(){chosen={};try{const v=JSON.parse(localStorage.getItem(key())||'{}');if(v&&typeof v==='object'&&!Array.isArray(v))for(const [id,model]of Object.entries(v))if(options(id).some(m=>m.id===model))chosen[id]=model}catch{}}
function save(){try{localStorage.setItem(key(),JSON.stringify(chosen))}catch{}}
function counts(){const n=Object.keys(chosen).length;$('tabMinha').textContent='Minha moto ('+n+')';$('myCount').textContent=n+' acessórios';$('btnVerMontagem').textContent='Ver minha montagem ('+n+') →';$('btnMontagemDetalhe').textContent='Ver minha moto ('+n+') →'}
function groupsRender(){
 const arr=groupList().filter(g=>category==='todos'||g.type===category);
 $('catalogCount').textContent=arr.length+' categorias';
 $('motoProdutos').innerHTML=arr.map(g=>'<button type="button" class="group-card" data-group="'+g.id+'" data-chosen="'+!!chosen[g.id]+'"><div class="group-visual">'+image(g.id,{foto:g.foto,name:g.name})+'</div><div><h4>'+esc(g.name)+'</h4><p>'+options(g.id).length+' modelos para escolher</p></div><div class="group-bottom"><span>'+(chosen[g.id]?'✓ Modelo escolhido':'Escolher modelo')+'</span><strong>›</strong></div></button>').join('');
}
function detailRender(){
 const g=groupList().find(g=>g.id===active);$('catalogBrowse').hidden=!!g;$('catalogDetail').hidden=!g;$('motoFiltros').hidden=!!g;$('catalogCount').hidden=!!g;if(!g)return;
 $('detailTitle').textContent=g.name;$('detailDescription').textContent='Escolha um modelo para '+bike().nome+'. Confira a compatibilidade no anúncio.';
 $('modelCount').textContent=options(g.id).length+' MODELOS';
 $('motoModelos').innerHTML=options(g.id).map(m=>{
  const photos=galleryPhotos(m),idx=Math.min(galleryIndexes[m.id]||0,Math.max(0,photos.length-1));galleryIndexes[m.id]=idx;
  const media=photos.length?'<div class="photo-gallery" data-gallery="'+esc(m.id)+'"><img class="gallery-main-img" loading="lazy" src="'+esc(photos[idx])+'" alt="'+esc(m.name)+' - foto '+(idx+1)+'" data-photo-zoom="'+esc(m.id)+'" tabindex="0" role="button" aria-label="Ampliar foto do produto">'+(photos.length>1?'<button type="button" class="gallery-arrow left" data-photo-step="-1" data-photo-id="'+esc(m.id)+'" aria-label="Foto anterior">‹</button><button type="button" class="gallery-arrow right" data-photo-step="1" data-photo-id="'+esc(m.id)+'" aria-label="Próxima foto">›</button><div class="gallery-dots">'+photos.map((_,i)=>'<button type="button" data-photo-index="'+i+'" data-photo-id="'+esc(m.id)+'" class="'+(i===idx?'active':'')+'" aria-label="Ver foto '+(i+1)+'"></button>').join('')+'</div>':'')+'</div>':image(g.id,m);
  return '<article class="variant-card" data-chosen="'+(chosen[g.id]===m.id)+'"><div class="group-visual">'+media+'</div><div><h4>'+esc(m.name)+'</h4><p>'+esc(m.desc)+'</p>'+(m.demo?'<p class="subtle-tag">Exemplo · sem anúncio cadastrado</p>':'')+'</div><button type="button" class="'+(chosen[g.id]===m.id?'btn-outline':'btn-primary')+'" data-model="'+esc(m.id)+'">'+(chosen[g.id]===m.id?'✓ Selecionado — retirar':'＋ Escolher este modelo')+'</button></article>'
 }).join('');
}
function buildRender(){
 const arr=groupList().filter(g=>Object.prototype.hasOwnProperty.call(chosen,g.id));
 if(!arr.length){$('motoMontagem').innerHTML='<div class="empty"><strong>Sua montagem está vazia</strong><span>Escolha um modelo para personalizar sua moto.</span></div>';return}
 $('motoMontagem').innerHTML=arr.map(g=>{
  const model=options(g.id).find(m=>m.id===chosen[g.id]);const s=url(model?.shopee),ml=url(model?.mercadolivre);
  return '<article class="build-item"><div class="build-header"><div class="build-heading"><div class="group-visual">'+image(g.id,model)+'</div><span><strong>'+esc(model?.name||g.name)+'</strong><small>'+esc(g.name)+'</small></span></div><button type="button" class="remove-btn" data-remove="'+g.id+'" aria-label="Remover">×</button></div><div class="build-actions"><button type="button" class="btn-outline" data-change="'+g.id+'">Trocar modelo</button><button type="button" class="btn-outline" data-shops="'+g.id+'">Lojas</button></div>'+
  (shops===g.id?'<div class="offer-panel"><div class="shop-options">'+(s?'<a class="shop-link" href="'+esc(s)+'" target="_blank" rel="sponsored noopener noreferrer">Shopee ↗</a>':'<button disabled>Shopee · em breve</button>')+(ml?'<a class="shop-link" href="'+esc(ml)+'" target="_blank" rel="sponsored noopener noreferrer">Mercado Livre ↗</a>':'<button disabled>Mercado Livre · em breve</button>')+'</div></div>':'')+'</article>'
 }).join('');
}
function render(){counts();groupsRender();detailRender();buildRender()}
function switchTab(next){if(next!=='catalogo'&&next!=='minha')return;vibe();tab=next;const mine=tab==='minha';$('motoTabs').style.setProperty('--idx',mine?'1':'0');$('tabAcessorios').setAttribute('aria-selected',String(!mine));$('tabMinha').setAttribute('aria-selected',String(mine));$('painelAcessorios').hidden=mine;$('painelMinha').hidden=!mine;render()}
function switchCategory(next){const arr=['todos','viagem','protecao','estilo'];if(!arr.includes(next)||next===category)return;category=next;vibe();const stamp=++tick;$('motoFiltros').style.setProperty('--idx',String(arr.indexOf(next)));$('motoFiltros').querySelectorAll('[data-cat]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat===next)));const grid=$('motoProdutos');if(fade)clearTimeout(fade);if(matchMedia('(prefers-reduced-motion:reduce)').matches){grid.classList.remove('is-transitioning');groupsRender();return}grid.classList.add('is-transitioning');fade=setTimeout(()=>{if(stamp!==tick)return;groupsRender();requestAnimationFrame(()=>grid.classList.remove('is-transitioning'))},110)}
function photo(){
 const b=bike(),img=$('fz25Foto');$('bikeName').textContent=b.nome;$('bikeSubtitle').textContent=b.descricao||'';$('bikeBadge').textContent=(index+1)+' de '+bikes.length;$('myBikeTitle').textContent='Minha '+b.nome;$('bikeFallbackTitle').textContent=b.nome.toUpperCase();img.hidden=false;$('fz25Fallback').style.display='none';img.dataset.backup='';
 img.onerror=()=>{if(b.id==='fz25'&&!img.dataset.backup){img.dataset.backup='1';img.src='https://production.autoforce.com/uploads/version/profile_image/11636/model_main_webp_comprar-titanium-grey-cinza-fosco_64db317cef.png.webp'}else{img.hidden=true;$('fz25Fallback').style.display='flex'}};
 const src=url(b.foto)||url(bikesDefault.find(x=>x.id===b.id)?.foto);if(src)img.src=src;else img.onerror();img.alt=b.nome;
}
function bikeChange(n){if(bikes.length<2)return;vibe();index=(index+n+bikes.length)%bikes.length;category='todos';active='';shops='';tab='catalogo';read();photo();$('motoFiltros').style.setProperty('--idx','0');$('motoFiltros').querySelectorAll('[data-cat]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cat==='todos')));$('motoTabs').style.setProperty('--idx','0');$('tabAcessorios').setAttribute('aria-selected','true');$('tabMinha').setAttribute('aria-selected','false');$('painelAcessorios').hidden=false;$('painelMinha').hidden=true;render()}
async function load(){try{const res=await fetch('./api/motos',{cache:'no-store'});if(!res.ok)return;const json=await res.json();if(!json.motos?.length||!json.grupos)return;const old=bike().id;data=json;bikes=json.motos;index=Math.max(0,bikes.findIndex(x=>x.id===old));read();photo();render()}catch{}}
$('bikePrev').onclick=()=>bikeChange(-1);$('bikeNext').onclick=()=>bikeChange(1);
$('motoTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)switchTab(b.dataset.tab)});
$('motoFiltros').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b)switchCategory(b.dataset.cat)});
$('motoProdutos').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(b){vibe();active=b.dataset.group;detailRender()}});
function changeGalleryPhoto(id,step,index=null){
 const m=options(active).find(x=>x.id===id);if(!m)return;const photos=galleryPhotos(m);if(!photos.length)return;
 const current=galleryIndexes[id]||0;galleryIndexes[id]=index===null?(current+step+photos.length)%photos.length:Math.max(0,Math.min(index,photos.length-1));
 detailRender();
}
function openPhotoZoom(id){
 const m=options(active).find(x=>x.id===id);if(!m)return;const photos=galleryPhotos(m);if(!photos.length)return;
 const light=$('photoLightbox');light.hidden=false;light.dataset.model=id;light.querySelector('img').src=photos[galleryIndexes[id]||0];light.querySelector('img').alt=m.name;
 light.querySelector('.lightbox-counter').textContent=((galleryIndexes[id]||0)+1)+' / '+photos.length;
 light.querySelectorAll('[data-light-step]').forEach(b=>b.hidden=photos.length<2);
 light.querySelector('[data-light-close]').focus();
}
function updateLightbox(){
 const light=$('photoLightbox');if(light.hidden)return;const m=options(active).find(x=>x.id===light.dataset.model);if(!m){light.hidden=true;return}
 const photos=galleryPhotos(m),idx=galleryIndexes[m.id]||0;light.querySelector('img').src=photos[idx];light.querySelector('.lightbox-counter').textContent=(idx+1)+' / '+photos.length;
}
$('motoModelos').addEventListener('click',e=>{
 const step=e.target.closest('[data-photo-step]'),dot=e.target.closest('[data-photo-index]'),zoom=e.target.closest('[data-photo-zoom]');
 if(step){e.stopPropagation();changeGalleryPhoto(step.dataset.photoId,Number(step.dataset.photoStep));return}
 if(dot){e.stopPropagation();changeGalleryPhoto(dot.dataset.photoId,0,Number(dot.dataset.photoIndex));return}
 if(zoom){openPhotoZoom(zoom.dataset.photoZoom);return}
});
$('motoModelos').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-photo-zoom]')){e.preventDefault();openPhotoZoom(e.target.dataset.photoZoom)}});
let touchX=null;
$('motoModelos').addEventListener('touchstart',e=>{if(e.target.closest('[data-gallery]'))touchX=e.changedTouches[0].clientX},{passive:true});
$('motoModelos').addEventListener('touchend',e=>{if(touchX===null)return;const box=e.target.closest('[data-gallery]'),dx=e.changedTouches[0].clientX-touchX;touchX=null;if(box&&Math.abs(dx)>45)changeGalleryPhoto(box.dataset.gallery,dx<0?1:-1)},{passive:true});
$('photoLightbox').addEventListener('click',e=>{
 const light=$('photoLightbox');if(e.target===light||e.target.closest('[data-light-close]')){light.hidden=true;return}
 const b=e.target.closest('[data-light-step]');if(b){changeGalleryPhoto(light.dataset.model,Number(b.dataset.lightStep));updateLightbox()}
});
document.addEventListener('keydown',e=>{const light=$('photoLightbox');if(light.hidden)return;if(e.key==='Escape'){light.hidden=true}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){changeGalleryPhoto(light.dataset.model,e.key==='ArrowRight'?1:-1);updateLightbox()}});
$('motoModelos').addEventListener('click',e=>{const b=e.target.closest('[data-model]');if(!b)return;const m=options(active).find(x=>x.id===b.dataset.model);if(!m)return;vibe();if(chosen[active]===m.id)delete chosen[active];else chosen[active]=m.id;save();counts();detailRender();buildRender()});
$('motoMontagem').addEventListener('click',e=>{const b=e.target.closest('[data-remove],[data-change],[data-shops]');if(!b)return;vibe();if(b.dataset.remove){delete chosen[b.dataset.remove];save();render()}else if(b.dataset.change){active=b.dataset.change;switchTab('catalogo');detailRender()}else if(b.dataset.shops){shops=shops===b.dataset.shops?'':b.dataset.shops;buildRender()}});
$('btnVoltarCategorias').onclick=()=>{active='';detailRender()};
$('btnVerMontagem').onclick=()=>switchTab('minha');$('btnMontagemDetalhe').onclick=()=>switchTab('minha');$('btnMais').onclick=()=>{active='';switchTab('catalogo')};
read();photo();render();load();
})();