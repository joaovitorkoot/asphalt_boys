// Asphalt Boys: formulario para sugerir roteiros pelo link compartilhado.
(()=>{
 const previous=document.getElementById('abSuggest');if(!previous||document.getElementById('abRouteSuggest'))return;
 const style=document.createElement('style');
 style.textContent='#abRouteSuggest{margin-top:16px;padding:22px;border:1px solid #80522f;background:linear-gradient(125deg,#1e242c,#151a20);border-radius:18px;color:#f5f6f8}'+
 '#abRouteSuggest .header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:13px}'+
 '#abRouteSuggest .eyebrow{font-size:11px;color:#ffa76d;letter-spacing:.11em;font-weight:900}'+
 '#abRouteSuggest h3{font-size:clamp(20px,4vw,27px);font-weight:900;margin:4px 0}'+
 '#abRouteSuggest p{font-size:13px;line-height:1.55;color:#c0c8d2;margin:6px 0 10px}'+
 '#abRouteSuggest label{display:block;font-weight:800;font-size:13px;margin:14px 0 7px}'+
 '#abRouteSuggest input,#abRouteSuggest textarea{background:#262d35;border:1px solid #606872;border-radius:10px;color:white;width:100%;min-height:45px;padding:11px;font-size:15px}'+
 '#abRouteSuggest textarea{min-height:88px;resize:vertical}'+
 '#abRouteSuggest input:focus,#abRouteSuggest textarea:focus{outline:2px solid #fb923c}'+
 '#abRouteSuggest button{border-radius:10px;min-height:44px;font-weight:800;font-size:13px;cursor:pointer}'+
 '#abRouteSuggest .primary{background:#fb923c;color:#16110c;padding:11px 17px;border:0}'+
 '#abRouteSuggest .primary:disabled{opacity:.5}'+
 '#abRouteSuggest .formarea{border-top:1px solid #414853;margin-top:15px;padding-top:10px}'+
 '#abRouteSuggest .note{font-size:12px;color:#aeb8c4}'+
 '#abRouteSuggest .summary{border:1px solid #535c67;background:#212831;border-radius:11px;padding:12px;margin-top:12px}'+
 '#abRouteSuggest [hidden]{display:none!important}'+
 '#abRouteSuggest .message{font-size:13px;color:#ffb586;line-height:1.5;margin:13px 0}'+
 '#abRouteSuggest .message.success{color:#abe7c9}'+
 '@media(max-width:500px){#abRouteSuggest{padding:16px}#abRouteSuggest .primary{width:100%}}';
 document.head.append(style);
 const root=document.createElement('section');root.id='abRouteSuggest';
 root.innerHTML='<div class="header"><div><div class="eyebrow">🛣️ SUGIRA UMA ROTA</div><h3>Montou uma rota incrível?</h3>'+
 '<p>Compartilhe seu roteiro com outros motociclistas. Se aprovado, ele poderá virar uma rota programada do Asphalt Boys.</p></div>'+
 '<button type="button" class="primary" id="abRouteOpen" aria-expanded="false">Sugerir minha rota</button></div>'+
 '<div class="formarea" id="abRouteArea" hidden><form id="abRouteForm">'+
 '<p class="note">Monte a viagem no planejador, toque em <b>Compartilhar</b> e cole aqui o link gerado.</p>'+
 '<label for="abRouteLink">1. Link do roteiro Asphalt Boys *</label>'+
 '<input id="abRouteLink" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="7000" required placeholder="https://asphalt-boys.pages.dev/?dest=...">'+
 '<div class="summary" id="abRouteSummary" hidden aria-live="polite"></div><p class="note" id="abRouteHint" role="status">O sistema identificará as paradas do link.</p>'+
 '<label for="abRouteTitle">2. Dê um nome à sua rota *</label>'+
 '<input id="abRouteTitle" type="text" minlength="3" maxlength="120" required placeholder="Ex.: Minha viagem pela serra">'+
 '<label for="abRouteNote">3. O que torna a rota especial? (opcional)</label>'+
 '<textarea id="abRouteNote" maxlength="700" placeholder="Ex.: Paramos para tomar café e seguimos até um mirante."></textarea>'+
 '<p class="note">Para sua privacidade, a cidade ou endereço de origem será removido da sugestão. Evite dados pessoais na descrição.</p>'+
 '<p class="message" id="abRouteMessage" role="status" aria-live="polite"></p>'+
 '<button type="submit" class="primary" id="abRouteSend">Enviar sugestão de rota</button></form></div>';
 previous.insertAdjacentElement('afterend',root);
 const el=id=>root.querySelector('#'+id),area=el('abRouteArea'),toggle=el('abRouteOpen'),input=el('abRouteLink');
 let names={};
 fetch('/api/content',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data)return;
  for(const kind of ['destinos','paradas','rotas'])for(const item of data[kind]||[])if(item&&item.id&&item.nome)names[item.id]=item.nome;
 }).catch(()=>{});
 function read(raw){
  const m=String(raw||'').trim().match(/https:\/\/[^\s<>"']+/i);
  if(!m)throw Error('Cole o link criado no botão Compartilhar do planejador.');
  let u;try{u=new URL(m[0].replace(/[),.;]+$/,''))}catch{throw Error('Link inválido.')}
  if(u.protocol!=='https:'||!['asphalt-boys.pages.dev','asphalt-boys.joaovitorkoot.workers.dev',location.hostname].includes(u.hostname)||!['/','/index.html'].includes(u.pathname))throw Error('O link precisa ser do Asphalt Boys.');
  const dest=u.searchParams.get('dest')||'',stops=u.searchParams.get('stops')||'',dias=u.searchParams.get('dias')||'',rota=u.searchParams.get('rota')||'';
  if(!/^[a-zA-Z0-9_-]{3,120}$/.test(dest)||!stops&&!dias&&!rota)throw Error('Compartilhe uma rota que contenha destino e paradas ou uma rota selecionada.');
  let ids=stops?stops.split(','):[],days=0,count=ids.length;
  if(dias){let parsed;try{parsed=JSON.parse(dias)}catch{throw Error('Dias inválidos.')}
   if(!Array.isArray(parsed)||parsed.length>7)throw Error('Roteiro de dias inválido.');
   days=parsed.length;count=parsed.reduce((n,row)=>n+(Array.isArray(row&&row[1])?row[1].length:0),0);
  }
  if(count>140)throw Error('Roteiro grande demais.');
  return {url:u.href,dest,ids,days,count,rota};
 }
 function preview(){
  const box=el('abRouteSummary'),hint=el('abRouteHint');box.replaceChildren();
  try{
   const trip=read(input.value);box.hidden=false;
   const rows=['📍 Destino: '+(names[trip.dest]||(trip.dest==='canoa'?'Canoa Quebrada':trip.dest)),
     trip.days?'📅 '+trip.days+' dia(s)':trip.rota?'🛣️ Rota programada selecionada':'🛣️ Rota personalizada',
     '📌 '+trip.count+' parada(s)'];
   if(trip.ids.length)rows.push(trip.ids.slice(0,8).map((id,i)=>(i+1)+'. '+(names[id]||'Parada cadastrada')).join(' · '));
   for(const line of rows){const p=document.createElement('p');p.textContent=line;box.append(p);}
   hint.textContent='✓ Link reconhecido. Confira as informações antes de enviar.';hint.style.color='#b6ecd0';return trip;
  }catch(e){box.hidden=true;hint.textContent=String(e.message||e);hint.style.color='#ffae83';return null;}
 }
 function expand(link){
  area.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.textContent='Fechar formulário';
  if(link){input.value=link;preview();}
  root.scrollIntoView({behavior:'smooth',block:'start'});input.focus({preventScroll:true});
 }
 toggle.onclick=()=>{if(area.hidden)expand('');else{area.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.textContent='Sugerir minha rota'}};
 input.addEventListener('input',preview);
 el('abRouteForm').addEventListener('submit',async e=>{
  e.preventDefault();const trip=preview(),title=el('abRouteTitle').value.trim(),note=el('abRouteNote').value.trim(),msg=el('abRouteMessage'),button=el('abRouteSend');
  if(!trip){msg.textContent='Confira o link da rota antes de enviar.';return;}
  if(title.length<3){msg.textContent='Informe um nome para a rota.';return;}
  button.disabled=true;msg.classList.remove('success');msg.textContent='Enviando sugestão...';
  try{
   const r=await fetch('/api/route-suggestions',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({routeUrl:trip.url,title,note})});
   const result=await r.json();if(!r.ok)throw Error(result.error||'Não foi possível enviar.');
   msg.classList.add('success');msg.textContent='✓ Rota recebida! Ela ficará pendente até a administração analisar.';
   el('abRouteForm').reset();el('abRouteSummary').hidden=true;
  }catch(error){msg.textContent='⚠️ '+String(error.message||error)}
  finally{button.disabled=false}
 });
 const share=document.getElementById('tripShareBox');
 if(share&&!document.getElementById('abSuggestCurrentRoute')){
  const b=document.createElement('button');b.type='button';b.id='abSuggestCurrentRoute';b.className='tripNavBtn';b.style.marginTop='9px';b.style.width='100%';
  b.textContent='🛣️ Sugerir esta rota para o Asphalt Boys';
  b.onclick=()=>{
   const url=document.getElementById('tripShareLink')?.value?.trim();
   if(!url){alert('Primeiro toque em Compartilhar no planejador.');return;}
   document.getElementById('tripClose')?.click();expand(url);
  };
  share.append(b);
 }
})();
