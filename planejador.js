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
  const MAX_TRIP_DAYS=365;
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
 let originMode='gps',originPoint=null,originRequestEpoch=0,activeLegIndex=0,tripDays=[],activeDayId='';
  const expandedDayIds=new Set();
 let data={destinos:[],paradas:[],rotas:[]},loaded=false,destination=null,tab='custom',category='turismo',selected=[],presetId='',previewId='',focusBefore=null,stopPhotoObserver=null,previewReturnScroll=0;
 const urlParams=new URLSearchParams(location.search);
 const localPreview=urlParams.get('preview')==='local';
 function safeStore(k,v){try{localStorage.setItem(k,v)}catch{}}
 function safeRead(k){try{return localStorage.getItem(k)}catch{return null}}

 const OPEN_MODAL_KEY='asphalt-boys-rota-aberta-v1';
 const draftKey=id=>'asphalt-boys-roteiro-v1-'+(localPreview?'preview-':'')+mapping(id);
 const dayTitle=(s,idx)=>typeof s==='string'&&s.trim()?s.trim().slice(0,55):'Dia '+(idx+1);
 const validDayStops=items=>Array.isArray(items)?
  [...new Set(items.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{3,120}$/.test(id)&&stopById(id)))].slice(0,MAX_ROUTE_STOPS):[];
 function beginSingleDay(stops=[],legIndex=0){
  tripDays=[{id:'dia-1',title:'Dia 1',stops:validDayStops(stops),legIndex:legIndex||0}];
  activeDayId='dia-1';selected=[...tripDays[0].stops];activeLegIndex=tripDays[0].legIndex;
 }
 function currentDay(){return tripDays.find(d=>d.id===activeDayId)||null}
 function syncCurrentDay(){
  const d=currentDay();
  if(d){d.stops=[...selected];d.legIndex=activeLegIndex;}
 }
 function initializeSharedDays(raw){
  let parsed;
  try{parsed=JSON.parse(String(raw||''))}catch{return false}
  if(!Array.isArray(parsed)||!parsed.length||parsed.length>MAX_TRIP_DAYS)return false;
  const restored=parsed.map((item,i)=>{
   if(!Array.isArray(item)||item.length!==2||!Array.isArray(item[1])||item[1].length>MAX_ROUTE_STOPS)return null;
   if(item[1].some(id=>!stopById(id)))return null;
   return {id:'dia-'+(i+1),title:dayTitle(item[0],i),stops:validDayStops(item[1]),legIndex:0};
  });
  if(restored.some(x=>!x))return false;
  tripDays=restored;activeDayId=tripDays[tripDays.length-1].id;
  selected=[...currentDay().stops];activeLegIndex=0;
  expandedDayIds.clear();
  return true;
 }
 function saveRoute(){
  if(!destination)return;
  syncCurrentDay();
  safeStore(draftKey(destination.id),JSON.stringify({
   v:2,stops:[...selected],days:tripDays.map(d=>({
    id:d.id,title:d.title,stops:d.stops,legIndex:d.legIndex||0
   })),activeDayId,originMode,origin:q('tripOrigin').value.trim().slice(0,1800),originPoint:originPoint&&originPoint.input===q('tripOrigin').value.trim()?originPoint:null,
   presetId,tab,category,legIndex:activeLegIndex
  }));
 }
 function restoreRoute(){
  if(!destination)return false;
  let saved;try{saved=JSON.parse(safeRead(draftKey(destination.id))||'null')}catch{return false}
  if(!saved||![1,2].includes(saved.v)||!Array.isArray(saved.stops))return false;
  const oldStops=validDayStops(saved.stops);
  const restored=Array.isArray(saved.days)&&saved.days.length&&saved.days.length<=MAX_TRIP_DAYS
   ?saved.days.map((d,i)=>{
    const id=typeof d.id==='string'&&/^[a-zA-Z0-9_-]{3,120}$/.test(d.id)?d.id:'dia-'+(i+1);
    return {id,title:dayTitle(d.title,i),stops:validDayStops(d.stops),
     legIndex:Number.isInteger(d.legIndex)&&d.legIndex>=0&&d.legIndex<MAX_ROUTE_STOPS?d.legIndex:0};
   }):null;
  if(restored&&new Set(restored.map(d=>d.id)).size===restored.length){
   tripDays=restored;activeDayId=tripDays.some(d=>d.id===saved.activeDayId)?saved.activeDayId:tripDays.at(-1).id;
   selected=[...currentDay().stops];activeLegIndex=currentDay().legIndex;
  }else{
   beginSingleDay(oldStops,Number.isInteger(saved.legIndex)?saved.legIndex:0);
  }
  presetId=typeof saved.presetId==='string'&&currentRoutes().some(r=>r.id===saved.presetId)?saved.presetId:'';
  category=categories.some(([id])=>id===saved.category)?saved.category:category;
  // Restaurar somente pontos fixos previamente confirmados.
  // Cidades antigas não verificadas não são preenchidas automaticamente.
  const confirmed=normalizedOriginPoint(saved.originPoint,typeof saved.origin==='string'?saved.origin.trim():'');
  originPoint=confirmed;
  q('tripOrigin').value=confirmed?confirmed.input:'';
  renderOriginPoint();
  setOriginMode(confirmed&&saved.originMode==='manual'?'manual':'gps');
  tab=tripDays.length>1||selected.length?'mine':['mine','custom','preset'].includes(saved.tab)?saved.tab:'custom';
  return true;
 }
 function rememberOpen(id){try{sessionStorage.setItem(OPEN_MODAL_KEY,id)}catch{}}
 function forgetOpen(){try{sessionStorage.removeItem(OPEN_MODAL_KEY)}catch{}}
 function readOpen(){try{return sessionStorage.getItem(OPEN_MODAL_KEY)||''}catch{return ''}}
 function originMapURL(raw){
  try{
   const u=new URL(String(raw||''));
   const host=u.hostname.toLowerCase();
   if(u.protocol==='https:'&&(host==='google.com'||host.endsWith('.google.com')||
     host==='google.com.br'||host.endsWith('.google.com.br')||host==='maps.app.goo.gl'))
     return u.href;
  }catch{}
  return '';
 }
 function normalizedOriginPoint(raw,expected){
  if(!raw||typeof raw!=='object')return null;
  const input=String(raw.input||'').trim(),coordinate=validCoords(raw.coordinate);
  if(!coordinate||input!==String(expected||'').trim()||!input)return null;
  return {input,coordinate,name:String(raw.name||'Ponto de saída').slice(0,120),
   address:String(raw.address||'').slice(0,350),
   maps:originMapURL(raw.maps)||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coordinate)};
 }
 function originValue(){
  if(originMode!=='manual')return '';
  const typed=q('tripOrigin').value.trim();
  if(originPoint&&originPoint.input===typed)return originPoint.coordinate;
  if(/^https?:\/\//i.test(typed))return ''; // links exigem verificação antes de navegar
  return validCoords(typed)||typed; // origens por cidade já usadas continuam funcionando
 }
 function originLabel(){
  if(originMode==='gps')return 'Minha localização atual';
  const typed=q('tripOrigin').value.trim();
  return originPoint&&originPoint.input===typed?originPoint.name:typed||'Ponto de saída a definir';
 }
 function renderOriginPoint(){
  const confirmed=!!originPoint&&originPoint.input===q('tripOrigin').value.trim();
  q('tripOriginConfirmed').hidden=!confirmed;
  if(confirmed){
   q('tripOriginName').textContent=originPoint.name;
   q('tripOriginAddress').textContent=originPoint.address||originPoint.coordinate;
   q('tripOriginMap').href=originPoint.maps;
  }
 }
 function selectOriginPoint(item){
  const input=q('tripOrigin').value.trim();
  originPoint=normalizedOriginPoint({...item,input},input);
  if(!originPoint)return;
  q('tripOriginCandidates').replaceChildren();q('tripOriginCandidates').hidden=true;
  q('tripOriginStatus').textContent='✓ Ponto definido. Confira o marcador no Google Maps.';
  renderOriginPoint();activeLegIndex=0;saveRoute();
  if(destination)q('tripRouteSummary').textContent=routeSummaryText();
 }
 function showOriginOptions(items,input,notice){
  const box=q('tripOriginCandidates');box.replaceChildren();
  for(const item of Array.isArray(items)?items.slice(0,5):[]){
   const point=normalizedOriginPoint({...item,input},input);
   if(!point)continue;
   const card=document.createElement('div');card.className='tripOriginCandidate';
   const details=document.createElement('div');details.className='min-w-0 flex-1';
   const name=document.createElement('strong');name.textContent=point.name;
   const address=document.createElement('span');address.textContent=point.address||point.coordinate;
   details.append(name,address);
   const inspect=document.createElement('a');
   inspect.href=point.maps;inspect.target='_blank';inspect.rel='noopener noreferrer';
   inspect.className='tripStopCheck mt-2';inspect.textContent='📍 Ver no Maps ↗';
   details.appendChild(inspect);
   const choose=document.createElement('button');choose.type='button';
   choose.className='tripNavBtn text-xs';choose.textContent='Usar este ponto';
   choose.onclick=()=>selectOriginPoint(point);
   card.append(details,choose);box.appendChild(card);
  }
  box.hidden=!box.childElementCount;
  q('tripOriginStatus').textContent=box.childElementCount?
   (notice||'Escolha o ponto correto e confira no Maps.'):
   'Nenhum ponto exato encontrado. Experimente outro endereço.';
 }
 async function checkOriginPoint(){
  const input=q('tripOrigin').value.trim();
  if(!input){q('tripOriginStatus').textContent='Informe um endereço, coordenadas ou link do Maps.';return}
  const epoch=++originRequestEpoch,button=q('tripOriginCheck');
  button.disabled=true;button.textContent='🔎 Procurando…';
  q('tripOriginStatus').textContent='Procurando o ponto no Google Maps…';
  q('tripOriginCandidates').hidden=true;
  try{
   const res=await fetch('./api/origin-point',{method:'POST',credentials:'same-origin',
    cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({input})});
   const data=await res.json();
   if(epoch!==originRequestEpoch||input!==q('tripOrigin').value.trim())return;
   if(!res.ok)throw Error(data.error||'Não encontrei esse local.');
   showOriginOptions(data.results,input,data.notice);
  }catch(error){
   if(epoch!==originRequestEpoch)return;
   q('tripOriginStatus').textContent='⚠️ '+String(error.message||error).slice(0,200);
  }finally{
   if(epoch===originRequestEpoch){
    button.disabled=false;button.textContent='📍 Conferir ponto no Maps';
   }
  }
 }
 function routeSummaryText(){
  const ending=selected.length?stopById(selected[selected.length-1])?.nome:destination?.nome;
  return originLabel()+' → '+(ending||'Destino');
 }
 function setOriginMode(mode){
  originMode=mode==='manual'?'manual':'gps';
  q('tripUseGps').setAttribute('aria-pressed',String(originMode==='gps'));
  q('tripUseManual').setAttribute('aria-pressed',String(originMode==='manual'));
  q('tripManualOrigin').hidden=originMode!=='manual';
  q('tripOriginHint').textContent=originMode==='gps'?'O Maps usa a localização do aparelho.':'';
  renderOriginPoint();
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
   q('tripSearchCount').textContent=term?(stops.length+' '+(stops.length===1?'local encontrado':'locais encontrados')):'';
   q('tripCategories').innerHTML=categories.map(([id,label])=>'<button type="button" class="tripCat" data-cat="'+id+'" aria-pressed="'+(category===id)+'">'+label+'</button>').join('');
   q('tripAvailable').innerHTML=stops.length?stops.map(p=>{
     const pic=httpsUrl(p.foto),dis=selected.includes(p.id),full=selected.length>=MAX_ROUTE_STOPS,loc=String(p.endereco||'').trim();
     const credits=p.fotoLicenca&&pic?'<details class="tripTiny mt-1"><summary class="cursor-pointer text-zinc-400" aria-label="Créditos da foto">ⓘ</summary><p class="mt-1">'+esc(p.fotoAutor||'Autor informado na fonte')+' · '+esc(p.fotoLicenca)+' · Foto adaptada'+
  (httpsUrl(p.fotoFonteUrl)?' · <a href="'+esc(httpsUrl(p.fotoFonteUrl))+'" target="_blank" rel="noopener noreferrer" class="underline">Original</a>':'')+
  (httpsUrl(p.fotoLicencaUrl)?' · <a href="'+esc(httpsUrl(p.fotoLicencaUrl))+'" target="_blank" rel="noopener noreferrer" class="underline">Licença</a>':'')+
  '</p></details>':'';
     return '<article class="tripStop" data-selected="'+dis+'">'+(pic?'<img loading="lazy" src="'+esc(pic)+'" alt="Imagem de '+esc(p.nome)+'">':'<div class="tripGooglePhotoHolder" data-google-public-stop="'+esc(p.id)+'"><div class="tripFallback">📍</div><span class="tripTiny block mt-1" data-google-public-credit></span></div>')+'<div class="min-w-0"><p class="font-semibold text-sm">'+esc(p.nome)+'</p>'+(p.descricao?'<p class="tripTiny tripStopDescription mt-1">'+esc(p.descricao)+'</p>':'')+credits+'<div class="flex flex-wrap gap-2 mt-2"><button type="button" class="tripNavBtn text-xs" data-preview="'+esc(p.id)+'">👁 Prévia</button><button type="button" class="tripNavBtn text-xs text-orange-300" data-add-stop="'+esc(p.id)+'" aria-pressed="'+dis+'" '+(dis||full||!loc?'disabled':'')+'>'+(dis?'✓ Adicionada':!loc?'Sem endereço':full?'Limite de 20 paradas':'+ Adicionar')+'</button></div></div></article>';
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
    return '<article class="tripPresetCard"><h4 class="font-bold">'+esc(r.nome)+'</h4>'+(r.descricao?'<p class="tripTiny mt-1">'+esc(r.descricao)+'</p>':'')+'<p class="tripTiny mt-2">'+stops.length+' paradas</p><div class="flex flex-wrap gap-2 mt-3"><button type="button" class="tripNavBtn" data-view-route="'+esc(r.id)+'">👁 Ver paradas</button><button type="button" class="tripBtn text-sm" data-use-route="'+esc(r.id)+'">Usar esta rota</button></div><ol class="tripPresetStops" id="tripRoute-'+esc(r.id)+'" hidden>'+stops.map(name=>'<li>'+esc(name)+'</li>').join('')+'</ol></article>';
  }).join(''):'<p class="tripTiny rounded-xl border border-dashed border-zinc-600 p-5">Ainda não há rotas prontas publicadas para este destino. Você pode montar a sua rota na primeira aba.</p>';
 }
 function renderDayGroups(){
   syncCurrentDay();
   const box=q('tripDayGroups'),editor=q('tripDayEditor'),active=currentDay();
   box.hidden=false;
   editor.hidden=false;
   const total=tripDays.reduce((sum,d)=>sum+d.stops.length,0);
   q('tripActiveDayName').textContent=active?'✎ Editando: '+active.title:'Escolha um dia';
   q('tripCreateDay').disabled=tripDays.length>=MAX_TRIP_DAYS;
   q('tripCreateDay').textContent='＋ Novo dia';
   box.innerHTML=tripDays.map((d,index)=>{
    const id=esc(d.id),activeNow=d.id===activeDayId;
    const expanded=expandedDayIds.has(d.id);
    const count=d.stops.length+' parada'+(d.stops.length===1?'':'s');
    const names=d.stops.map(stop=>stopById(stop)?.nome||'Parada indisponível');
    return '<article class="tripDayCard" data-day-card="'+id+'" data-active="'+activeNow+'">'+
      '<div class="tripDayHeader">'+
       '<button type="button" class="tripDayExpand" data-day-select="'+id+'" aria-expanded="'+expanded+'" aria-current="'+(activeNow?'true':'false')+'">'+
        '<span class="tripDayTitle">'+(expanded?'▾ ':'▸ ')+esc(d.title)+'</span>'+
        '<span class="tripDaySub">Dia '+(index+1)+' · '+count+(activeNow?' · Selecionado':'')+'</span></button>'+
       '<button type="button" class="tripNavBtn tripDayMaps text-xs" data-day-route="'+id+'" '+(!names.length?'disabled title="Adicione paradas para abrir o Maps"':'')+'>🗺️ Maps</button>'+
       '<button type="button" class="tripNavBtn text-xs" data-day-rename="'+id+'" aria-label="Renomear '+esc(d.title)+'">✎</button>'+
       '<button type="button" class="tripNavBtn tripDayTrash text-xs" data-day-delete="'+id+'" aria-label="Excluir '+esc(d.title)+'">×</button>'+
      '</div>'+
      '<div class="tripDayRename" data-day-rename-box="'+id+'" hidden>'+
       '<input class="tripField" data-day-title="'+id+'" type="text" maxlength="55" value="'+esc(d.title)+'" aria-label="Novo nome do dia">'+
       '<button type="button" class="tripNavBtn" data-day-save="'+id+'">Salvar</button>'+
       '<button type="button" class="tripNavBtn" data-day-cancel="'+id+'">Cancelar</button>'+
      '</div>'+
      '<div class="tripDayBody" data-day-content="'+id+'" '+(expanded?'':'hidden')+'>'+
       (names.length?'<ol class="tripDayList">'+names.map(name=>'<li>'+esc(name)+'</li>').join('')+'</ol>':
         '<p class="tripTiny mb-3">Nenhuma parada adicionada.</p>')+
       '<button type="button" class="tripNavBtn tripDayEdit text-xs" data-day-edit="'+id+'">'+
        (activeNow?'+ Adicionar ou editar paradas':'✎ Selecionar e editar paradas')+'</button>'+
      '</div>'+
      '<div data-day-map-output="'+id+'" hidden class="mt-3 rounded-xl border border-orange-500/35 bg-[#242831] p-3" role="region" aria-label="Navegação de '+esc(d.title)+'"></div>'+
     '</article>';
   }).join('');
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
  syncCurrentDay();
   const totalStops=tripDays.reduce((sum,d)=>sum+d.stops.length,0);
   q('tripCount').textContent=tripDays.length>1?
    tripDays.length+' dias · '+totalStops+' paradas':
    selected.length+' parada'+(selected.length===1?'':'s');
  q('tripRouteSummary').textContent=selected.length?routeSummaryText():'';
  q('tripOpenMaps').disabled=!selected.length||selected.length>MAX_ROUTE_STOPS;
  const tentative=selected.length?routeSegmentsFor(selected.map(stopById).filter(Boolean),'',APP_MAX_STOPS):null;
  const stageCount=tentative&&!tentative.error&&!tentative.unresolved.length?
   tentative.segments.length:Math.ceil(selected.length/APP_MAX_STOPS);
  
  q('tripOpenMaps').textContent=stageCount>1
   ?'🧭 Ver '+stageCount+' etapas da viagem'
   :'🗺️ Abrir rota no Maps'+(selected.length?' ('+selected.length+' paradas)':'');
  const suspicious=selected.map(stopById).filter(p=>suspectStop(p));
   q('tripMapsHelp').textContent=suspicious.length
    ?'⚠️ Confira a localização de '+suspicious.map(p=>p.nome).join(', ')+' antes de navegar. O cadastro pode causar um desvio.'
    :'';
  q('tripRouteSegments').hidden=true;
  q('tripRouteSegments').replaceChildren();
  saveRoute();
 }
 function render(){
   if(!destination)return;
   const offset=panel.scrollTop;
   renderAvailable();renderPresets();renderChosen();renderDayGroups();showTab(tab);
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
   selected=[];presetId='';activeLegIndex=0;expandedDayIds.clear();beginSingleDay();
   q('tripTitle').textContent=destination.nome;
   q('tripDesc').textContent=destination.sub||'Planeje seu trajeto e descubra novas paradas.';
   const img=q('tripCover');img.onerror=()=>{img.onerror=null;if(destination.fallbackImg)img.src=destination.fallbackImg;else img.style.display='none'};img.style.display='block';img.src=destination.cover||destination.img||'';img.alt='Imagem de '+destination.nome;
   q('tripOrigin').value=share&&share.origin?String(share.origin).slice(0,1800):'';
  originPoint=null;originRequestEpoch++;
  q('tripOriginCheck').disabled=false;
  q('tripOriginCheck').textContent='📍 Conferir ponto no Maps';
  q('tripOriginStatus').textContent='';
  q('tripOriginCandidates').replaceChildren();q('tripOriginCandidates').hidden=true;
  if(share&&share.origin&&validCoords(share.origin)){
   originPoint=normalizedOriginPoint({
    input:share.origin,coordinate:share.origin,
    name:share.originName||'Ponto de saída fixo',address:share.origin
   },share.origin);
  }
  renderOriginPoint();
  setOriginMode(share&&share.origin?'manual':'gps');
   if(!(share&&(share.route||share.stops||share.origin||share.days)))restoreRoute();
   if(share&&share.route){const r=currentRoutes().find(x=>x.id===share.route);if(r){selected=(r.paradas||[]).filter(id=>stopById(id)).slice(0,MAX_ROUTE_STOPS);presetId=r.id;tab='mine'}}
   else if(share&&share.days){
     if(initializeSharedDays(share.days))tab='mine';
     else q('tripNote').textContent='Não foi possível abrir os dias do link compartilhado.';
    }
    else if(share&&share.stops){selected=validDayStops(share.stops.split(','));if(selected.length)tab='mine'}
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
  // Usar o GPS oficial somente depois de confirmado no painel pelo Google Places.
  // Nos demais casos, o Place ID prevalece sobre GPS históricos da câmera.
  if(gps&&stop.mapCoordinatesSource==='google-places')return {type:'gps',value:gps,name};
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
   // Manter ate nove locais por etapa. Antes da navegacao, os Place IDs
   // serao resolvidos para GPS oficial pela API de verificacao.
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
 function showGoogleLegs(result,scroll=true,dayId=''){
  const day=dayId?tripDays.find(d=>d.id===dayId):null;
  const box=dayId?document.querySelector('[data-day-map-output="'+dayId+'"]'):q('tripRouteSegments');
  if(!box||dayId&&!day)return;
  const count=day?day.stops.length:selected.length;
  box.replaceChildren();box.hidden=false;
  const heading=document.createElement('p');heading.className='tripTiny font-bold mb-2';
  heading.textContent=result.error||(
   result.unresolved?.length?'Alguns locais ainda precisam de localização exata. Confira seus links originais:':
   'Roteiro preparado em '+result.segments.length+' etapas.');
  if(result.error||result.unresolved?.length)box.appendChild(heading);
  if(Array.isArray(result.warnings)&&result.warnings.length){
   const warning=document.createElement('p');warning.className='tripStopWarning mb-3';
   warning.textContent='⚠️ '+result.warnings.join(' · ')+' Confira os pontos no Maps antes de navegar.';
   box.appendChild(warning);
  }
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
   const index=Math.min(Math.max(0,day?day.legIndex||0:activeLegIndex),total-1);
   if(day){day.legIndex=index;if(day.id===activeDayId)activeLegIndex=index}
   else activeLegIndex=index;
   const current=result.segments[index];
   const status=document.createElement('p');status.className='tripLegStatus';
   status.textContent=total===1?count+' parada'+(count===1?'':'s'):
    'ETAPA '+(index+1)+' DE '+total+' · Paradas '+current.firstStop+'–'+current.lastStop+' de '+count;
   box.appendChild(status);
   const route=document.createElement('p');route.className='tripLegDescription';
   route.textContent=current.from+' → '+current.to;
   box.appendChild(route);
   const main=document.createElement('a');main.className='tripBtn tripLegStart';
   main.href=current.url;main.target='_blank';main.rel='noopener noreferrer';
   main.textContent=total===1?'🗺️ Abrir rota no Maps ↗':'🗺️ Abrir etapa '+(index+1)+' no Maps ↗';
   box.appendChild(main);
   const note=document.createElement('p');note.className='tripTiny mt-2';
   note.textContent=index<total-1?'Ao terminar, volte aqui para avançar à próxima etapa.':
    'Última etapa. Confira os pontos antes de navegar.';
   box.appendChild(note);
   const controls=document.createElement('div');controls.className='tripLegControls';
   const move=(next)=>{
    if(day){day.legIndex=next;if(day.id===activeDayId)activeLegIndex=next}
    else activeLegIndex=next;
    saveRoute();showGoogleLegs(result,false,dayId);
   };
   if(index>0){
    const prev=document.createElement('button');prev.type='button';prev.className='tripNavBtn';
    prev.textContent='← Etapa anterior';prev.onclick=()=>move(index-1);
    controls.appendChild(prev);
   }
   if(index<total-1){
    const next=document.createElement('button');next.type='button';next.className='tripNavBtn tripLegNext';
    next.textContent='Já concluí → Próxima etapa '+(index+2)+'/'+total;
    next.onclick=()=>move(index+1);
    controls.appendChild(next);
   }
   box.appendChild(controls);
   if(total>1){
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
   }
   saveRoute();
  }
  if(scroll)box.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function routeRequest(){
  const origin=originValue();
  if(originMode==='manual'&&!origin){
   q('tripNote').textContent='Confira o ponto de saída fixo ou escolha Minha localização atual.';
   q('tripOrigin').focus();return null;
  }
  // A API pode resolver endereços longos para GPS oficial. Não bloquear
  // a rota antes dessa tentativa apenas pelo tamanho do link provisório.
  const stops=selected.map(stopById).filter(Boolean);
  if(stops.length>MAX_ROUTE_STOPS){
   q('tripNote').textContent='Escolha no máximo 20 paradas.';
   return null;
  }
  return {stops,origin};
 }
 async function preparePreciseStops(stops){
  if(localPreview||!stops.length)return {stops,warnings:localPreview?
   ['Modo de rascunho: confira os pontos antes de navegar.']:[]};
  try{
   const res=await fetch('./api/route-points',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ids:stops.map(p=>p.id)})
   });
   const payload=await res.json();
   if(!res.ok||!Array.isArray(payload.positions))
    throw Error(payload.error||'Verificação indisponível.');
   const byId=new Map(payload.positions.map(p=>[p.id,p]));
   const warnings=[],updated=stops.map(stop=>{
    const point=byId.get(stop.id);
    if(!point||point.missing){
     warnings.push('Local não encontrado no banco: '+stop.nome);
     return stop;
    }
    const gps=validCoords(point.coordinate);
    if(gps&&point.source==='google-places')
     return {...stop,mapCoordinates:gps,mapCoordinatesSource:'google-places'};
    warnings.push('Local sem confirmação exata: '+stop.nome);
    // O cadastro original continua disponível para conferência manual.
    return stop;
   });
   return {stops:updated,warnings};
  }catch{
   return {stops,warnings:['Não foi possível conferir os pontos com o Google Places agora.']};
  }
 }
 async function prepareGoogleRoute(dayId=''){
  const day=dayId?tripDays.find(d=>d.id===dayId):null;
  if(dayId&&!day)return;
  let plan;
  if(day){
   const origin=originValue();
   if(originMode==='manual'&&!origin){
    q('tripNote').textContent='Confira o ponto de saída fixo ou escolha Minha localização atual.';
    q('tripOrigin').focus();return;
   }
   plan={stops:day.stops.map(stopById).filter(Boolean),origin};
  }else plan=routeRequest();
  if(!plan||!plan.stops.length)return;
  const button=day?document.querySelector('[data-day-route="'+dayId+'"]'):q('tripOpenMaps');
  if(!button||button.disabled)return;
  const oldLabel=button.textContent,plannedIds=plan.stops.map(p=>p.id).join(',');
  button.disabled=true;button.textContent='📍 Conferindo…';
  q('tripNote').textContent='Verificando a localização de cada ponto antes de montar o roteiro.';
  try{
   const prepared=await preparePreciseStops(plan.stops);
   const now=day?tripDays.find(d=>d.id===dayId)?.stops.join(','):selected.join(',');
   if(now!==plannedIds||!destination)return;
   const result=routeSegmentsFor(prepared.stops,plan.origin,APP_MAX_STOPS);
   result.warnings=prepared.warnings;
   q('tripNote').textContent=result.error||(
    result.unresolved.length?'Alguns locais precisam ser conferidos antes de navegar.':
    'Confira os pontos no Google Maps antes de sair.');
   showGoogleLegs(result,true,dayId);
  }finally{
   button.disabled=false;button.textContent=oldLabel;
  }
 }
 function share(){
  syncCurrentDay();
  const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('dest',destination.id);
  if(tripDays.length>1){
   const serialized=tripDays.map(d=>[d.title,d.stops]);
   u.searchParams.set('dias',JSON.stringify(serialized));
  }else if(presetId)u.searchParams.set('rota',presetId);
  else if(selected.length)u.searchParams.set('stops',selected.join(','));
  const origin=originValue();
  if(origin){
   u.searchParams.set('origem',origin.slice(0,150));
   if(originPoint&&originPoint.input===q('tripOrigin').value.trim())
    u.searchParams.set('origem_nome',originPoint.name);
  }
  if(localPreview)u.searchParams.set('preview','local');
  const url=u.href;q('tripShareLink').value=url;q('tripShareBox').hidden=false;
  // Compartilhamento compacto: as paradas e os dias completos ficam no link,
  // sem repetir essas informações na mensagem do WhatsApp.
  const msg='🏍️ Asphalt Boys'+
   '\n📍 Destino: '+destination.nome+
   (tripDays.length>1?'\n📅 Viagem de '+tripDays.length+' dias':'')+
   '\n🔗 Ver roteiro: '+url;
  q('tripShareWhats').href='https://api.whatsapp.com/send?text='+encodeURIComponent(msg);
  q('tripNote').textContent=localPreview?
   'Link de teste: paradas locais ainda não publicadas não aparecem para outros usuários.':
   'Link da viagem preparado. Cada pessoa poderá usar sua localização.';
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
    q('tripDataStatus').textContent='';
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
 // Os dias são rascunhos locais por destino. O dia ativo é a lista aberta no editor.
 function makeNextDay(){
   if(tripDays.length>=MAX_TRIP_DAYS){
    q('tripDayMessage').textContent='Este roteiro já chegou ao limite de segurança de dias.';
    return;
   }
   syncCurrentDay();
   const index=tripDays.length+1;
   let id;
   do{id='dia-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
   while(tripDays.some(d=>d.id===id));
   tripDays.push({id,title:'Dia '+index,stops:[],legIndex:0});
   activeDayId=id;selected=[];activeLegIndex=0;presetId='';tab='mine';
   expandedDayIds.clear();expandedDayIds.add(id);
   q('tripDayMessage').textContent='Dia '+index+' criado. Adicione as paradas ou renomeie o card.';
   render();
  }
  function editDay(id,addStops=false){
   const target=tripDays.find(d=>d.id===id);
   if(!target)return;
   if(target.id!==activeDayId){
    syncCurrentDay();
    activeDayId=id;selected=[...target.stops];activeLegIndex=target.legIndex||0;
    presetId='';
   }
   expandedDayIds.add(id);
   tab='mine';render();
   q('tripDayMessage').textContent='Dia selecionado: '+target.title+'.';
   if(addStops)showTab('custom',true);
  }
  function renameDay(id,value){
   const day=tripDays.find(d=>d.id===id),title=String(value||'').trim().slice(0,55);
   if(!day||!title){
    q('tripDayMessage').textContent='Escreva um nome para o dia antes de salvar.';
    return false;
   }
   day.title=title;saveRoute();renderDayGroups();
   q('tripDayMessage').textContent='✓ Nome salvo: '+title+'.';
   return true;
  }
  function removeDay(id){
   const index=tripDays.findIndex(d=>d.id===id);
   if(index<0)return;
   syncCurrentDay();
   const day=tripDays[index];
   const message=tripDays.length===1?
    'Limpar o último dia e suas '+day.stops.length+' paradas? O roteiro poderá ser montado novamente.':
    'Excluir "'+day.title+'" e suas '+day.stops.length+' paradas deste roteiro?';
   if(!window.confirm(message))return;
   if(tripDays.length===1){
    beginSingleDay();expandedDayIds.clear();
    q('tripDayMessage').textContent='Dia limpo. Você pode começar um novo roteiro.';
   }else{
    const wasActive=id===activeDayId;
    tripDays.splice(index,1);expandedDayIds.delete(id);
    if(wasActive){
     const next=tripDays[Math.min(index,tripDays.length-1)];
     activeDayId=next.id;selected=[...next.stops];activeLegIndex=next.legIndex||0;
     expandedDayIds.add(next.id);
    }
    q('tripDayMessage').textContent='Dia excluído. Os outros dias foram preservados.';
   }
   presetId='';tab='mine';render();
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
 q('tripOrigin').addEventListener('input',()=>{
   originRequestEpoch++;originPoint=null;
   q('tripOriginCheck').disabled=false;
   q('tripOriginCheck').textContent='📍 Conferir ponto no Maps';
   q('tripOriginCandidates').replaceChildren();q('tripOriginCandidates').hidden=true;
   q('tripOriginStatus').textContent=q('tripOrigin').value.trim()?'Toque em Conferir ponto para identificar o local.':'';
   renderOriginPoint();
   if(destination&&originMode==='manual')q('tripRouteSummary').textContent=routeSummaryText();
   activeLegIndex=0;saveRoute();
  });
  q('tripOriginCheck').onclick=checkOriginPoint;
  q('tripOriginClear').onclick=()=>{
   originPoint=null;originRequestEpoch++;
   q('tripOriginCheck').disabled=false;
   q('tripOriginCheck').textContent='📍 Conferir ponto no Maps';
   q('tripOriginCandidates').replaceChildren();q('tripOriginCandidates').hidden=true;
   q('tripOriginStatus').textContent='Altere o endereço e confira novamente.';
   renderOriginPoint();q('tripOrigin').focus();saveRoute();
  };
  q('tripOrigin').addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();checkOriginPoint()}
  });
 q('tripCreateDay').onclick=makeNextDay;
  q('tripAddDayStops').onclick=()=>{
   if(currentDay())showTab('custom',true);
  };
  q('tripDayGroups').addEventListener('click',e=>{
   const button=e.target.closest('button');if(!button)return;
   const d=button.dataset;
   if(d.daySelect){
    if(d.daySelect===activeDayId){
     if(expandedDayIds.has(d.daySelect))expandedDayIds.delete(d.daySelect);
     else expandedDayIds.add(d.daySelect);
     renderDayGroups();
    }else editDay(d.daySelect);
   }else if(d.dayRoute){
    prepareGoogleRoute(d.dayRoute).catch(()=>{
     q('tripDayMessage').textContent='Não foi possível preparar a rota deste dia. Tente novamente.';
    });
   }else if(d.dayRename){
    const box=button.closest('[data-day-card]')?.querySelector('[data-day-rename-box]');
    if(box){box.hidden=false;box.querySelector('input')?.focus()}
   }else if(d.dayCancel){
    const card=button.closest('[data-day-card]'),box=card?.querySelector('[data-day-rename-box]');
    const record=tripDays.find(x=>x.id===d.dayCancel);
    if(box){const field=box.querySelector('input');if(field&&record)field.value=record.title;box.hidden=true}
    q('tripDayMessage').textContent='';
   }else if(d.daySave){
    const input=button.closest('[data-day-card]')?.querySelector('[data-day-title]');
    if(input)renameDay(d.daySave,input.value);
   }else if(d.dayEdit)editDay(d.dayEdit,true);
   else if(d.dayDelete)removeDay(d.dayDelete);
  });
  q('tripDayGroups').addEventListener('keydown',e=>{
   if(e.target.matches('[data-day-title]')&&e.key==='Enter'){
    e.preventDefault();e.target.closest('[data-day-card]')?.querySelector('[data-day-save]')?.click();
   }else if(e.target.matches('[data-day-title]')&&e.key==='Escape'){
    e.stopPropagation();e.target.closest('[data-day-card]')?.querySelector('[data-day-cancel]')?.click();
   }
  });
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
 q('tripOpenMaps').onclick=()=>{prepareGoogleRoute().catch(()=>{q('tripNote').textContent='Erro ao preparar a rota. Confira sua conexão e tente novamente.';q('tripOpenMaps').disabled=false})};
 q('tripOpenWaze').onclick=()=>{window.open('https://www.waze.com/ul?q='+encodeURIComponent(destinationUrl())+'&navigate=yes','_blank','noopener,noreferrer');q('tripNote').textContent='O Waze abre somente o destino. Paradas intermediárias devem ser configuradas no aplicativo.'};
 q('tripShare').onclick=share;
 q('tripCopy').onclick=async()=>{const input=q('tripShareLink');try{await navigator.clipboard.writeText(input.value);q('tripNote').textContent='Link copiado!'}catch{input.focus();input.select();q('tripNote').textContent='Selecione o link e copie manualmente.'}};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();open(b.dataset.pick)},true);
 (async()=>{
  await fetchPublic();
  const id=urlParams.get('dest');
  if(id){open(id,{origin:urlParams.get('origem')||'',originName:urlParams.get('origem_nome')||'',route:urlParams.get('rota'),stops:urlParams.get('stops'),days:urlParams.get('dias')})}
  else {const wasOpen=readOpen();if(wasOpen)open(wasOpen)}
 })();
})();