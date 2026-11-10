/* Asphalt Boys · caixa privada de acessórios e melhorias dentro da aba Sugestões */
(()=>{
 'use strict';
 const panel=document.getElementById('abVisitorAdmin');
 if(!panel)return;
 const head=panel.querySelector('#abVisitorAdminStatus');
 const places=panel.querySelector('#abVisitorList');
 const detail=panel.querySelector('#abVisitorDetail');
 const toolbar=document.createElement('nav');
 toolbar.className='grid grid-cols-3 gap-2 mt-4 mb-4';
 toolbar.setAttribute('aria-label','Tipos de sugestões recebidas');
 const categories=[['places','📍 Lugares'],['accessory','🏍️ Acessórios'],['improvement','💡 Melhorias']];
 toolbar.innerHTML=categories.map(([id,label])=>'<button type="button" data-ab-feedback-tab="'+id+'" aria-pressed="'+(id==='places')+'" class="subbtn text-xs sm:text-sm">'+label+'</button>').join('');
 head.before(toolbar);
 const feedbackStatus=document.createElement('p');
 feedbackStatus.id='abFeedbackAdminStatus';feedbackStatus.className='text-sm text-zinc-300 my-3';
 feedbackStatus.setAttribute('role','status');
 feedbackStatus.hidden=true;
 const feedbackList=document.createElement('div');
 feedbackList.id='abFeedbackAdminList';feedbackList.className='grid gap-3';feedbackList.hidden=true;
 detail.after(feedbackStatus,feedbackList);
 let active='places',entries=[],loaded=false;
 function setTab(next){
  if(!categories.some(([id])=>id===next))return;
  active=next;
  toolbar.querySelectorAll('button').forEach(b=>{
   const selected=b.dataset.abFeedbackTab===next;
   b.setAttribute('aria-pressed',String(selected));
   b.style.background=selected?'#39271e':'';
   b.style.borderColor=selected?'#fb923c':'';
   b.style.color=selected?'#ffbd8f':'';
  });
  const isPlaces=next==='places';
  places.hidden=!isPlaces;detail.hidden=!isPlaces;head.hidden=!isPlaces;
  feedbackList.hidden=isPlaces;feedbackStatus.hidden=isPlaces;
  if(!isPlaces)refresh();
 }
 async function refresh(){
  if(active==='places')return;
  feedbackStatus.textContent='Carregando sugestões...';
  try{
   const response=await fetch('/api/site-feedback',{credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar.');
   entries=Array.isArray(data.suggestions)?data.suggestions:[];
   loaded=true;render();
  }catch(error){feedbackStatus.textContent='⚠️ '+String(error.message||error);feedbackList.replaceChildren()}
 }
 function render(){
  if(active==='places')return;
  const filtered=entries.filter(x=>x.kind===active);
  feedbackStatus.textContent=filtered.length+' sugestão(ões) de '+(active==='accessory'?'acessórios':'melhorias');
  feedbackList.replaceChildren();
  if(!filtered.length){
   const empty=document.createElement('p');empty.className='border border-zinc-700 rounded-xl p-4 text-zinc-400 text-sm';
   empty.textContent='Nenhuma sugestão nesta categoria.';feedbackList.append(empty);return;
  }
  filtered.forEach(item=>{
   const card=document.createElement('article');
   card.className='rounded-xl border border-[#49515c] bg-[#232831] p-4 space-y-3';
   const title=document.createElement('h3');title.className='text-base font-bold text-white break-words';
   title.textContent=item.title||'Sugestão sem título';
   const small=document.createElement('p');small.className='text-xs text-zinc-400';
   small.textContent=(item.createdAt||'')+(item.category?' · '+item.category:'');
   const details=document.createElement('p');details.className='text-sm text-zinc-300 whitespace-pre-wrap break-words';
   details.textContent=item.details||'Sem informações adicionais.';
   const actions=document.createElement('div');actions.className='flex flex-wrap gap-2 items-center';
   const remove=document.createElement('button');remove.className='subbtn !text-red-300';
   remove.type='button';remove.textContent='Excluir sugestão';
   remove.addEventListener('click',async()=>{
    if(!confirm('Excluir definitivamente esta sugestão?'))return;
    remove.disabled=true;remove.textContent='Excluindo...';
    try{
     const response=await fetch('/api/site-feedback',{method:'DELETE',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});
     const data=await response.json();if(!response.ok)throw Error(data.error||'Falha ao excluir.');
     entries=entries.filter(x=>x.id!==item.id);
     render();feedbackStatus.textContent='✓ Sugestão excluída.';
    }catch(error){remove.disabled=false;remove.textContent='Excluir sugestão';feedbackStatus.textContent='⚠️ '+String(error.message||error)}
   });
   actions.append(remove);
   if(item.link){
    try{
     const url=new URL(item.link);
     if(url.protocol==='https:'){
      const a=document.createElement('a');a.className='subbtn text-sm';a.target='_blank';a.rel='noopener noreferrer';
      a.href=url.href;a.textContent='↗ Ver acessório';actions.prepend(a);
     }
    }catch{}
   }
   card.append(title,small,details,actions);feedbackList.append(card);
  });
 }
 toolbar.addEventListener('click',e=>{
  const b=e.target.closest('[data-ab-feedback-tab]');if(b)setTab(b.dataset.abFeedbackTab);
 });
 document.getElementById('adminVisitorTab')?.addEventListener('click',()=>{if(!loaded)setTab('places')});
 panel.querySelector('#abVisitorRefresh')?.addEventListener('click',()=>{if(active!=='places')refresh()});
 setTab('places');
})();
