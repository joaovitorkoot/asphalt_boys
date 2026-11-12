// Asphalt Boys • aba de sugestões de rotas dentro da área "Sugestões" do painel.
(()=>{
 const panel=document.getElementById('abVisitorAdmin');
 if(!panel||document.getElementById('abRouteAdmin'))return;
 const title=panel.querySelector('h2');
 const switcher=document.createElement('div');switcher.className='flex flex-wrap gap-2 mb-4';
 switcher.innerHTML='<button type="button" id="abSuggestPlacesTab" class="subbtn text-sm" aria-pressed="true">📍 Lugares</button>'+
 '<button type="button" id="abSuggestRoutesTab" class="subbtn text-sm" aria-pressed="false">🛣️ Rotas sugeridas</button>';
 if(title)title.closest('div')?.parentElement?.insertAdjacentElement('afterend',switcher);
 else panel.prepend(switcher);
 const area=document.createElement('section');area.id='abRouteAdmin';area.hidden=true;area.className='my-3';
 area.innerHTML='<p id="abRouteAdminStatus" class="tiny mb-3" role="status">Veja as rotas enviadas pelos visitantes.</p>'+
 '<div class="flex justify-end mb-3"><button id="abRouteRefresh" type="button" class="subbtn">Atualizar rotas</button></div>'+
 '<div id="abRouteList" class="grid sm:grid-cols-2 gap-3"></div><div id="abRouteDetail" class="mt-4"></div>';
 panel.append(area);
 const el=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],destinations={},stops={},selected='';
 function showRoutes(on){
  area.hidden=!on;
  for(const id of ['abVisitorList','abVisitorDetail','abVisitorAdminStatus'])if(el(id))el(id).hidden=on;
  el('abSuggestPlacesTab').setAttribute('aria-pressed',String(!on));
  el('abSuggestRoutesTab').setAttribute('aria-pressed',String(on));
  el('abSuggestPlacesTab').style.background=on?'':'#f97316';
  el('abSuggestPlacesTab').style.color=on?'':'#121212';
  el('abSuggestRoutesTab').style.background=on?'#f97316':'';
  el('abSuggestRoutesTab').style.color=on?'#121212':'';
  if(on)load();
 }
 const status=s=>el('abRouteAdminStatus').textContent=s;
 async function load(){
  status('Consultando sugestões de rotas...');
  try{
   const [r,c]=await Promise.all([
    fetch('/api/route-suggestions',{credentials:'same-origin',cache:'no-store'}),
    fetch('/api/content?admin=1',{credentials:'same-origin',cache:'no-store'})
   ]);
   const data=await r.json();if(!r.ok)throw Error(data.error||'Erro ao carregar sugestões.');
   records=Array.isArray(data.suggestions)?data.suggestions:[];
   if(c.ok){const info=await c.json();destinations={};stops={};
    for(const dest of info.destinos||[])destinations[dest.id]=dest.nome;
    for(const stop of info.paradas||[])stops[stop.id]={name:stop.nome,destinoId:stop.destinoId,status:stop.status};
   }
   destinations.guaramiranga=destinations.guaramiranga||'Guaramiranga';
   destinations['canoa-quebrada']=destinations['canoa-quebrada']||'Canoa Quebrada';
   renderList();
   status(records.filter(x=>x.status==='pendente').length+' pendente(s) · '+records.length+' sugestão(ões) de rotas recebidas');
   if(selected&&records.some(x=>x.id===selected))detail(selected);else el('abRouteDetail').replaceChildren();
  }catch(e){status('⚠️ '+String(e.message||e))}
 }
 function routeParts(x){
  const base=Array.isArray(x.stops)?x.stops:[];
  const days=Array.isArray(x.days)?x.days:[];
  const ids=days.length?days.flatMap(d=>Array.isArray(d[1])?d[1]:[]):base;
  return {ids,days,custom:Array.isArray(x.points)?x.points:[]};
 }
 function renderList(){
  el('abRouteList').innerHTML=records.length?records.map(x=>{
   const n=x.dayCount?' · '+x.dayCount+' dia(s)':'';
   const destination=destinations[x.destinationId]||(x.destinationId==='canoa'?'Canoa Quebrada':x.destinationId);
   return '<article class="rounded-xl border border-zinc-600 bg-[#242a32] p-3">'+
    '<div class="flex flex-wrap gap-2 justify-between"><strong class="break-words">'+esc(x.title)+'</strong><span class="pill">'+esc(x.status)+'</span></div>'+
    '<p class="text-sm text-zinc-300 mt-2">📍 '+esc(destination)+'</p>'+
    '<p class="tiny mt-1">'+Number(x.stopCount||0)+' parada(s)'+n+'</p>'+
    '<button type="button" class="subbtn mt-3" data-route-record="'+esc(x.id)+'">Abrir sugestão</button></article>';
  }).join(''):'<p class="text-sm text-zinc-400">Nenhuma rota sugerida até agora.</p>';
  el('abRouteList').querySelectorAll('[data-route-record]').forEach(b=>b.onclick=()=>detail(b.dataset.routeRecord));
 }
 function detail(id){
  selected=id;const x=records.find(r=>r.id===id);if(!x)return;
  const parts=routeParts(x),custom=new Map(parts.custom.map(v=>[v[0],v[1]]));
  const labels=parts.ids.map((sid,i)=>{
   const known=stops[sid];
   return '<li class="rounded-lg p-2 border border-zinc-700 text-sm flex gap-2"><span class="text-orange-300 font-bold">'+(i+1)+'.</span><span>'+
    esc(known?.name||custom.get(sid)||'Parada não encontrada no cadastro')+'</span>'+
    (known?.status==='publicado'?'<span class="ml-auto text-green-300 text-xs">Cadastrada</span>':'<span class="ml-auto text-orange-300 text-xs">Revisar</span>')+'</li>';
  }).join('');
  const dest=destinations[x.destinationId]||(x.destinationId==='canoa'?'Canoa Quebrada':x.destinationId);
  const multipart=parts.days.length>0,hasCustom=parts.custom.length>0,already=!!x.presetId&&!parts.ids.length;
  el('abRouteDetail').innerHTML='<div class="rounded-xl border border-orange-500/40 bg-[#1e232b] p-4">'+
   '<div class="flex flex-wrap gap-2 items-center justify-between"><h3 class="text-xl font-black">'+esc(x.title)+'</h3><span class="pill">'+esc(x.status)+'</span></div>'+
   '<p class="tiny mt-2">Recebida em '+esc(x.createdAt||'')+'</p>'+
   '<div class="bg-[#302b28] border border-orange-500/30 rounded-xl p-3 my-4"><strong>Destino: '+esc(dest)+'</strong>'+
   '<p class="text-sm text-zinc-300 mt-1">'+Number(x.stopCount||0)+' paradas'+(multipart?' · '+parts.days.length+' dia(s)':'')+'</p></div>'+
   (x.note?'<p class="text-sm text-zinc-300 mb-4 whitespace-pre-wrap">'+esc(x.note)+'</p>':'')+
   '<p class="font-bold text-sm mb-2">Paradas do roteiro (em ordem)</p>'+
   (labels?'<ol class="space-y-2">'+labels+'</ol>':'<p class="tiny">Rota já programada ou sem paradas individuais.</p>')+
   '<div class="flex gap-2 flex-wrap mt-4"><a class="subbtn" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">↗ Abrir roteiro</a>'+
   '<button class="subbtn" type="button" id="abRouteCopy">Copiar link</button></div>'+
   '<p class="tiny mt-4">'+(multipart?'Viagem de vários dias: cadastre os trechos separadamente na aba Rotas após analisar.':
     hasCustom?'Esta sugestão contém paradas personalizadas. Cadastre os locais antes de publicar.':
     already?'Este link referencia uma rota programada já existente. Verifique antes de republicar.':
     'Confira os locais e a ordem do trajeto antes de aprovar.')+'</p>'+
   '<p id="abRouteActionStatus" class="text-orange-300 text-sm mt-3" role="status"></p>'+
   '<div class="flex gap-2 flex-wrap mt-4">'+
   (x.status==='pendente'?'<button type="button" id="abRoutePublish" class="btn" '+(multipart||hasCustom||already?'disabled':'')+'>🚀 Aprovar e publicar rota</button>'+
    '<button type="button" id="abRouteReject" class="subbtn !text-red-300">Rejeitar</button>':'')+
   (x.status==='rejeitada'?'<button type="button" id="abRouteReopen" class="subbtn">Reabrir</button>':'')+
   (x.status==='publicado'?'<p class="text-sm text-green-300">✓ Rota publicada. Para editar, use a aba Rotas.</p>':'')+
   '<button type="button" id="abRouteDelete" class="subbtn !text-red-300">Excluir do histórico</button></div></div>';
  el('abRouteCopy').onclick=async()=>{try{await navigator.clipboard.writeText(x.url);el('abRouteActionStatus').textContent='✓ Link copiado.'}catch{el('abRouteActionStatus').textContent='Abra o roteiro e copie o endereço pela barra do navegador.'}};
  if(x.status==='pendente'){
   el('abRouteReject').onclick=()=>act(x,'rejeitar');
   el('abRoutePublish').onclick=()=>act(x,'publicar');
  }
  if(x.status==='rejeitada')el('abRouteReopen').onclick=()=>act(x,'reabrir');
  el('abRouteDelete').onclick=()=>remove(x);
 }
 async function act(x,action){
  if(action==='publicar'&&!confirm('Publicar esta rota pronta para todos os visitantes do Asphalt Boys?'))return;
  if(action==='rejeitar'&&!confirm('Rejeitar esta sugestão de rota?'))return;
  const notice=el('abRouteActionStatus');notice.textContent='Atualizando...';
  try{
   const r=await fetch('/api/route-suggestions',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:x.id,action,title:x.title})});
   const res=await r.json();if(!r.ok)throw Error(res.error||'Não foi possível atualizar.');
   await load();status(action==='publicar'?'✓ Rota publicada e disponível no planejador.':'✓ Sugestão atualizada.');
  }catch(e){notice.textContent='⚠️ '+String(e.message||e)}
 }
 async function remove(x){
  if(!confirm(x.status==='publicado'?'Excluir apenas o histórico? A rota já publicada continuará no site.':'Excluir esta sugestão de rota definitivamente?'))return;
  const notice=el('abRouteActionStatus');notice.textContent='Excluindo...';
  try{
   const r=await fetch('/api/route-suggestions',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:x.id,deleteOnlyHistory:x.status==='publicado'})});
   const res=await r.json();if(!r.ok)throw Error(res.error||'Erro ao excluir.');
   selected='';await load();status('✓ Sugestão removida do histórico.');
  }catch(e){notice.textContent='⚠️ '+String(e.message||e)}
 }
 el('abSuggestPlacesTab').onclick=()=>showRoutes(false);
 el('abSuggestRoutesTab').onclick=()=>showRoutes(true);
 el('abRouteRefresh').onclick=load;
 document.getElementById('adminVisitorTab')?.addEventListener('click',()=>{if(!area.hidden)load()});
 showRoutes(false);
})();
