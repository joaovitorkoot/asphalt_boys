// Asphalt Boys · Revisão de sugestões (somente no painel autenticado).
(()=>{
 const workspace=document.getElementById('adminWorkspace'),shortcut=document.getElementById('pendingPublicationShortcut');
 if(!workspace||!shortcut)return;
 const button=document.getElementById('adminVisitorTab')||document.createElement('button');
 if(!button.isConnected){
  button.id='abVisitorOpenAdmin';button.type='button';
  button.className='subbtn inline-flex items-center gap-2 text-sm ml-2 mt-2 sm:mt-0';
  button.textContent='📨 Sugestões dos visitantes';
  shortcut.insertAdjacentElement('afterend',button);
 }
 const panel=document.createElement('section');panel.id='abVisitorAdmin';panel.hidden=true;
 panel.className='rounded-xl border border-orange-500/40 bg-[#171b21] p-4 sm:p-5 my-5 scroll-mt-5';
 panel.innerHTML=`
  <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
   <div><h2 class="text-2xl font-black">📨 Sugestões dos visitantes</h2></div>
   <div class="flex gap-2"><button type="button" class="subbtn" id="abVisitorRefresh">Atualizar</button>
    <button type="button" class="subbtn" id="abVisitorClose">Fechar</button></div>
  </div>
  <p id="abVisitorAdminStatus" class="tiny my-3" role="status" aria-live="polite"></p>
  <div id="abVisitorList" class="grid sm:grid-cols-2 gap-3"></div>
  <div id="abVisitorDetail" class="mt-4"></div>`;
 const target=document.getElementById('publicationQueue');
 (target||document.getElementById('adminTravelWorkspace')).insertAdjacentElement('beforebegin',panel);
 const $=id=>panel.querySelector('#'+id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safePhoto=s=>/^\/api\/image\?id=[0-9a-f-]{36}$/.test(String(s||''))?s:'';
 const stopCategories=[['cafe','☕ Café da manhã'],['almoco','🍽️ Almoço'],['cafe_tarde','🥐 Café da tarde'],['jantar','🌙 Jantar'],['turismo','📸 Pontos turísticos'],['descanso','🏍️ Descanso']];
 let suggestions=[],selectedId='',destinations=[],google=null,categorySuggestions=[];
 const destinationName=(record)=>record.destinationMode==='novo'?record.destinationName:
  destinations.find(d=>d.id===record.destinationId)?.nome||record.destinationId||'Destino não informado';
 function note(s){$('abVisitorAdminStatus').textContent=s}
 async function refresh(){
  note('Buscando sugestões...');$('abVisitorList').replaceChildren();
  try{
   const [r,d]=await Promise.all([fetch('/api/visitor-suggestions',{credentials:'same-origin',cache:'no-store'}),
                                   fetch('/api/content?admin=1',{credentials:'same-origin',cache:'no-store'})]);
   const json=await r.json();if(!r.ok)throw Error(json.error||'Falha ao buscar sugestões.');
   suggestions=Array.isArray(json.suggestions)?json.suggestions:[];
   if(d.ok){const content=await d.json();destinations=(content.destinos||[]).filter(x=>x.id&&x.nome)}
   const byId=new Map([['guaramiranga',{id:'guaramiranga',nome:'Guaramiranga'}],['canoa-quebrada',{id:'canoa-quebrada',nome:'Canoa Quebrada'}]]);
   for(const x of destinations)byId.set(x.id,x);
   destinations=[...byId.values()];
   renderList();
   note(suggestions.filter(x=>['pendente','rascunho'].includes(x.status)).length+' aguardando análise · '+suggestions.length+' sugestão(ões) no histórico');
   if(selectedId&&suggestions.some(x=>x.id===selectedId))await openSuggestion(selectedId,false);
   else $('abVisitorDetail').replaceChildren();
  }catch(e){note('⚠️ '+String(e.message||e))}
 }
 function renderList(){
  const host=$('abVisitorList');
  host.innerHTML=suggestions.length?suggestions.map(x=>`
   <article class="border border-zinc-600 rounded-xl bg-[#232831] p-3">
    <div class="flex items-start justify-between gap-2"><strong class="break-words">${esc(x.visitorName||'Local sem nome')}</strong>
    <span class="pill">${esc(x.status||'pendente')}</span></div>
    <p class="text-sm text-zinc-300 mt-2">📍 ${esc(destinationName(x))}</p>
    <p class="text-xs text-zinc-400 mt-1">📷 ${esc((x.photos||[]).length)} foto(s)</p>
    <button class="subbtn text-sm mt-3" type="button" data-abvisitor="${esc(x.id)}">Abrir sugestão</button>
   </article>`).join(''):'<p class="text-sm text-zinc-300">Nenhuma sugestão recebida.</p>';
  host.querySelectorAll('[data-abvisitor]').forEach(b=>b.onclick=()=>openSuggestion(b.dataset.abvisitor,true));
 }
 function currentDestOptions(chosen){
  return destinations.map(d=>'<option value="'+esc(d.id)+'"'+(d.id===chosen?' selected':'')+'>'+esc(d.nome)+'</option>').join('')+
   '<option value="__novo"'+(chosen==='__novo'?' selected':'')+'>Criar novo card de viagem</option>';
 }
 async function openSuggestion(id,fetchGoogle=true){
  selectedId=id;const x=suggestions.find(a=>a.id===id);if(!x)return;
  google=null;categorySuggestions=[];
  renderDetail(x);
  if(fetchGoogle&&['pendente','rascunho'].includes(x.status))await findGoogle(x);
 }
 function renderDetail(x){
  const active=['pendente','rascunho'].includes(x.status);
  const target=x.chosenDestinationMode?(x.chosenDestinationMode==='novo'?'__novo':x.chosenDestinationId):
   (x.destinationMode==='novo'?'__novo':x.destinationId);
  const wantedNew=x.chosenDestinationName||x.destinationName||'';
  const nameValue=x.approvedName||x.visitorName;
  const selectedName=x.visitorName?(x.nameChoice||'visitante'):(x.nameChoice&&x.nameChoice!=='visitante'?x.nameChoice:'manual');
  const googleName=google?.name||x.googleName||'';
  const gId=google?.id||x.googlePlaceId||'';
  const gps=google?.mapCoordinates||x.mapCoordinates||'';
  const photos=Array.isArray(x.photos)?x.photos:[];
  const selectedPhoto=photos.includes(x.selectedPhoto)?x.selectedPhoto:'';
  const selectedCategories=Array.isArray(x.selectedCategories)?x.selectedCategories:[];
  const photoChoices=photos.filter(safePhoto).map((p,i)=>
   '<button type="button" data-abphoto="'+esc(p)+'" aria-label="Escolher foto '+(i+1)+' como principal" aria-pressed="'+(p===selectedPhoto)+'" '+
   'class="ab-photo-choice" '+(active?'':'disabled')+'><img loading="lazy" alt="Foto enviada '+(i+1)+'" src="'+esc(p)+'"><span class="ab-photo-check" aria-hidden="true">✓</span></button>'
  ).join('')||'<p class="text-sm text-zinc-400 col-span-3">Nenhuma foto enviada.</p>';
  const categoryChoices=stopCategories.map(([id,label])=>
   '<label class="photoFrameChoice ab-category-choice"><input type="checkbox" name="abCategories" value="'+id+'" '+
   (selectedCategories.includes(id)?'checked ':'')+(active?'':'disabled ')+'><span>'+esc(label)+'</span><span class="ab-category-check" aria-hidden="true">✓</span></label>'
  ).join('');
  $('abVisitorDetail').innerHTML=`
   <article class="border border-zinc-600 bg-[#20252d] rounded-xl p-4">
    <div class="flex justify-between items-start flex-wrap gap-2 mb-3"><div>
     <h3 class="font-black text-xl">${esc(x.visitorName||'Local sem nome')}</h3>
     <p class="tiny">Sugestão ${esc(x.status)} · ${esc(x.createdAt||'')}</p></div>
     <span class="pill">${x.destinationMode==='novo'?'Novo destino':'Destino existente'}</span></div>
    <div class="border border-orange-500/30 bg-[#2b2927] rounded-xl p-3 mb-3">
     <p class="text-sm text-zinc-300">Destino sugerido</p>
     <p class="font-black text-lg mt-1">${esc(destinationName(x))}</p>
    </div>
    <p class="tiny">LINK ORIGINAL DO GOOGLE MAPS</p>
    <p class="text-sm break-all text-zinc-300 mt-1 mb-2">${esc(x.mapsUrl)}</p>
    <a class="subbtn inline-block text-sm" target="_blank" rel="noopener noreferrer" href="${esc(x.mapsUrl)}">↗ Ver no Google Maps</a>
    <div class="mt-4">
     <h4 class="font-black mb-2">Fotos recebidas <span class="font-normal text-zinc-400 text-sm">· Escolha a principal</span></h4>
     <div class="grid grid-cols-3 gap-2" id="abPhotoOptions">${photoChoices}</div>
    </div>
    <div class="border-t border-zinc-600 mt-4 pt-4">
     <h4 class="font-black mb-2">Categorias do local</h4>
     <div class="grid sm:grid-cols-2 gap-2" id="abCategoryOptions">${categoryChoices}</div>
     <div id="abCategorySuggestBox" class="rounded-xl border border-orange-500/30 bg-[#282d35] p-3 mt-3" hidden>
      <strong class="text-sm text-orange-200">✨ Sugestões do Google Maps</strong>
      <p class="text-sm text-zinc-300 mt-2" id="abCategorySuggestStatus" role="status"></p>
      <div id="abCategorySuggestItems" class="space-y-2 mt-2"></div>
      <button type="button" id="abApplyCategories" class="subbtn text-sm mt-3" hidden>✓ Aplicar categorias sugeridas</button>
      <details id="abGoogleHours" class="mt-3" hidden>
       <summary class="text-sm cursor-pointer text-orange-200">Ver horários informados pelo Google</summary>
       <div id="abGoogleHoursList" class="text-sm text-zinc-300 mt-2 space-y-1"></div>
      </details>
     </div>
    </div>
    <div class="border-t border-zinc-600 mt-4 pt-4">
     <h4 class="font-black">Nome para publicação</h4>
     <div class="mt-2 bg-[#2a3039] rounded-lg p-3">
      <p class="tiny" id="abGoogleStatus">Nome Google: ${googleName?esc(googleName):'Não consultado ou não identificado'}</p>
      <p class="tiny" id="abGoogleCoord">${gps?'Coordenadas do ponto: '+esc(gps):''}</p>
      <button type="button" id="abGoogleRetry" class="subbtn text-sm mt-2" ${active?'':'disabled'}>Consultar Google Maps</button>
     </div>
     <label class="pick mt-3"><input type="radio" name="abNameSource" value="visitante" ${selectedName==='visitante'?'checked':''} ${active&&x.visitorName?'':'disabled'}><span>Nome informado pelo visitante: <strong>${esc(x.visitorName||'Não informado')}</strong></span></label>
     <label class="pick mt-2"><input type="radio" name="abNameSource" value="google" ${selectedName==='google'?'checked':''} ${googleName&&gId&&active?'':'disabled'}><span>Nome identificado no Google Maps: <strong id="abGoogleName">${esc(googleName||'Indisponível')}</strong></span></label>
     <label class="pick mt-2"><input type="radio" name="abNameSource" value="manual" ${selectedName==='manual'?'checked':''} ${active?'':'disabled'}><span>Digitar outro nome</span></label>
     <label class="lbl" for="abManualName">Nome personalizado (quando necessário)</label>
     <input class="field" id="abManualName" maxlength="120" value="${esc(selectedName==='manual'?nameValue:'')}" ${active?'':'disabled'} placeholder="Digite o nome desejado">
    </div>
    <div class="border-t border-zinc-600 mt-4 pt-4">
     <label class="lbl" for="abChosenDest">Card onde será cadastrado</label>
     <select class="field" id="abChosenDest" ${active?'':'disabled'}>${currentDestOptions(target)}</select>
     <div id="abNewNameGroup" ${target==='__novo'?'':'hidden'}>
      <label class="lbl" for="abNewCardName">Nome do novo card</label>
      <input class="field" id="abNewCardName" maxlength="120" value="${esc(wantedNew)}" ${active?'':'disabled'} placeholder="Ex.: Morro Branco">
     </div>
    </div>
    <p id="abDetailNotice" class="text-orange-300 text-sm mt-3" role="status"></p>
    ${active?'<div class="flex flex-wrap gap-2 mt-4"><button class="subbtn" id="abSaveSuggestion" type="button">✏️ Salvar edição</button><button class="btn" id="abPublishSuggestion" type="button">🚀 Publicar</button><button class="subbtn !text-red-300" id="abRejectSuggestion" type="button">Rejeitar</button></div>':''}
   </article>`;
  const el=id=>$('abVisitorDetail').querySelector('#'+id);
  el('abChosenDest').onchange=e=>{el('abNewNameGroup').hidden=e.target.value!=='__novo'};
  const retry=el('abGoogleRetry');if(active)retry.onclick=()=>findGoogle(x);
  el('abPhotoOptions').querySelectorAll('[data-abphoto]').forEach(b=>b.onclick=()=>{
   el('abPhotoOptions').querySelectorAll('[data-abphoto]').forEach(item=>item.setAttribute('aria-pressed',String(item===b)));
  });
  if(active){
   el('abSaveSuggestion').onclick=()=>moderate(x,'salvar');
   el('abPublishSuggestion').onclick=()=>moderate(x,'publicar');
   el('abRejectSuggestion').onclick=()=>moderate(x,'rejeitar');
  }
 }

 async function loadCategorySuggestions(x,placeId){
  const root=$('abVisitorDetail'),box=root.querySelector('#abCategorySuggestBox');
  if(!box||selectedId!==x.id)return;
  const status=box.querySelector('#abCategorySuggestStatus');
  const items=box.querySelector('#abCategorySuggestItems');
  const apply=box.querySelector('#abApplyCategories');
  const hoursBox=box.querySelector('#abGoogleHours');
  const hoursList=box.querySelector('#abGoogleHoursList');
  box.hidden=false;apply.hidden=true;hoursBox.hidden=true;
  items.replaceChildren();hoursList.replaceChildren();
  status.textContent='Consultando tipo de local e horários...';
  if(!/^[a-zA-Z0-9_-]{5,250}$/.test(placeId)){
   status.textContent='Sem ficha do estabelecimento. Selecione as categorias manualmente.';return;
  }
  try{
   const response=await fetch('/api/category-suggest',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({placeId})
   });
   const data=await response.json();
   if(selectedId!==x.id||!box.isConnected)return;
   if(!response.ok)throw Error(data.error||'Consulta indisponível');
   const proposals=(Array.isArray(data.suggestions)?data.suggestions:[]).filter(p=>stopCategories.some(([id])=>id===p.id));
   categorySuggestions=[...new Set(proposals.map(p=>p.id))];
   status.textContent=data.note||'Revise as categorias sugeridas pelo Google.';
   proposals.forEach(p=>{
    const row=document.createElement('div');row.className='text-sm text-zinc-300';
    row.textContent=(stopCategories.find(([id])=>id===p.id)?.[1]||p.id)+' · '+String(p.reason||'').slice(0,200);
    items.append(row);
   });
   if(categorySuggestions.length){
    apply.hidden=false;
    apply.onclick=()=>{
     root.querySelectorAll('input[name="abCategories"]').forEach(input=>{
      input.checked=categorySuggestions.includes(input.value);
     });
     status.textContent='✓ Categorias aplicadas. Revise antes de publicar.';
    };
   }
   if(Array.isArray(data.hours)&&data.hours.length){
    hoursBox.hidden=false;
    data.hours.slice(0,7).forEach(h=>{
     const line=document.createElement('p');line.textContent=String(h).slice(0,170);hoursList.append(line);
    });
   }
  }catch(error){status.textContent='Não foi possível consultar: '+String(error.message||error)+'. Selecione as categorias manualmente.'}
 }
 async function findGoogle(x){
  const detail=$('abVisitorDetail');if(!detail)return;
  const status=detail.querySelector('#abGoogleStatus');status.textContent='Consultando o Google Maps...';
  try{
   const r=await fetch('/api/maps-import',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({url:x.mapsUrl})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível consultar');
   if(selectedId!==x.id)return;
   const candidates=Array.isArray(data.results)?data.results:[];
   const identified=candidates.find(p=>p.id&&p.name&&!p.name.startsWith('Ponto GPS'))||null;
   google={name:identified?.name||'',id:identified?.id||'',address:identified?.address||'',mapCoordinates:identified?.mapCoordinates||candidates[0]?.mapCoordinates||''};
   status.textContent=identified?'✓ Nome oficial identificado: '+identified.name:'O Google não identificou um estabelecimento. Use o nome do visitante ou escreva outro.';
   const labels=detail.querySelector('#abGoogleName');if(labels)labels.textContent=identified?.name||'Indisponível';
   const coord=detail.querySelector('#abGoogleCoord');if(coord)coord.textContent=google.mapCoordinates?'Coordenadas do ponto: '+google.mapCoordinates:'';
   const radio=detail.querySelector('input[name=abNameSource][value=google]');if(radio){radio.disabled=!identified;if(!identified&&radio.checked){radio.checked=false;detail.querySelector('input[name=abNameSource][value='+(x.visitorName?'visitante':'manual')+']').checked=true}}
   if(identified?.id)await loadCategorySuggestions(x,identified.id);
  }catch(e){status.textContent='Não foi possível identificar o nome automaticamente: '+String(e.message||e)}
 }
 async function moderate(x,action){
  const root=$('abVisitorDetail'),notice=root.querySelector('#abDetailNotice');
  if(action==='rejeitar'&&!confirm('Rejeitar esta sugestão? Ela não aparecerá no site.'))return;
  const chosen=root.querySelector('#abChosenDest').value;
  const choice=root.querySelector('input[name=abNameSource]:checked')?.value||'visitante';
  const gName=google?.name||x.googleName||'',gId=google?.id||x.googlePlaceId||'';
  const approved=choice==='visitante'?x.visitorName:choice==='google'?gName:root.querySelector('#abManualName').value.trim();
  const selectedPhoto=root.querySelector('[data-abphoto][aria-pressed="true"]')?.dataset.abphoto||'';
  const selectedCategories=[...root.querySelectorAll('input[name="abCategories"]:checked')].map(el=>el.value);
  if(action!=='rejeitar'&&(!approved||approved.length<3||(chosen==='__novo'&&root.querySelector('#abNewCardName').value.trim().length<3))){notice.textContent='Informe o nome escolhido e o destino antes de continuar.';return}
  if(action==='publicar'&&!selectedCategories.length){notice.textContent='Selecione pelo menos uma categoria.';return}
  if(action==='publicar'&&x.photos?.length&&!selectedPhoto){notice.textContent='Escolha a foto principal antes de publicar.';return}
  if(action==='publicar'){
   const msg=chosen==='__novo'?'Criar um novo card de viagem e publicar este local?':'Publicar este local dentro do card selecionado?';
   if(!confirm(msg))return;
  }
  root.querySelectorAll('button').forEach(b=>b.disabled=true);
  notice.textContent=action==='rejeitar'?'Rejeitando...':action==='salvar'?'Salvando edição...':'Publicando no site...';
  try{
   const payload={id:x.id,action,approvedName:approved,nameChoice:choice,googleName:gName,googlePlaceId:gId,googleAddress:google?.address||x.googleAddress||'',mapCoordinates:google?.mapCoordinates||x.mapCoordinates||'',mapsUrl:x.mapsUrl,
    chosenDestinationMode:chosen==='__novo'?'novo':'existente',chosenDestinationId:chosen==='__novo'?'':chosen,chosenDestinationName:chosen==='__novo'?root.querySelector('#abNewCardName').value.trim():'',selectedPhoto,selectedCategories};
   const r=await fetch('/api/visitor-suggestions',{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível salvar.');
   note(action==='publicar'?(data.createdDestination?'✓ Card novo e local publicados.':'✓ Local publicado no card escolhido.'):'✓ Sugestão atualizada.');
   await refresh();
  }catch(error){notice.textContent='⚠️ '+String(error.message||error);root.querySelectorAll('button').forEach(b=>b.disabled=false)}
 }
 const closeReview=()=>{
  document.body.classList.remove('admin-suggestion-view');
  panel.hidden=true;selectedId='';
  button.setAttribute('aria-selected','false');
 };
 document.querySelectorAll('[data-tab]').forEach(tab=>tab.addEventListener('click',closeReview));
 const openReview=async()=>{
  document.body.classList.remove('admin-show-audit','admin-show-queue');
  document.body.classList.add('admin-suggestion-view');
  document.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-selected','false'));
  document.querySelector('#adminTravelWorkspace').hidden=false;
  document.querySelector('#adminMotoWorkspace').hidden=true;
  document.querySelector('#adminMoreMenu').open=false;
  button.setAttribute('aria-selected','true');
  panel.hidden=false;
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  await refresh();
 };
 button.onclick=openReview;
 $('abVisitorClose').onclick=()=>{closeReview();document.querySelector('[data-tab="destinos"]')?.click()};
 $('abVisitorRefresh').onclick=refresh;
})();