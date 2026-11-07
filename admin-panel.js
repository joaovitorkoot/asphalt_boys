(() => {
'use strict';
const API='/api/content', LOCAL='asphalt-boys-admin-drafts-v1', SESSION='asphalt-boys-admin-token';
const KINDS=['destinos','paradas','rotas'], LABELS={destinos:'Destinos',paradas:'Paradas',rotas:'Rotas programadas',backup:'Backup'};
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const starter={destinos:[{id:'guaramiranga',nome:'Guaramiranga',descricao:'Serra e natureza',status:'rascunho'},{id:'canoa-quebrada',nome:'Canoa Quebrada',descricao:'Falésias e litoral',status:'rascunho'}],paradas:[{id:'pico-alto-parada',destinoId:'guaramiranga',nome:'Pico Alto',categoria:'turismo',endereco:'Pico Alto, Guaramiranga, Ceará, Brasil',status:'rascunho'}],rotas:[]};
let data={destinos:[],paradas:[],rotas:[]}, mode='gate', tab='destinos', editing=null, chosenStops=[], token='', busy=false;
function validData(x){return x&&KINDS.every(k=>Array.isArray(x[k]));}
function localRead(){try{const v=JSON.parse(localStorage.getItem(LOCAL));return validData(v)?v:structuredClone(starter);}catch{return structuredClone(starter);}}
function localSave(){localStorage.setItem(LOCAL,JSON.stringify(data));}
function status(msg,error=false){$('notice').textContent=msg||'';$('notice').className='text-sm mt-2 min-h-5 '+(error?'text-red-300':'text-orange-300');}
function switchView(next){mode=next;$('gate').hidden=next!=='gate';$('dashboard').hidden=next==='gate';if(next!=='gate'){$('modeText').textContent=next==='online'?'🟢 Conectado ao Cloudflare D1 · alterações publicadas ficam visíveis para todos':'🟡 Rascunhos locais · nada será publicado no site';render();}}
async function request(method='GET',payload,admin=true){
 const headers={'Accept':'application/json'};if(payload)headers['Content-Type']='application/json';
 if(admin){if(!token)throw Error('Informe a chave administrativa.');headers.Authorization='Bearer '+token;}
 let response;try{response=await fetch(API+(admin&&method==='GET'?'?admin=1':''),{method,headers,body:payload?JSON.stringify(payload):undefined,cache:'no-store'});}catch{throw Error('Não foi possível conectar ao site. Confira sua internet e o domínio.');}
 let body={};try{body=await response.json();}catch{}
 if(!response.ok)throw Error(body.error||(response.status===503?'Banco D1 não configurado.':'Erro HTTP '+response.status));
 return body;
}
async function enter(value){
 token=value.trim();$('gateMessage').textContent='Conectando ao banco de dados...';
 try{const remote=await request('GET');if(!validData(remote))throw Error('Resposta inesperada do servidor.');
 data=remote;sessionStorage.setItem(SESSION,token);$('token').value='';tab='destinos';editing=null;chosenStops=[];switchView('online');status('Conexão segura estabelecida.');$('gateMessage').textContent='';
 }catch(e){token='';sessionStorage.removeItem(SESSION);$('gateMessage').textContent=e.message+' Você ainda pode preparar rascunhos locais.';}}
function opts(list,current){return '<option value="">Selecione...</option>'+list.map(x=>'<option value="'+esc(x.id)+'" '+(current===x.id?'selected':'')+'>'+esc(x.nome)+'</option>').join('');}
function fld(name,label,value='',type='text',required=false){const attrs=' id="f_'+name+'" name="'+name+'" '+(required?'required':'');return '<label class="lbl" for="f_'+name+'">'+label+'</label>'+(type==='textarea'?'<textarea class="field" rows="3"'+attrs+'>'+esc(value)+'</textarea>':'<input class="field" type="'+type+'" value="'+esc(value)+'"'+attrs+'>');}
function renderEditor(){
 const current=data[tab].find(x=>x.id===editing)||{};
 const f=(n,l,type='text',required=false)=>fld(n,l,current[n]||'',type,required);
 let content='';
 if(tab==='destinos')content=f('nome','Nome do destino','text',true)+f('descricao','Descrição','textarea')+f('foto','Foto de capa (URL https://...)','url')+f('mapa','Localização do destino / referência no Maps');
 if(tab==='paradas'){
   content='<label class="lbl" for="f_destinoId">Destino da parada</label><select class="field" id="f_destinoId" name="destinoId" required>'+opts(data.destinos,current.destinoId)+'</select>'+f('nome','Nome do estabelecimento ou parada','text',true);
   content+='<label class="lbl" for="f_categoria">Categoria</label><select class="field" id="f_categoria" name="categoria">'+[['cafe','☕ Café da manhã'],['almoco','🍽️ Almoço'],['turismo','📸 Turismo / mirante'],['descanso','🏍️ Descanso / posto']].map(([v,l])=>'<option value="'+v+'" '+(v===current.categoria?'selected':'')+'>'+l+'</option>').join('')+'</select>';
   content+=f('descricao','Descrição complementar','textarea')+f('maps','Link do local no Google Maps','url')+f('endereco','Endereço ou coordenadas para navegação')+f('foto','Foto para destacar na prévia (URL https://...)','url')+f('horario','Horário (opcional)')+f('googlePlaceId','ID do lugar no Google (opcional)');
   content+='<p class="muted text-xs mt-3">O visitante pode abrir as fotos, avaliações e horários atuais no Google Maps pelo link. A importação automática desses dados depende da configuração da API oficial do Google.</p>';
 }
 if(tab==='rotas'){
   content='<label class="lbl" for="f_destinoId">Destino da rota</label><select class="field" id="f_destinoId" name="destinoId" required>'+opts(data.destinos,current.destinoId)+'</select>'+f('nome','Nome do roteiro','text',true)+f('descricao','Descrição da rota','textarea');
   content+='<p class="lbl">Paradas na ordem da viagem (máximo 3 por link)</p><div id="selectedStops" class="space-y-2"></div><p class="lbl">Adicionar parada</p><div id="availableStops" class="space-y-2"></div>';
 }
 const state=current.status==='publicado'?'publicado':'rascunho';
 content+='<label class="lbl" for="f_status">Visibilidade</label><select class="field" id="f_status" name="status"><option value="rascunho" '+(state==='rascunho'?'selected':'')+'>Rascunho (privado)</option><option value="publicado" '+(state==='publicado'?'selected':'')+'>Publicado (visível no site)</option></select>';
 content+='<div class="flex gap-3 flex-wrap mt-5"><button class="btn" type="submit">'+(editing?'Salvar alterações':'Cadastrar')+'</button><button class="alt" type="button" id="clearEditor">Limpar</button></div>';
 $('formMount').innerHTML='<form id="recordForm" class="border border-zinc-700 rounded-xl p-4 sm:p-5"><h3 class="font-extrabold text-lg">'+(editing?'Editar cadastro':'Novo cadastro')+'</h3>'+content+'</form>';
 $('recordForm').onsubmit=saveRecord;
 $('clearEditor').onclick=()=>{editing=null;chosenStops=[];render();};
 if(tab==='rotas'){$('f_destinoId').addEventListener('change',()=>{chosenStops=[];renderStops();});renderStops();}
}
function renderStops(){
 const dest=$('f_destinoId').value, related=data.paradas.filter(p=>p.destinoId===dest), selected=chosenStops.filter(id=>related.some(p=>p.id===id));
 chosenStops=selected.slice(0,3);
 $('selectedStops').innerHTML=selected.length?selected.map((id,i)=>{const p=related.find(z=>z.id===id);return '<div class="item flex items-center gap-2"><span class="flex-1 text-sm">'+(i+1)+'. '+esc(p.nome)+'</span><button type="button" class="alt" data-up="'+i+'" '+(i===0?'disabled':'')+'>↑</button><button type="button" class="alt" data-down="'+i+'" '+(i===selected.length-1?'disabled':'')+'>↓</button><button type="button" class="alt" data-unpick="'+i+'">×</button></div>';}).join(''):'<p class="muted text-sm">Rota direta, sem paradas.</p>';
 $('availableStops').innerHTML=related.filter(p=>!selected.includes(p.id)).map(p=>'<div class="item flex items-center gap-3"><span class="flex-1 text-sm">'+esc(p.nome)+'</span><button type="button" class="alt text-sm" data-pickstop="'+esc(p.id)+'" '+(selected.length>=3?'disabled':'')+'>+ Adicionar</button></div>').join('')||'<p class="muted text-sm">Nenhuma outra parada cadastrada neste destino.</p>';
 for(const b of $('recordForm').querySelectorAll('[data-pickstop]'))b.onclick=()=>{chosenStops.push(b.dataset.pickstop);renderStops();};
 for(const b of $('recordForm').querySelectorAll('[data-unpick]'))b.onclick=()=>{chosenStops.splice(Number(b.dataset.unpick),1);renderStops();};
 for(const b of $('recordForm').querySelectorAll('[data-up]'))b.onclick=()=>{const i=Number(b.dataset.up);if(i>0)[chosenStops[i],chosenStops[i-1]]=[chosenStops[i-1],chosenStops[i]];renderStops();};
 for(const b of $('recordForm').querySelectorAll('[data-down]'))b.onclick=()=>{const i=Number(b.dataset.down);if(i<chosenStops.length-1)[chosenStops[i],chosenStops[i+1]]=[chosenStops[i+1],chosenStops[i]];renderStops();};
}
async function persist(kind,record){if(mode==='online'){await request('POST',{kind,record});}else localSave();}
async function saveRecord(e){
 e.preventDefault();if(busy)return;
 const v=Object.fromEntries(new FormData(e.currentTarget).entries());v.id=editing||'item-'+crypto.randomUUID();
 if(tab==='rotas')v.paradas=[...chosenStops];
 const old=data[tab].find(x=>x.id===editing);
 busy=true;
 try{
   if(mode==='online')await persist(tab,v);
   data[tab]=old?data[tab].map(x=>x.id===editing?v:x):[...data[tab],v];
   if(mode==='draft')localSave();
   editing=null;chosenStops=[];render();status(mode==='online'?'Cadastro salvo no banco! '+(v.status==='publicado'?'Publicado no site.':'Permanece em rascunho.'):'Rascunho salvo apenas neste dispositivo.');
 }catch(err){status('Não foi possível salvar: '+err.message,true);}finally{busy=false;}
}
async function deleteRecord(kind,id){
 if(!confirm('Excluir este registro? A exclusão também remove sua publicação.'))return;
 try{
  if(mode==='online')await request('DELETE',{kind,id});
  data[kind]=data[kind].filter(x=>x.id!==id);if(mode==='draft')localSave();
  editing=null;chosenStops=[];render();status('Registro excluído.');
 }catch(e){status('Erro ao excluir: '+e.message,true);}
}
function renderListing(){
 const records=data[tab];
 $('listing').innerHTML='<h3 class="font-black text-lg mb-3">Cadastrados ('+records.length+')</h3>'+(records.length?records.map(r=>'<article class="item mb-3 flex flex-wrap items-center gap-3"><div class="flex-1 min-w-0"><div class="flex gap-2 items-center flex-wrap"><strong>'+esc(r.nome)+'</strong><span class="badge '+(r.status==='publicado'?'published':'')+'">'+(r.status==='publicado'?'Publicado':'Rascunho')+'</span></div><p class="muted text-sm mt-1">'+esc(r.descricao||r.endereco||'')+'</p>'+(r.destinoId?'<p class="muted text-xs mt-1">Destino: '+esc(data.destinos.find(d=>d.id===r.destinoId)?.nome||'não encontrado')+'</p>':'')+(r.maps?'<a class="underline text-orange-300 text-xs" href="'+esc(r.maps)+'" target="_blank" rel="noopener noreferrer">Ver no Google Maps ↗</a>':'')+'</div><button class="alt" data-edit="'+esc(r.id)+'">Editar</button><button class="alt text-red-300" data-delete="'+esc(r.id)+'">Excluir</button></article>').join(''):'<p class="muted text-sm">Nenhum item cadastrado ainda.</p>');
 $('listing').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=b.dataset.edit;chosenStops=[...(data[tab].find(x=>x.id===editing)?.paradas||[])];render();$('formMount').scrollIntoView({behavior:'smooth',block:'start'});});
 $('listing').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRecord(tab,b.dataset.delete));
}
function renderBackup(){
 $('formMount').innerHTML='<p class="muted text-sm">Exporte uma cópia JSON dos cadastros. A importação abaixo é permitida apenas no modo local e não altera registros na nuvem.</p><div class="flex flex-wrap gap-3 mt-5"><button id="export" class="btn">Exportar JSON</button>'+(mode==='draft'?'<label class="alt cursor-pointer">Importar rascunhos <input id="import" type="file" accept=".json,application/json" hidden></label>':'')+'</div>';
 $('listing').innerHTML='';
 $('export').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='asphalt-boys-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);};
 if(mode==='draft')$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const obj=JSON.parse(await f.text());if(!validData(obj))throw Error('Formato inválido');if(confirm('Substituir os rascunhos locais?')){data=obj;localSave();render();}}catch(e){status(e.message,true);}};
}
function render(){
 $('tabTitle').textContent=LABELS[tab];
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
 if(tab==='backup')renderBackup();else{renderEditor();renderListing();}
}
$('loginForm').onsubmit=e=>{e.preventDefault();enter($('token').value);};
$('draftBtn').onclick=()=>{data=localRead();tab='destinos';editing=null;chosenStops=[];switchView('draft');status('Modo rascunho: estes dados não aparecem no site.');};
$('exitBtn').onclick=()=>{sessionStorage.removeItem(SESSION);token='';data={destinos:[],paradas:[],rotas:[]};editing=null;switchView('gate');$('gateMessage').textContent='Você saiu do painel.';};
$('refreshBtn').onclick=async()=>{if(mode==='online'){try{const v=await request('GET');if(!validData(v))throw Error('Resposta inválida');data=v;editing=null;render();status('Dados atualizados do banco.');}catch(e){status('Erro: '+e.message,true);}}else{data=localRead();render();status('Rascunhos recarregados.');}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;editing=null;chosenStops=[];render();status('');});
const existing=sessionStorage.getItem(SESSION);if(existing)enter(existing);
else fetch(API,{cache:'no-store'}).then(r=>{if(r.status===503)$('gateMessage').textContent='Banco D1 ainda não configurado. O painel da nuvem será liberado após a configuração na Cloudflare.';}).catch(()=>{});
})();