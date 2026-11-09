/* Asphalt Boys • planejador público sem dependências e sem chave de Google.
   Dados publicados via Cloudflare Pages Function /api/content, quando D1 estiver configurado. */
(function(){
 'use strict';
 const modal=document.getElementById('tripModal'),panel=document.getElementById('tripPanel');
 if(!modal||!panel)return;
 const q=id=>document.getElementById(id);
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const httpsUrl=s=>{try{let u=new URL(String(s||''));return u.protocol==='https:'?u.href:''}catch{return ''}};
 const validCoords=s=>{const m=String(s||'').trim().match(/^(-?\d{1,2}(?:\.\d{1,9})?),\s*(-?\d{1,3}(?:\.\d{1,9})?)$/);return m&&Math.abs(Number(m[1]))<=90&&Math.abs(Number(m[2]))<=180?m[1]+','+m[2]:''};
 const validPlaceId=s=>/^[a-zA-Z0-9_-]{5,250}$/.test(String(s||''))?String(s):'';
 const MAX_ROUTE_STOPS=20;
 const MOBILE_WAYPOINTS=3;
 const APP_MAX_STOPS=9;
 // Abrir o link ORIGINAL de quem cadastrou. Nunca trocar por resultado por nome.
 const mapLink=p=>{
   const original=httpsUrl(p.maps);if(original)return original;
   const query=validCoords(p.mapCoordinates)||String(p.endereco||p.nome||'');
   const u=new URL('https://www.google.com/maps/search/?api=1');
   u.searchParams.set('query',query);
   if(!validCoords(p.mapCoordinates)&&validPlaceId(p.googlePlaceId))u.searchParams.set('query_place_id',validPlaceId(p.googlePlaceId));
   return u.href;
 };
 const mapping=id=>id==='canoa'?'canoa-quebrada':id;
 const categories=[['cafe','☕ Café da manhã'],['almoco','🍽️ Almoço'],['cafe_tarde','🥐 Café da tarde'],['jantar','🌙 Jantar'],['turismo','📸 Pontos turísticos'],['descanso','🏍️ Descanso']];
 const normalize=c=>/cafe_tarde|caf[eé] da tarde/i.test(c)?'cafe_tarde':/jantar|janta/i.test(c)?'jantar':/café|cafe/i.test(c)?'cafe':/restaurante|almo/i.test(c)?'almoco':/descanso|posto/i.test(c)?'descanso':'turismo';
 // Uma parada pode aparecer em várias categorias, sempre com o mesmo ID e foto.
 const stopCategories=p=>{
   const raw=Array.isArray(p?.categorias)&&p.categorias.length?p.categorias:[p?.categoria||'turismo'];
   const valid=categories.map(([id])=>id);
   return [...new Set(raw.filter(id=>valid.includes(id)))];
 };
 const categoryLabels=p=>stopCategories(p).map(id=>categories.find(([c])=>c===id)[1]).join(' · ');
 // Aviso de possíveis erros de geolocalização nos destinos da serra.
 // Nunca trocar automaticamente um local por outro de nome parecido.
 function suspectStop(p){
  if(!p)return '';
  const address=String(p.endereco||'').trim();
  if(/^(?:CE|BR)[-\s]?\d{2,3}(?:\s*,\s*\d+)?$/i.test(address))
   return 'Endereço contém somente o nome de uma rodovia.';
  const gps=validCoords(p.mapCoordinates);
  if(mapping(destination?.id)==='guaramiranga'&&gps){
   const [lat,lon]=gps.split(',').map(Number);
   const rad=Math.PI/180;
   const dLat=(lat+4.2156)*rad,dLon=(lon+38.9585)*rad;
   const a=Math.sin(dLat/2)**2+Math.cos(-4.2156*rad)*Math.cos(lat*rad)*Math.sin(dLon/2)**2;
   const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
   if(km>70)return 'GPS do cadastro a cerca de '+Math.round(km)+' km de Guaramiranga. Confira o ponto original antes de navegar.';
  }
  return '';
 }
 // O D1 é a fonte de verdade. Não há paradas fixas no código que possam reaparecer após exclusão.
 let reviewRequestEpoch=0;
 const categorySearches=Object.create(null);
 const searchText=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 let originMode='gps',activeLegIndex=0;
 let data={destinos:[],paradas:[],rotas:[]},loaded=false,destination=null,tab='custom',category='turismo',selected=[],presetId='',previewId='',focusBefore=null,stopPhotoObserver=null,previewReturnScroll=0;
 const urlParams=new URLSearchParams(location.search);
 const localPreview=urlParams.get('preview')==='local';
 function safeStore(k,v){try{localStorage.setItem(k,v)}catch{}}
 function safeRead(k){try{return localStorage.getItem(k)}catch{return null}}

 const OPEN_MODAL_KEY='asphalt-boys-rota-aberta-v1';
 const draftKey=id=>'asphalt-boys-roteiro-v1-'+(localPreview?'preview-':'')+mapping(id);
 function saveRoute(){
  if(!destination)return;
  safeStore(draftKey(destination.id),JSON.stringify({v:1,stops:selected.slice(0,MAX_ROUTE_STOPS),originMode,
   origin:q('tripOrigin').value.trim().slice(0,150),presetId,tab,category,legIndex:activeLegIndex}));
 }
 function restoreRoute(){
  if(!destination)return false;
  let saved;try{saved=JSON.parse(safeRead(draftKey(destination.id))||'null')}catch{return false}
  if(!saved||saved.v!==1||!Array.isArray(saved.stops))return false;
  selected=[...new Set(saved.stops.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{3,120}$/.test(id)&&stopById(id)))].slice(0,MAX_ROUTE_STOPS);
  activeLegIndex=Number.isInteger(saved.legIndex)&&saved.legIndex>=0&&saved.legIndex<MAX_ROUTE_STOPS?saved.legIndex:0;
  presetId=typeof saved.presetId==='string'&&currentRoutes().some(r=>r.id===saved.presetId)?saved.presetId:'';
  category=categories.some(([id])=>id===saved.category)?saved.category:category;
  q('tripOrigin').value=typeof saved.origin==='string'?saved.origin.slice(0,150):'';
  setOriginMode(saved.originMode==='manual'&&q('tripOrigin').value.trim()?'manual':'gps');
  tab=selected.length?'mine':['mine','custom','preset'].includes(saved.tab)?saved.tab:'custom';
  return true;
 }
 function rememberOpen(id){try{sessionStorage.setItem(OPEN_MODAL_KEY,id)}catch{}}
 function forgetOpen(){try{sessionStorage.removeItem(OPEN_MODAL_KEY)}catch{}}
 function readOpen(){try{return sessionStorage.getItem(OPEN_MODAL_KEY)||''}catch{return ''}}
 function originLabel(){return originMode==='gps'?'Minha localização atual':(q('tripOrigin').value.trim()||'Cidade a definir')}
 function routeSummaryText(){
  const ending=selected.length?stopById(selected[selected.length-1])?.nome:destination?.nome;
  return originLabel()+' → '+selected.length+' parada(s) → '+(ending||'Destino');
 }
 function setOriginMode(mode){
  originMode=mode==='manual'?'manual':'gps';
  q('tripUseGps').setAttribute('aria-pressed',String(originMode==='gps'));
  q('tripUseManual').setAttribute('aria-pressed',String(originMode==='manual'));
  q('tripManualOrigin').hidden=originMode!=='manual';
  q('tripOriginHint').textContent=originMode==='gps'
   ?'O Google Maps usará a localização do aparelho ao abrir a navegação. O site não precisa acessar seu GPS.'
   :'Digite uma cidade ou endereço para começar a rota de outro lugar.';
  if(destination)q('tripRouteSummary').textContent=routeSummaryText();
 }
 function mergeData(a){if(!a||!['destinos','paradas','rotas'].every(k=>Array.isArray(a[k])))return false;data=a;return true}
 function currentStops(){
   if(!destination)return[];
   const destId=mapping(destination.id);
   return data.paradas.filter(p=>p.destinoId===destId);
 }
 function currentRoutes(){return destination?data.rotas.filter(r=>r.destinoId===mapping(destination.id)):[]}
 function stopById(id){return currentStops().find(p=>p.id===id)}
 function showTab(next,scrollOnTabClick=false){
  const changed=tab!==next;
  tab=next;
  for(const name of ['custom','preset','mine'])q('trip'+name.charAt(0).toUpperCase()+name.slice(1)+'Section').hidden=next!==name;
  document.querySelectorAll('#tripTabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===next)));
  q('tripShareBox').hidden=true;
  saveRoute();
  // Só rolar ao topo em uma troca de aba solicitada pelo visitante.
  if(scrollOnTabClick&&changed)panel.scrollTop=0;
 }
 function renderAvailable(){
   const term=searchText(categorySearches[category]||'').trim();
   const categoryStops=currentStops().filter(p=>stopCategories(p).includes(category));
   const stops=term?categoryStops.filter(p=>searchText([p.nome,p.descricao,p.endereco,categoryLabels(p)].join(' ')).includes(term)):categoryStops;
   const name=categories.find(([id])=>id===category)?.[1]||'categoria';
   q('tripSearch').placeholder='Pesquisar em '+name.replace(/^[^a-zA-ZÀ-ÿ]+/,'').trim()+'…';
   q('tripSearchCount').textContent=stops.length+' local'+(stops.length===1?'':'is')+(term?' encontrado'+(stops.length===1?'':'s'):'')+' nesta categoria';
   q('tripCategories').innerHTML=categories.map(([id,label])=>'<button type="button" class="tripCat" data-cat="'+id+'" aria-pressed="'+(category===id)+'">'+label+'</button>').join('');
   q('tripAvailable').innerHTML=stops.length?stops.map(p=>{
     const pic=httpsUrl(p.foto),dis=selected.includes(p.id),full=selected.length>=MAX_ROUTE_STOPS,loc=String(p.endereco||'').trim();
     const credits=p.fotoLicenca&&pic?'<details class="tripTiny mt-1"><summary class="cursor-pointer text-zinc-400" aria-label="Créditos da foto">ⓘ</summary><p class="mt-1">'+esc(p.fotoAutor||'Autor informado na fonte')+' · '+esc(p.fotoLicenca)+' · Foto adaptada'+
  (httpsUrl(p.fotoFonteUrl)?' · <a href="'+esc(httpsUrl(p.fotoFonteUrl))+'" target="_blank" rel="noopener noreferrer" class="underline">Original</a>':'')+
  (httpsUrl(p.fotoLicencaUrl)?' · <a href="'+esc(httpsUrl(p.fotoLicencaUrl))+'" target="_blank" rel="noopener noreferrer" class="underline">Licença</a>':'')+
  '</p></details>':'';
     return '<article class="tripStop">'+(pic?'<img loading="lazy" src="'+esc(pic)+'" alt="Imagem de '+esc(p.nome)+'">':'<div class="tripGooglePhotoHolder" data-google-public-stop="'+esc(p.id)+'"><div class="tripFallback">📍</div><span class="tripTiny block mt-1" data-google-public-credit></span></div>')+'<div class="min-w-0"><p class="font-semibold text-sm">'+esc(p.nome)+'</p><p class="tripTiny">'+esc(categoryLabels(p))+'</p><p class="tripTiny mt-1">'+esc(p.descricao||'')+'</p>'+credits+'<div class="flex flex-wrap gap-2 mt-2"><button type="button" class="tripNavBtn text-xs" data-preview="'+esc(p.id)+'">👁 Prévia</button><button type="button" class="tripNavBtn text-xs text-orange-300" data-add-stop="'+esc(p.id)+'" '+(dis||full||!loc?'disabled':'')+'>'+(dis?'✓ Adicionada':!loc?'Sem endereço':full?'Limite de 20 paradas':'+ Adicionar')+'</button></div></div></article>';
   }).join(''):'<p class="tripTiny rounded-xl border border-dashed border-zinc-600 p-5">'+(term?'Nenhuma parada encontrada nesta categoria. Tente outra pesquisa.':'Ainda não há paradas publicadas nesta categoria. No painel, escolha a parada e clique em Publicar no site.')+'</p>';
   loadPublicStopPhotos();
 }
 async function loadPublicStopPhoto(node){
   if(!node.isConnected)return;
   const id=node.dataset.googlePublicStop;
   if(!id||!stopById(id))return;
   try{
     const response=await fetch('/api/place?stop='+encodeURIComponent(id),{cache:'no-store'});
     if(!response.ok)return;
     const result=await response.json();
     if(!node.isConnected||!result.available||!httpsUrl(result.photo))return;
     const placeholder=node.querySelector('.tripFallback');
     if(placeholder){
       const img=document.createElement('img');img.src=httpsUrl(result.photo);
       img.loading='lazy';img.alt='Foto do Google Maps: '+String(result.name||stopById(id)?.nome||'Local').slice(0,120);
       placeholder.replaceWith(img);
     }
     const credit=node.querySelector('[data-google-public-credit]');
     if(credit){
       credit.textContent='';
       const attributions=Array.isArray(result.photoAttributions)?result.photoAttributions.filter(x=>x&&x.name):[];
       const label='Foto: '+(attributions.length?attributions.map(a=>a.name).join(', '):'Google Maps');
       const el=document.createElement('a');el.textContent='ⓘ';el.title=label;el.setAttribute('aria-label',label);el.className='underline text-xs';
       el.href=httpsUrl(attributions[0]?.uri)||httpsUrl(result.map)||'https://maps.google.com/';
       el.rel='noopener noreferrer';el.target='_blank';credit.appendChild(el);
     }
   }catch{}
 }
 function loadPublicStopPhotos(){
   if(stopPhotoObserver){stopPhotoObserver.disconnect();stopPhotoObserver=null}
   // Fotos do Google carregadas apenas sob demanda para paradas publicadas.
   if(localPreview)return;
   const nodes=[...q('tripAvailable').querySelectorAll('[data-google-public-stop]')].slice(0,8);
   if(!nodes.length)return;
   const queue=[];let active=0;
   const pump=()=>{
     while(queue.length&&active<2){
       const node=queue.shift();
       active++;
       loadPublicStopPhoto(node).finally(()=>{active--;pump()});
     }
   };
   if('IntersectionObserver' in window){
     const observer=new IntersectionObserver(entries=>{
       for(const entry of entries)if(entry.isIntersecting){
         observer.unobserve(entry.target);queue.push(entry.target);
       }
       pump();
     },{root:panel,rootMargin:'120px'});
     stopPhotoObserver=observer;
     for(const node of nodes)observer.observe(node);
   }else{queue.push(...nodes.slice(0,3));pump()}
 }

 function renderPresets(){
  const routes=currentRoutes();
  q('tripPresets').innerHTML=routes.length?routes.map(r=>{
    const stops=(r.paradas||[]).map(id=>stopById(id)?.nome||'Parada não disponível');
    return '<article class="tripPresetCard"><h4 class="font-bold">'+esc(r.nome)+'</h4><p class="tripTiny mt-1">'+esc(r.descricao||'Rota sugerida pelo grupo')+'</p><p class="tripTiny mt-2">'+stops.length+' paradas</p><div class="flex flex-wrap gap-2 mt-3"><button type="button" class="tripNavBtn" data-view-route="'+esc(r.id)+'">👁 Ver paradas</button><button type="button" class="tripBtn text-sm" data-use-route="'+esc(r.id)+'">Usar esta rota</button></div><ol class="tripPresetStops" id="tripRoute-'+esc(r.id)+'" hidden>'+stops.map(name=>'<li>'+esc(name)+'</li>').join('')+'</ol></article>';
  }).join(''):'<p class="tripTiny rounded-xl border border-dashed border-zinc-600 p-5">Ainda não há rotas prontas publicadas para este destino. Você pode montar a sua rota na primeira aba.</p>';
 }
 function renderChosen(){
  const stops=currentStops();
  q('tripChosen').innerHTML=selected.length?selected.map((id,i)=>{
   const p=stops.find(s=>s.id===id);
   const categoryNames=p?stopCategories(p).map(cat=>categories.find(([key])=>key===cat)?.[1]).filter(Boolean):[];
   const chips=categoryNames.map(name=>'<span class="tripPickedChip">'+esc(name)+'</span>').join('');
   const suspect=suspectStop(p);
   const original=p?mapLink(p):'';
   const check=original?'<a class="tripStopCheck" href="'+esc(original)+'" target="_blank" rel="noopener noreferrer" aria-label="Conferir local original no Google Maps: '+esc(p.nome)+'">📍 Ver ponto no Maps ↗</a>':'';
   return '<div class="tripPicked"><span class="tripPickedIndex">'+(i+1)+'.</span><div class="tripPickedInfo"><div class="tripPickedName">'+esc(p?.nome||'Parada indisponível')+'</div><div class="tripPickedCategories">'+chips+'</div>'+(suspect?'<p class="tripStopWarning">⚠️ Localização suspeita: '+esc(suspect)+'</p>':'')+check+'</div><div class="tripPickedActions"><button type="button" class="tripNavBtn" data-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Mover parada para cima">↑</button><button type="button" class="tripNavBtn" data-down="'+i+'" '+(i===selected.length-1?'disabled':'')+' aria-label="Mover parada para baixo">↓</button><button type="button" class="tripNavBtn" data-remove="'+i+'" aria-label="Remover parada">×</button></div></div>';
  }).join(''):'<p class="tripTiny">Nenhuma parada selecionada. Você pode explorar as categorias ou escolher uma rota pronta.</p>';
  q('tripCount').textContent=selected.length+' parada'+(selected.length===1?'':'s');
  q('tripRouteSummary').textContent=routeSummaryText();
  q('tripOpenMaps').disabled=selected.length>MAX_ROUTE_STOPS;
  q('tripOpenMaps').textContent=selected.length>APP_MAX_STOPS
   ?'🧭 Ver '+Math.ceil(selected.length/APP_MAX_STOPS)+' etapas da viagem'
   :'🗺️ Abrir rota no Maps'+(selected.length?' ('+selected.length+' paradas)':'');
  const suspicious=selected.map(stopById).filter(p=>suspectStop(p));
   q('tripMapsHelp').textContent=suspicious.length
   ?'⚠️ Confira a localização de '+suspicious.map(p=>p.nome).join(', ')+' antes de navegar. O cadastro pode causar um desvio.'
   :selected.length>APP_MAX_STOPS
   ?'As '+selected.length+' paradas serão organizadas automaticamente em '+Math.ceil(selected.length/APP_MAX_STOPS)+' etapas, na ordem escolhida.'
   :'O Google Maps receberá até '+APP_MAX_STOPS+' paradas, respeitando a ordem do roteiro.';
  q('tripRouteSegments').hidden=true;
  q('tripRouteSegments').replaceChildren();
  saveRoute();
 }
 function render(){
   if(!destination)return;
   const offset=panel.scrollTop;
   renderAvailable();renderPresets();renderChosen();showTab(tab);
   panel.scrollTop=offset;
  }
 function open(id,share){
   destination=typeof lugares!=='undefined'?lugares.find(l=>l.id===id):null;
   if(!destination)return false;
   focusBefore=document.activeElement;tab='custom';
   const requestedCategory=urlParams.get('dest')===id?urlParams.get('categoria'):'';
   category=categories.some(([cat])=>cat===requestedCategory)?requestedCategory:'turismo';
   Object.keys(categorySearches).forEach(k=>delete categorySearches[k]);
   q('tripSearch').value='';
   selected=[];presetId='';activeLegIndex=0;
   q('tripTitle').textContent=destination.nome;
   q('tripDesc').textContent=destination.sub||'Planeje seu trajeto e descubra novas paradas.';
   const img=q('tripCover');img.onerror=()=>{img.onerror=null;if(destination.fallbackImg)img.src=destination.fallbackImg;else img.style.display='none'};img.style.display='block';img.src=destination.cover||destination.img||'';img.alt='Imagem de '+destination.nome;
   q('tripOrigin').value=(share&&share.origin)||safeRead('asphalt-boys-ultima-origem')||'';
  setOriginMode(share&&share.origin?'manual':'gps');
   if(!(share&&(share.route||share.stops||share.origin)))restoreRoute();
   if(share&&share.route){const r=currentRoutes().find(x=>x.id===share.route);if(r){selected=(r.paradas||[]).filter(id=>stopById(id)).slice(0,MAX_ROUTE_STOPS);presetId=r.id;tab='mine'}}
   else if(share&&share.stops){selected=[...new Set(share.stops.split(',').filter(id=>/^[a-z0-9_-]{3,120}$/i.test(id)&&stopById(id)))].slice(0,MAX_ROUTE_STOPS);if(selected.length)tab='mine'}
   modal.hidden=false;q('tripStopPreview').hidden=true;q('tripMain').hidden=false;q('tripModalHero').hidden=false;document.body.style.overflow='hidden';render();rememberOpen(id);panel.scrollTop=0;panel.focus();return true;
 }
 function close(){saveRoute();forgetOpen();modal.hidden=true;document.body.style.overflow='';if(focusBefore&&focusBefore.focus)focusBefore.focus()}

 function preview(id){
  const p=stopById(id);if(!p)return;
  previewReturnScroll=panel.scrollTop;
  previewId=id;
  q('tripMain').hidden=true;
  q('tripModalHero').hidden=true;
  q('tripStopPreview').hidden=false;
  q('tripPreviewName').textContent=p.nome;
  q('tripPreviewCategory').textContent=stopCategories(p).length?
   categoryLabels(p):'Ponto de parada';
  q('tripPreviewAddress').textContent=p.endereco||'Endereço ainda não cadastrado';
  q('tripPreviewDesc').textContent=p.descricao||'';
  const hoursDetails=q('tripHoursDetails');
  hoursDetails.open=false;
  const savedHours=String(p.horario||'').trim();
  hoursDetails.hidden=!savedHours;
  q('tripPreviewHours').textContent=savedHours?'Horário informado pelo grupo: '+savedHours:'';
  // O resumo não é consultado automaticamente: evita custo por miniatura/visita.
  reviewRequestEpoch++;
  const reviewDetails=q('tripReviewDetails');
  reviewDetails.open=false;
  reviewDetails.hidden=localPreview;
  reviewDetails.dataset.loaded='';
  reviewDetails.dataset.loading='';
  q('tripReviewStatus').textContent='Abra para consultar o resumo das avaliações do Google.';
  q('tripReviewStatus').hidden=false;
  q('tripReviewResult').hidden=true;
  q('tripReviewFallback').hidden=true;
  q('tripReviewFallback').href=mapLink(p);
  q('tripGoogleRating').hidden=true;
  q('tripGoogleSource').hidden=true;
  q('tripGoogleInfo').textContent=localPreview?'Prévia local. Publique esta parada para consultar os dados do Google.':'Consultando o Google Maps…';
  const im=q('tripPreviewPhoto'),photo=httpsUrl(p.foto);
  im.hidden=!photo;
  q('tripPreviewPlaceholder').hidden=!!photo;
  im.onerror=()=>{im.hidden=true;q('tripPreviewPlaceholder').hidden=false};
  if(photo){im.src=photo;im.alt='Foto de '+p.nome}
  const credit=q('tripPhotoCredit');
  credit.hidden=true;credit.textContent='';credit.removeAttribute('href');
  const legal=q('tripOpenPhotoCredit');
  if(legal){
   legal.textContent='';legal.open=false;legal.hidden=!photo||!p.fotoLicenca;
   if(!legal.hidden){
    const summary=document.createElement('summary');
    summary.textContent='ⓘ';summary.title='Créditos e licença da foto';summary.className='cursor-pointer text-xs';
    legal.appendChild(summary);
    const label=document.createElement('span');
    label.textContent=(p.fotoAutor||'Autor informado na fonte')+' · '+p.fotoLicenca+' · Imagem adaptada. ';
    legal.appendChild(label);
    for(const [url,display] of [[p.fotoFonteUrl,'Original'],[p.fotoLicencaUrl,'Licença']]){
     const link=httpsUrl(url);if(!link)continue;
     const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener noreferrer';
     a.className='underline text-orange-300 mr-3';a.textContent=display;legal.appendChild(a);
    }
   }
  }
  q('tripPreviewMap').href=mapLink(p);
  const add=q('tripPreviewAdd');
  add.disabled=selected.includes(id)||selected.length>=MAX_ROUTE_STOPS||!p.endereco;
  add.textContent=selected.includes(id)?'✓ Já está na rota':selected.length>=MAX_ROUTE_STOPS?'Máximo de 20 paradas':!p.endereco?'Endereço indisponível':'+ Adicionar à rota';
  if(!localPreview)fetch('/api/place?stop='+encodeURIComponent(p.id),{cache:'no-store'}).then(async response=>{
    const result=await response.json();
    if(previewId!==id||q('tripStopPreview').hidden)return;
    if(!response.ok||!result.available){
      q('tripGoogleInfo').textContent='Informações do Google indisponíveis agora. Abra no Google Maps para conferir.';
      return;
    }
    q('tripGoogleInfo').textContent='';
    q('tripGoogleSource').hidden=false;
    // Não trocar o nome, categoria, endereço ou link do local cadastrado por
    // outro ponto homônimo retornado pela pesquisa automática do Google.
    if(!httpsUrl(p.maps)&&httpsUrl(result.map))q('tripPreviewMap').href=httpsUrl(result.map);
    if(typeof result.rating==='number'&&Number.isFinite(result.rating)&&result.rating>=0&&result.rating<=5){
      const rate=result.rating,formatted=rate.toFixed(1).replace('.',',');
      const full=Math.min(5,Math.max(0,Math.round(rate)));
      q('tripRatingValue').textContent=formatted;
      q('tripRatingStars').innerHTML='<span class="tripPlaceStarOn">'+('★'.repeat(full))+'</span><span class="tripPlaceStarOff">'+('★'.repeat(5-full))+'</span>';
      q('tripRatingCount').textContent=typeof result.count==='number'&&Number.isFinite(result.count)?'('+Math.max(0,result.count).toLocaleString('pt-BR')+' avaliações)':'';
      q('tripGoogleRating').setAttribute('aria-label','Avaliação no Google Maps: '+formatted+' de 5 estrelas');
      q('tripGoogleRating').hidden=false;
    }
    if(Array.isArray(result.hours)&&result.hours.length){
      q('tripPreviewHours').textContent=result.hours.filter(x=>typeof x==='string').slice(0,7).join('\n');
      hoursDetails.hidden=false;
    }
    // A foto própria (upload ou URL) sempre tem prioridade sobre fotos do Google.
    // Só consultamos e exibimos a imagem do Google quando não há foto própria.
    if(httpsUrl(result.photo)&&!photo){
      im.src=httpsUrl(result.photo);im.alt='Foto do local fornecida pelo Google Maps';im.hidden=false;
      q('tripPreviewPlaceholder').hidden=true;
      im.onerror=()=>{if(photo){im.onerror=null;im.src=photo;im.alt='Foto de '+p.nome}else{im.hidden=true;q('tripPreviewPlaceholder').hidden=false}credit.hidden=true};
      const authors=Array.isArray(result.photoAttributions)?result.photoAttributions.filter(a=>a&&a.name):[];
      credit.textContent='ⓘ';credit.title='Foto: '+(authors.length?authors.map(a=>a.name).join(', '):'Google Maps');credit.setAttribute('aria-label',credit.title);
      credit.href=httpsUrl(authors[0]?.uri)||httpsUrl(result.map)||mapLink(p);
      credit.hidden=false;
    }
  }).catch(()=>{
    if(previewId===id&&!q('tripStopPreview').hidden)q('tripGoogleInfo').textContent='Não foi possível atualizar as informações do Google agora.';
  });
  panel.scrollTop=0;
  q('tripPreviewBack').focus();
 }
 function previewBack(){q('tripStopPreview').hidden=true;q('tripMain').hidden=false;q('tripModalHero').hidden=false;render();panel.scrollTop=previewReturnScroll}
 function addStop(id){
  if(!stopById(id)?.endereco||selected.length>=MAX_ROUTE_STOPS||selected.includes(id))return;
  selected.push(id);presetId='';activeLegIndex=0;render();
 }
 function destinationUrl(){return destination.dest||destination.mapa||destination.nome}
 // Links universais tentam abrir o app com até 9 destinos; Safari pode limitar a 3 intermediários.
 // A última parada escolhida vira o destino final, sem incluir a cidade novamente.
 function routePoint(stop){
  if(!stop)return null;
  const name=String(stop.nome||'').trim(),address=String(stop.endereco||'').trim();
  const id=validPlaceId(stop.googlePlaceId),gps=validCoords(stop.mapCoordinates);
  const cityId=String(stop.destinoId||mapping(destination?.id)||'');
  const city=cityId==='guaramiranga'?'Guaramiranga, Ceará, Brasil':
   cityId==='canoa-quebrada'?'Aracati, Ceará, Brasil':
   [destination?.nome||'', 'Ceará, Brasil'].filter(Boolean).join(', ');
  // Inclui sempre o nome do local. Enviar "CE-253" sozinho pode causar desvios.
  const conciseName=name.replace(/,?\s*nome antigo e tradicional:\s*/i,' - ').replace(/\.+$/,'').trim();
  const query=[conciseName,address,city].filter(Boolean).join(', ').slice(0,450);
  // Place ID específico tem prioridade sobre GPS possivelmente extraído da câmera.
  if(id&&name)return {type:'place',id,value:query,name};
  if(gps){
   if(cityId==='guaramiranga'){
    const [lat,lon]=gps.split(',').map(Number),rad=Math.PI/180;
    const dLat=(lat+4.2156)*rad,dLon=(lon+38.9585)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(-4.2156*rad)*Math.cos(lat*rad)*Math.sin(dLon/2)**2;
    const km=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    if(km>70)return null;
   }
   return {type:'gps',value:gps,name:name||gps};
  }
  return null;
 }
 function oneGoogleSegment(origin,targets){
  const last=targets[targets.length-1],intermediate=targets.slice(0,-1);
  const url=new URL('https://www.google.com/maps/dir/?api=1');
  if(origin.value)url.searchParams.set('origin',origin.value);
  if(origin.type==='place')url.searchParams.set('origin_place_id',origin.id);
  url.searchParams.set('destination',last.value);
  if(last.type==='place')url.searchParams.set('destination_place_id',last.id);
  url.searchParams.set('travelmode','driving');
  if(intermediate.length){
   url.searchParams.set('waypoints',intermediate.map(p=>p.value).join('|'));
   if(intermediate.every(p=>p.type==='place'))
    url.searchParams.set('waypoint_place_ids',intermediate.map(p=>p.id).join('|'));
  }
  return url.href;
 }
 function routeSegmentsFor(stops,origin,maxPointsPerLink=MOBILE_WAYPOINTS+1){
  if(stops.length>MAX_ROUTE_STOPS)return {segments:[],unresolved:[],error:'Máximo de 20 paradas por roteiro.'};
  const unresolved=stops.filter(p=>!routePoint(p));
  if(unresolved.length)return {segments:[],unresolved};
  const points=stops.length?stops.map(routePoint):[{type:'query',value:destinationUrl(),name:destination.nome}];
  const segments=[];
  let from=origin?{type:'query',value:origin,name:origin}:{type:'current',value:'',name:'Minha localização atual'};
  let offset=0;
  while(offset<points.length){
   // Até 3 paradas intermediárias e 1 ponto final no Google Maps do celular.
   // Endereços e coordenadas podem coexistir no mesmo link.
   let take=Math.min(Math.max(1,Math.min(APP_MAX_STOPS,maxPointsPerLink)),points.length-offset);
   let chunk=points.slice(offset,offset+take);
   let url=oneGoogleSegment(from,chunk);
   while(url.length>1950&&take>1){
    take--;chunk=points.slice(offset,offset+take);url=oneGoogleSegment(from,chunk);
   }
   if(url.length>2048)return {segments:[],unresolved:[],error:'Um endereço é longo demais para o Google Maps. Confira os pontos cadastrados.'};
   segments.push({url,from:from.name,to:chunk[chunk.length-1].name,
    firstStop:offset+1,lastStop:Math.min(stops.length,offset+take)});
   from=chunk[chunk.length-1];
   offset+=take;
  }
  return {segments,unresolved:[]};
 }
 function showGoogleLegs(result,scroll=true){
  const box=q('tripRouteSegments');box.replaceChildren();box.hidden=false;
  const heading=document.createElement('p');heading.className='tripTiny font-bold mb-2';
  heading.textContent=result.error||(
   result.unresolved?.length
    ?'Alguns locais ainda precisam de localização exata. Confira seus links originais:'
    :'Suas '+selected.length+' paradas serão navegadas em '+result.segments.length+' etapas.');
  box.appendChild(heading);
  if(result.unresolved?.length){
   for(const stop of result.unresolved){
    const link=document.createElement('a');
    link.className='tripNavBtn inline-flex items-center justify-center text-sm m-1';
    link.href=mapLink(stop);link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='📍 '+stop.nome+' — conferir ponto original ↗';
    box.appendChild(link);
   }
  }else if(result.segments.length){
   const total=result.segments.length;
   activeLegIndex=Math.min(Math.max(0,activeLegIndex),total-1);
   const current=result.segments[activeLegIndex];
   const status=document.createElement('p');status.className='tripLegStatus';
   status.textContent='ETAPA '+(activeLegIndex+1)+' DE '+total+' · Paradas '+current.firstStop+'–'+current.lastStop+' de '+selected.length;
   box.appendChild(status);
   const route=document.createElement('p');route.className='tripLegDescription';
   route.textContent=current.from+' → '+current.to;
   box.appendChild(route);
   const main=document.createElement('a');main.className='tripBtn tripLegStart';
   main.href=current.url;main.target='_blank';main.rel='noopener noreferrer';
   main.textContent='🗺️ Abrir etapa '+(activeLegIndex+1)+' no Maps ('+(current.lastStop-current.firstStop+1)+' paradas) ↗';
   box.appendChild(main);
   const note=document.createElement('p');note.className='tripTiny mt-2';
   note.textContent=activeLegIndex<total-1
    ?'Depois de chegar ao fim desta etapa, volte ao Asphalt Boys e escolha Próxima etapa. As paradas restantes continuam salvas.'
    :'Esta é a última etapa. Confira as paradas no Google Maps antes de começar.';
   box.appendChild(note);
   const controls=document.createElement('div');controls.className='tripLegControls';
   if(activeLegIndex>0){
    const prev=document.createElement('button');prev.type='button';prev.className='tripNavBtn';
    prev.textContent='← Etapa anterior';
    prev.onclick=()=>{activeLegIndex--;saveRoute();showGoogleLegs(result,false)};
    controls.appendChild(prev);
   }
   if(activeLegIndex<total-1){
    const next=document.createElement('button');next.type='button';next.className='tripNavBtn tripLegNext';
    next.textContent='Já concluí → Próxima etapa '+(activeLegIndex+2)+'/'+total;
    next.onclick=()=>{activeLegIndex++;saveRoute();showGoogleLegs(result,false)};
    controls.appendChild(next);
   }
   box.appendChild(controls);
   const all=document.createElement('details');all.className='tripLegAll mt-3';
   const summary=document.createElement('summary');summary.textContent='Ver todas as '+total+' etapas';
   all.appendChild(summary);
   result.segments.forEach((segment,i)=>{
    const link=document.createElement('a');link.className='tripNavBtn tripLegListLink';
    link.href=segment.url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Etapa '+(i+1)+'/'+total+' · Paradas '+segment.firstStop+'–'+segment.lastStop+' · '+segment.to+' ↗';
    all.appendChild(link);
   });
   box.appendChild(all);
   saveRoute();
  }
  if(scroll)box.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function routeRequest(){
  const origin=originMode==='manual'?q('tripOrigin').value.trim():'';
  if(originMode==='manual'&&!origin){
   q('tripNote').textContent='Informe uma cidade ou escolha Minha localização atual.';
   q('tripOrigin').focus();return null;
  }
  const stops=selected.map(stopById).filter(Boolean);
  const fallback=routeSegmentsFor(stops,origin,APP_MAX_STOPS);
  if(fallback.error||fallback.unresolved.length){
   q('tripNote').textContent=fallback.error||'Há uma parada sem identificação exata ou com GPS distante. Confira o link original antes de navegar.';
   showGoogleLegs(fallback);return null;
  }
  if(originMode==='manual')safeStore('asphalt-boys-ultima-origem',origin);
  return {stops,origin,fallback};
 }
 function googleUrl(){
  const plan=routeRequest();if(!plan)return null;
  if(plan.stops.length>APP_MAX_STOPS){
   q('tripNote').textContent='Roteiro organizado automaticamente em '+plan.fallback.segments.length+' etapas. Abra uma etapa por vez e avance ao concluir.';
   showGoogleLegs(plan.fallback);
   return null;
  }
  // Tenta um URL único para o aplicativo Maps. O limite do navegador é menor.
  const complete=routeSegmentsFor(plan.stops,plan.origin,APP_MAX_STOPS);
  if(complete.error||complete.unresolved.length||complete.segments.length!==1){
   q('tripNote').textContent='O roteiro ficou longo para um único link. Use os trechos compatíveis abaixo.';
   showGoogleLegs(plan.fallback);
   return null;
  }
  q('tripRouteSegments').hidden=true;
  q('tripNote').textContent=plan.stops.length>4
   ?'Confira as '+plan.stops.length+' paradas no Maps. Se alguma sumir, volte e toque em Abrir por trechos.'
   :'Confira todas as paradas no Google Maps antes de iniciar.';
  return complete.segments[0].url;
 }
 function share(){
  const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('dest',destination.id);
  if(presetId)u.searchParams.set('rota',presetId);
  else if(selected.length)u.searchParams.set('stops',selected.join(','));
  const origin=originMode==='manual'?q('tripOrigin').value.trim():'';if(origin)u.searchParams.set('origem',origin.slice(0,100));
  if(localPreview)u.searchParams.set('preview','local');
  const url=u.href;q('tripShareLink').value=url;q('tripShareBox').hidden=false;
  const msg='🏍️ Roteiro Asphalt Boys — '+destination.nome+'\nOrigem: '+(origin||'localização de cada participante')+'\nParadas: '+(selected.map(id=>stopById(id)?.nome||id).join(' → ')||'rota direta')+'\n'+url;
  q('tripShareWhats').href='https://api.whatsapp.com/send?text='+encodeURIComponent(msg);
  q('tripNote').textContent=localPreview?'Link de teste: rascunhos locais só aparecem neste navegador. Para compartilhar com outros, publique a rota no banco.':'Envie o link para o motogrupo. Cada pessoa poderá usar a própria localização.';
 }
 async function fetchPublic(){
  try{
   if(localPreview){
    const x=JSON.parse(safeRead('asphalt-boys-admin-drafts-v1')||'null');
    if(!mergeData(x))throw Error('Rascunhos locais indisponíveis.');
    q('tripDataStatus').textContent='Prévia de rascunhos deste navegador — ainda não publicados.';
   }else{
    const r=await fetch('/api/content',{cache:'no-store'});if(!r.ok)throw Error('Banco público ainda não configurado.');
    if(!mergeData(await r.json()))throw Error('Dados públicos incompletos.');
    q('tripDataStatus').textContent='Paradas e rotas publicadas pelo Asphalt Boys.';
   }
   for(const p of data.destinos){
    let existing=lugares.find(l=>mapping(l.id)===p.id);
    if(existing){if(p.nome)existing.nome=p.nome;
     if(p.descricao&&!(p.id==='guaramiranga'&&/^(pico de montanha|atração turística)$/i.test(p.descricao.trim())))
       existing.sub=p.descricao;
     if(httpsUrl(p.foto)){existing.img=p.foto;existing.cover=p.foto}
     if(p.id==='guaramiranga'){existing.nome='Guaramiranga';existing.dest='Guaramiranga, CE'}
     else if(p.id==='canoa-quebrada'){existing.nome='Canoa Quebrada';existing.dest='Canoa Quebrada, Aracati, CE'}
     else if(p.mapa)existing.dest=p.mapa;
     if(p.fotoLicenca){existing.fotoAutor=p.fotoAutor;existing.fotoLicenca=p.fotoLicenca;existing.fotoLicencaUrl=p.fotoLicencaUrl;existing.fotoFonteUrl=p.fotoFonteUrl}}
    else lugares.push({id:p.id,nome:p.nome,sub:p.descricao||'Explore este destino',img:httpsUrl(p.foto)||'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80',note:'Destino do grupo',dest:p.mapa||p.nome,fotoAutor:p.fotoAutor,fotoLicenca:p.fotoLicenca,fotoLicencaUrl:p.fotoLicencaUrl,fotoFonteUrl:p.fotoFonteUrl});
   }
   if(typeof renderAsphaltCards==='function')renderAsphaltCards();
   loaded=true;
  }catch(e){q('tripDataStatus').textContent='Exibindo paradas iniciais. Rotas novas aparecerão quando o banco for configurado.'}
 }
 // Busca o conteúdo de IA somente com interação explícita do visitante.
 q('tripReviewDetails').addEventListener('toggle',async()=>{
   const details=q('tripReviewDetails'),id=previewId,epoch=reviewRequestEpoch;
   if(!details.open||details.hidden||!id||details.dataset.loading===id||details.dataset.loaded===id)return;
   details.dataset.loading=id;
   q('tripReviewStatus').hidden=false;
   q('tripReviewStatus').textContent='Consultando resumo das avaliações…';
   try{
     const response=await fetch('/api/reviews?stop='+encodeURIComponent(id),{cache:'no-store'});
     const result=await response.json();
     if(previewId!==id||epoch!==reviewRequestEpoch||!details.open)return;
     details.dataset.loaded=id;
     const summary=typeof result.summary==='string'?result.summary:'';
     if(response.ok&&result.available&&summary){
       q('tripReviewText').textContent=summary; // Nunca cortar ou modificar o texto da API.
       q('tripReviewDisclosure').textContent=result.disclosure||'';
       q('tripReviewSee').href=httpsUrl(result.reviewsUrl)||q('tripPreviewMap').href;
       const flag=httpsUrl(result.flagUrl);
       q('tripReviewFlag').hidden=!flag;
       if(flag)q('tripReviewFlag').href=flag;
       q('tripReviewResult').hidden=false;
       q('tripReviewFallback').hidden=true;
       q('tripReviewStatus').hidden=true;
     }else{
       q('tripReviewResult').hidden=true;
       q('tripReviewStatus').textContent=String(result.message||'Resumo não disponível para esta parada.');
       q('tripReviewFallback').hidden=false;
       q('tripReviewFallback').href=q('tripPreviewMap').href;
     }
   }catch{
     if(previewId===id&&epoch===reviewRequestEpoch&&details.open){
       q('tripReviewStatus').textContent='Não foi possível consultar o resumo agora.';
       q('tripReviewFallback').hidden=false;
       q('tripReviewFallback').href=q('tripPreviewMap').href;
     }
   }finally{
     if(details.dataset.loading===id)details.dataset.loading='';
   }
 });
 q('tripClose').onclick=close;q('tripPreviewBack').onclick=previewBack;
 q('tripPreviewAdd').onclick=()=>{addStop(previewId);previewBack();showTab('mine')};
 q('tripModal').addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){if(!q('tripStopPreview').hidden)previewBack();else close()}if(e.key==='Tab'){const visible=[...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')].filter(x=>x.offsetParent!==null);if(!visible.length)return;const f=visible[0],l=visible[visible.length-1];if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}}});
 q('tripOriginChoices').addEventListener('click',e=>{const button=e.target.closest('[data-origin-mode]');if(!button)return;setOriginMode(button.dataset.originMode);activeLegIndex=0;saveRoute();if(originMode==='manual')q('tripOrigin').focus()});
 q('tripOrigin').addEventListener('input',()=>{if(destination&&originMode==='manual')q('tripRouteSummary').textContent=routeSummaryText();activeLegIndex=0;saveRoute()});
 q('tripTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab,true)});
 q('tripCategories').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b){category=b.dataset.cat;q('tripSearch').value=categorySearches[category]||'';renderAvailable()}});
 q('tripSearch').addEventListener('input',e=>{categorySearches[category]=e.target.value;renderAvailable()});
 q('tripSearchClear').addEventListener('click',()=>{categorySearches[category]='';q('tripSearch').value='';renderAvailable();q('tripSearch').focus()});
 q('tripAvailable').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preview)preview(b.dataset.preview);else if(b.dataset.addStop)addStop(b.dataset.addStop)});
 q('tripPresets').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.viewRoute){const li=document.getElementById('tripRoute-'+b.dataset.viewRoute);if(li)li.hidden=!li.hidden}
  if(b.dataset.useRoute){const r=currentRoutes().find(x=>x.id===b.dataset.useRoute);if(!r)return;
   selected=[...new Set((r.paradas||[]).filter(id=>stopById(id)?.endereco))].slice(0,MAX_ROUTE_STOPS);presetId=r.id;activeLegIndex=0;render();showTab('mine')}
 });
 q('tripChosen').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;let i;
  if(b.dataset.up!==undefined){i=+b.dataset.up;if(i>0)[selected[i-1],selected[i]]=[selected[i],selected[i-1]]}
  else if(b.dataset.down!==undefined){i=+b.dataset.down;if(i<selected.length-1)[selected[i],selected[i+1]]=[selected[i+1],selected[i]]}
  else if(b.dataset.remove!==undefined)selected.splice(+b.dataset.remove,1);
  presetId='';activeLegIndex=0;render();showTab('mine');
 });
 q('tripOpenMaps').onclick=()=>{const u=googleUrl();if(u)window.open(u,'_blank','noopener,noreferrer')};
 q('tripOpenWaze').onclick=()=>{window.open('https://www.waze.com/ul?q='+encodeURIComponent(destinationUrl())+'&navigate=yes','_blank','noopener,noreferrer');q('tripNote').textContent='O Waze abre somente o destino. Paradas intermediárias devem ser configuradas no aplicativo.'};
 q('tripShare').onclick=share;
 q('tripCopy').onclick=async()=>{const input=q('tripShareLink');try{await navigator.clipboard.writeText(input.value);q('tripNote').textContent='Link copiado!'}catch{input.focus();input.select();q('tripNote').textContent='Selecione o link e copie manualmente.'}};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();open(b.dataset.pick)},true);
 (async()=>{
  await fetchPublic();
  const id=urlParams.get('dest');
  if(id){open(id,{origin:urlParams.get('origem')||'',route:urlParams.get('rota'),stops:urlParams.get('stops')})}
  else {const wasOpen=readOpen();if(wasOpen)open(wasOpen)}
 })();
})();