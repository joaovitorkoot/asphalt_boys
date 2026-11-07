/* Asphalt Boys • planejador público sem dependências e sem chave de Google.
   Dados publicados via Cloudflare Pages Function /api/content, quando D1 estiver configurado. */
(function(){
 'use strict';
 const modal=document.getElementById('tripModal'),panel=document.getElementById('tripPanel');
 if(!modal||!panel)return;
 const q=id=>document.getElementById(id);
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const httpsUrl=s=>{try{let u=new URL(String(s||''));return u.protocol==='https:'?u.href:''}catch{return ''}};
 const mapLink=p=>httpsUrl(p.maps)||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(p.endereco||p.nome||''));
 const mapping=id=>id==='canoa'?'canoa-quebrada':id;
 const categories=[['cafe','☕ Café da manhã'],['almoco','🍽️ Almoço'],['turismo','📸 Pontos turísticos'],['descanso','🏍️ Descanso']];
 const normalize=c=>/café|cafe/i.test(c)?'cafe':/restaurante|almo/i.test(c)?'almoco':/descanso|posto/i.test(c)?'descanso':'turismo';
 const initial={guaramiranga:[{id:'pico-alto-parada',destinoId:'guaramiranga',nome:'Pico Alto',categoria:'turismo',descricao:'Vista panorâmica do Maciço de Baturité.',endereco:'Pico Alto, Guaramiranga, Ceará, Brasil',foto:'https://upload.wikimedia.org/wikipedia/commons/e/e2/Pico_Alto_-_Guaramiranga_-_Cear%C3%A1_03.jpg',fonteFoto:'Foto: Paulo Mouta · CC BY-SA 3.0',linkFoto:'https://commons.wikimedia.org/wiki/File:Pico_Alto_-_Guaramiranga_-_Cear%C3%A1_03.jpg'}]};
 let data={destinos:[],paradas:[],rotas:[]},loaded=false,destination=null,tab='custom',category='turismo',selected=[],presetId='',previewId='',focusBefore=null;
 const urlParams=new URLSearchParams(location.search);
 const localPreview=urlParams.get('preview')==='local';
 function safeStore(k,v){try{localStorage.setItem(k,v)}catch{}}
 function safeRead(k){try{return localStorage.getItem(k)}catch{return null}}
 function mergeData(a){if(!a||!['destinos','paradas','rotas'].every(k=>Array.isArray(a[k])))return false;data=a;return true}
 function currentStops(){
   if(!destination)return[];
   const destId=mapping(destination.id),stored=data.paradas.filter(p=>p.destinoId===destId);
   const seeds=initial[destId]||[];
   const combined=stored.map(p=>{const found=seeds.find(s=>s.id===p.id||s.nome.toLowerCase()===String(p.nome||'').toLowerCase());return found?Object.assign({},found,p,{foto:p.foto||found.foto,fonteFoto:p.fonteFoto||found.fonteFoto,linkFoto:p.linkFoto||found.linkFoto}):p});
   return combined.concat(seeds.filter(p=>!stored.some(x=>x.id===p.id||String(x.nome||'').toLowerCase()===p.nome.toLowerCase())));
 }
 function currentRoutes(){return destination?data.rotas.filter(r=>r.destinoId===mapping(destination.id)):[]}
 function stopById(id){return currentStops().find(p=>p.id===id)}
 function showTab(next){
   tab=next;for(const name of ['custom','preset','mine'])q('trip'+name.charAt(0).toUpperCase()+name.slice(1)+'Section').hidden=next!==name;
   document.querySelectorAll('#tripTabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===next)));
   q('tripShareBox').hidden=true;
   panel.scrollTop=0;
 }
 function renderAvailable(){
   const stops=currentStops().filter(p=>normalize(p.categoria)===category);
   q('tripCategories').innerHTML=categories.map(([id,label])=>'<button type="button" class="tripCat" data-cat="'+id+'" aria-pressed="'+(category===id)+'">'+label+'</button>').join('');
   q('tripAvailable').innerHTML=stops.length?stops.map(p=>{
     const pic=httpsUrl(p.foto),dis=selected.includes(p.id),full=selected.length>=3,loc=String(p.endereco||'').trim();
     return '<article class="tripStop">'+(pic?'<img loading="lazy" src="'+esc(pic)+'" alt="Imagem de '+esc(p.nome)+'">':'<div class="tripFallback">📍</div>')+'<div class="min-w-0"><p class="font-semibold text-sm">'+esc(p.nome)+'</p><p class="tripTiny">'+esc(categories.find(([id])=>id===normalize(p.categoria))[1])+'</p><p class="tripTiny mt-1">'+esc(p.descricao||'')+'</p><div class="flex flex-wrap gap-2 mt-2"><button type="button" class="tripNavBtn text-xs" data-preview="'+esc(p.id)+'">👁 Prévia</button><button type="button" class="tripNavBtn text-xs text-orange-300" data-add-stop="'+esc(p.id)+'" '+(dis||full||!loc?'disabled':'')+'>'+(dis?'✓ Adicionada':!loc?'Sem endereço':full?'Até 3 paradas':'+ Adicionar')+'</button></div></div></article>';
   }).join(''):'<p class="tripTiny rounded-xl border border-dashed border-zinc-600 p-5">Ainda não há paradas cadastradas nesta categoria. O administrador poderá adicioná-las pelo painel.</p>';
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
    const p=stops.find(s=>s.id===id);return '<div class="tripPicked"><span class="text-orange-400 font-bold">'+(i+1)+'.</span><span class="flex-1 text-sm font-semibold">'+esc(p?.nome||'Parada indisponível')+'</span><button type="button" class="tripNavBtn" data-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Mover parada para cima">↑</button><button type="button" class="tripNavBtn" data-down="'+i+'" '+(i===selected.length-1?'disabled':'')+' aria-label="Mover parada para baixo">↓</button><button type="button" class="tripNavBtn" data-remove="'+i+'" aria-label="Remover parada">×</button></div>';
  }).join(''):'<p class="tripTiny">Nenhuma parada selecionada. Você pode explorar as categorias ou escolher uma rota pronta.</p>';
  q('tripCount').textContent=selected.length+' parada'+(selected.length===1?'':'s');
  q('tripRouteSummary').textContent='Sua cidade → '+selected.length+' parada(s) → '+destination.nome;
  q('tripOpenMaps').disabled=selected.length>3||selected.some(id=>!stopById(id)?.endereco);
 }
 function render(){if(!destination)return;renderAvailable();renderPresets();renderChosen();showTab(tab);}
 function open(id,share){
   destination=typeof lugares!=='undefined'?lugares.find(l=>l.id===id):null;
   if(!destination)return false;
   focusBefore=document.activeElement;tab='custom';category='turismo';selected=[];presetId='';
   q('tripTitle').textContent=destination.nome;
   q('tripDesc').textContent=destination.sub||'Planeje seu trajeto e descubra novas paradas.';
   const img=q('tripCover');img.onerror=()=>{img.onerror=null;if(destination.fallbackImg)img.src=destination.fallbackImg;else img.style.display='none'};img.style.display='block';img.src=destination.cover||destination.img||'';img.alt='Imagem de '+destination.nome;
   q('tripOrigin').value=(share&&share.origin)||safeRead('asphalt-boys-ultima-origem')||'Horizonte, CE';
   if(share&&share.route){const r=currentRoutes().find(x=>x.id===share.route);if(r){selected=(r.paradas||[]).filter(id=>stopById(id)).slice(0,3);presetId=r.id;tab='mine'}}
   else if(share&&share.stops){selected=share.stops.split(',').filter(id=>/^[a-z0-9_-]{3,120}$/i.test(id)&&stopById(id)).slice(0,3);if(selected.length)tab='mine'}
   modal.hidden=false;q('tripStopPreview').hidden=true;q('tripMain').hidden=false;document.body.style.overflow='hidden';render();panel.scrollTop=0;panel.focus();return true;
 }
 function close(){modal.hidden=true;document.body.style.overflow='';if(focusBefore&&focusBefore.focus)focusBefore.focus()}
 function preview(id){
  const p=stopById(id);if(!p)return;previewId=id;
  q('tripMain').hidden=true;q('tripStopPreview').hidden=false;
  q('tripPreviewName').textContent=p.nome;q('tripPreviewCategory').textContent=categories.find(([id])=>id===normalize(p.categoria))[1];
  q('tripPreviewAddress').textContent=p.endereco||'Endereço ainda não cadastrado';
  q('tripPreviewDesc').textContent=p.descricao||'Sem descrição cadastrada.';
  q('tripPreviewHours').textContent=p.horario?'Horário informado pelo grupo: '+p.horario:'Horários: consulte o Google Maps.';
  const photo=httpsUrl(p.foto),im=q('tripPreviewPhoto');im.hidden=!photo;im.onerror=()=>{im.hidden=true;q('tripPreviewPlaceholder').hidden=false};q('tripPreviewPlaceholder').hidden=!!photo;if(photo){im.src=photo;im.alt='Fotografia de '+p.nome}
  q('tripPhotoCredit').hidden=!(p.linkFoto&&p.fonteFoto);if(p.linkFoto&&p.fonteFoto){q('tripPhotoCredit').textContent=p.fonteFoto;q('tripPhotoCredit').href=httpsUrl(p.linkFoto)||'#'}
  q('tripPreviewMap').href=mapLink(p);
  q('tripPreviewAdd').disabled=selected.includes(id)||selected.length>=3||!p.endereco;
  q('tripPreviewAdd').textContent=selected.includes(id)?'✓ Já está no roteiro':selected.length>=3?'Máximo de três paradas':'+ Adicionar ao roteiro';
  panel.scrollTop=0;q('tripPreviewBack').focus();
 }
 function previewBack(){q('tripStopPreview').hidden=true;q('tripMain').hidden=false;render();panel.scrollTop=0}
 function addStop(id){if(!stopById(id)?.endereco||selected.length>=3||selected.includes(id))return;selected.push(id);presetId='';render()}
 function destinationUrl(){return destination.dest||destination.mapa||destination.nome}
 function googleUrl(){
  const origin=q('tripOrigin').value.trim();if(!origin){q('tripNote').textContent='Informe sua cidade de origem.';q('tripOrigin').focus();return null}
  if(selected.length>3){q('tripNote').textContent='Divida o roteiro em trechos de até três paradas.';return null}
  const points=selected.map(id=>stopById(id)?.endereco).filter(Boolean);
  safeStore('asphalt-boys-ultima-origem',origin);
  return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(origin)+'&destination='+encodeURIComponent(destinationUrl())+'&travelmode=driving'+(points.length?'&waypoints='+encodeURIComponent(points.join('|')):'');
 }
 function share(){
  const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('dest',destination.id);
  if(presetId)u.searchParams.set('rota',presetId);
  else if(selected.length)u.searchParams.set('stops',selected.join(','));
  const origin=q('tripOrigin').value.trim();if(origin)u.searchParams.set('origem',origin.slice(0,100));
  if(localPreview)u.searchParams.set('preview','local');
  const url=u.href;q('tripShareLink').value=url;q('tripShareBox').hidden=false;
  const msg='🏍️ Roteiro Asphalt Boys — '+destination.nome+'\nOrigem: '+(origin||'a definir')+'\nParadas: '+(selected.map(id=>stopById(id)?.nome||id).join(' → ')||'rota direta')+'\n'+url;
  q('tripShareWhats').href='https://api.whatsapp.com/send?text='+encodeURIComponent(msg);
  q('tripNote').textContent=localPreview?'Link de teste: rascunhos locais só aparecem neste navegador. Para compartilhar com outros, publique a rota no banco.':'Envie o link para seu motogrupo. Cada pessoa pode ajustar a cidade de origem.';
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
    if(existing){if(p.descricao)existing.sub=p.descricao;if(httpsUrl(p.foto)){existing.img=p.foto;existing.cover=p.foto}if(p.mapa)existing.dest=p.mapa}
    else lugares.push({id:p.id,nome:p.nome,sub:p.descricao||'Explore este destino',img:httpsUrl(p.foto)||'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=80',note:'Destino do grupo',dest:p.mapa||p.nome});
   }
   if(typeof renderAsphaltCards==='function')renderAsphaltCards();
   loaded=true;
  }catch(e){q('tripDataStatus').textContent='Exibindo paradas iniciais. Rotas novas aparecerão quando o banco for configurado.'}
 }
 q('tripClose').onclick=close;q('tripPreviewBack').onclick=previewBack;
 q('tripPreviewAdd').onclick=()=>{addStop(previewId);previewBack();showTab('mine')};
 q('tripModal').addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){if(!q('tripStopPreview').hidden)previewBack();else close()}if(e.key==='Tab'){const visible=[...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')].filter(x=>x.offsetParent!==null);if(!visible.length)return;const f=visible[0],l=visible[visible.length-1];if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}}});
 q('tripTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
 q('tripCategories').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(b){category=b.dataset.cat;renderAvailable()}});
 q('tripAvailable').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preview)preview(b.dataset.preview);else if(b.dataset.addStop)addStop(b.dataset.addStop)});
 q('tripPresets').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.viewRoute){const li=document.getElementById('tripRoute-'+b.dataset.viewRoute);if(li)li.hidden=!li.hidden}
  if(b.dataset.useRoute){const r=currentRoutes().find(x=>x.id===b.dataset.useRoute);if(!r)return;
   if(r.paradas.length>3){q('tripNote').textContent='Esta rota tem mais de três paradas e precisa ser dividida para navegar pelo celular.';return}
   selected=(r.paradas||[]).filter(id=>stopById(id)?.endereco);presetId=r.id;render();showTab('mine')}
 });
 q('tripChosen').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;let i;
  if(b.dataset.up!==undefined){i=+b.dataset.up;if(i>0)[selected[i-1],selected[i]]=[selected[i],selected[i-1]]}
  else if(b.dataset.down!==undefined){i=+b.dataset.down;if(i<selected.length-1)[selected[i],selected[i+1]]=[selected[i+1],selected[i]]}
  else if(b.dataset.remove!==undefined)selected.splice(+b.dataset.remove,1);
  presetId='';render();showTab('mine');
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
 })();
})();