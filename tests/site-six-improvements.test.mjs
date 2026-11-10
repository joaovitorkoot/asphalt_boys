import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {onRequestPost,onRequestGet,onRequestDelete} from '../functions/api/site-feedback.js';

const read=p=>fs.readFileSync(p,'utf8');
const main=read('index.html'),motos=read('motos.html'),admin=read('admin.html');
const planner=read('planejador.js'),bike=read('motos-v2.js');
const publicForm=read('site-feedback-public.js'),adminForm=read('site-feedback-admin.js');
const css=read('site-feedback.css');
const endpoint='https://asphalt-boys.pages.dev/api/site-feedback';
const cookie='__Host-ab_admin='+'A'.repeat(43);
const origin='https://asphalt-boys.pages.dev';
function request(method='POST',body={},headers={}){
 return new Request(endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
}
function mock(){
 const entries=[];
 const db={prepare(sql){
  let args=[];
  const stmt={
   bind(...values){args=values;return stmt},
   async run(){
    if(sql.startsWith('INSERT INTO ab_site_feedback'))entries.push({id:args[0],kind:args[1],title:args[2],details:args[3],category:args[4],link:args[5],visitor_hash:args[6],created_at:'2026-11-10'});
    if(sql.startsWith('DELETE FROM ab_site_feedback')){
     const at=entries.findIndex(x=>x.id===args[0]);if(at<0)return {meta:{changes:0}};entries.splice(at,1);return {meta:{changes:1}};
    }
    return {meta:{changes:0}};
   },
   async first(){
    if(sql.startsWith('SELECT COUNT(*) AS count'))return {count:entries.filter(x=>x.visitor_hash===args[0]).length};
    if(sql.startsWith('SELECT expires_at FROM ab_admin_sessions'))return {expires_at:Math.floor(Date.now()/1000)+3600};
    if(sql.startsWith('SELECT email,salt,password_hash'))return {email:'admin@example.com'};
    return null;
   },
   async all(){if(sql.startsWith('SELECT id,kind,title,details'))return {results:entries.slice().reverse()};return {results:[]}}
  };
  return stmt;
 }};
 return {env:{DB:db,ADMIN_TOKEN:'testing_secret_keep_private_123456789'},entries};
}
test('as seis melhorias continuam ligadas ao HTML atual sem substituir componentes',()=>{
 for(const [name,js] of [['planejador',planner],['motos',bike],['sugestões públicas',publicForm],['administração',adminForm]])
  assert.doesNotThrow(()=>new vm.Script(js),name+' tem erro de sintaxe');
 for(const page of [main,admin])for(const match of page.matchAll(/<script>([\s\S]*?)<\/script>/g))
  assert.doesNotThrow(()=>new vm.Script(match[1]),'script interno inválido');
 assert(main.includes('id="tripPreviewHours" class="abHoursWeek"'));
 assert(main.includes('id="tripCustomAddPanel"'));
 assert(main.includes('id="tripCustomCandidates"'));
 assert(main.includes('site-feedback-public.js'));
 assert(main.includes('planejador.js?v=20261110-'));
 assert(motos.includes('id="productShareDialog"'));
 assert(motos.includes('id="abSuggestAccessoriesMount"'));
 assert(motos.includes('id="abSuggestImprovementMount"'));
 assert(motos.includes('motos-v2.js?v=20261110-'));
 assert(admin.includes('site-feedback-admin.js'));
 assert(main.includes('id="tripDayGroups"'),'roteiros existentes preservados');
 assert(motos.includes('id="motoMontagem"'),'montagem existente preservada');
 assert(admin.includes('visitor-suggestions-admin.js'),'sugestões de paradas existentes preservadas');
});
test('calendário marca aberto e fechado sem inventar horários para dias desconhecidos',()=>{
 assert(planner.includes("const closed=/\\bfechad[oa]s?\\b/i.test(value)"));
 assert(planner.includes("const open=!closed&&value!=='Não informado'"));
 assert(planner.includes("row.className='abHoursRow'"));
 assert(main.includes('.abHoursRow.open .abHoursBadge'));
 assert(main.includes('.abHoursRow.closed .abHoursBadge'));
});
test('parada personalizada usa ponto confirmado e integra rota sem enviar IDs pessoais para o banco',()=>{
 assert(planner.includes("fetch('./api/origin-point'"));
 assert(planner.includes('validCoords(candidate.coordinate)'));
 assert(planner.includes('selected.push(id)'));
 assert(planner.includes('const existing=stops.filter(p=>!p.custom)'));
 assert(planner.includes('ids:existing.map(p=>p.id)'));
 assert(planner.includes("customStops:customStops.slice(0,MAX_ROUTE_STOPS)"));
 assert(planner.includes("u.searchParams.set('pontos',JSON.stringify(personal))"));
 assert(planner.includes("receiveSharedCustom(share.custom)"));
 assert(planner.includes('if(stop.custom)return stop'));
});
test('cada produto tem link direto e destaque sem publicar dados de compra',()=>{
 assert(bike.includes('data-share-model='));
 assert(bike.includes("u.searchParams.set('moto',bike().id)"));
 assert(bike.includes("u.searchParams.set('grupo',groupId)"));
 assert(bike.includes("u.searchParams.set('produto',modelId)"));
 assert(bike.includes("const card=[...$('motoModelos').querySelectorAll('[data-model-card]')].find"));
 assert(bike.includes("navigator.share"));
 assert(bike.includes("navigator.clipboard.writeText"));
 assert(motos.includes('class="product-share-modal"'));
});
test('paleta, espaçamento e cartões seguem a prévia e acessibilidade',()=>{
 assert(css.includes('#fb923c')&&css.includes('border-radius:20px'));
 assert(css.includes('prefers-reduced-motion'));
 assert(motos.includes('.product-share-modal'));
 assert(main.includes('.abCustomAddBtn'));
 assert(adminForm.includes("confirm('Excluir definitivamente esta sugestão?')"));
});
test('visitantes podem enviar acessórios e melhorias mas não ler sugestões privadas',async()=>{
 const {env,entries}=mock();
 const first=await onRequestPost({request:request('POST',{kind:'accessory',title:'Suporte para GPS',category:'Suportes',link:'https://example.com/gps'},{'CF-Connecting-IP':'203.0.113.1'}),env});
 assert.equal(first.status,201,await first.text());
 const second=await onRequestPost({request:request('POST',{kind:'improvement',details:'Adicionar filtro por cidade.'},{'CF-Connecting-IP':'203.0.113.2'}),env});
 assert.equal(second.status,201,await second.text());
 assert.equal(entries.length,2);
 assert.equal(entries[0].kind,'accessory');assert.equal(entries[1].kind,'improvement');
 const denied=await onRequestGet({request:request('GET'),env});assert.equal(denied.status,401);
 const response=await onRequestGet({request:request('GET',{}, {Cookie:cookie}),env});
 assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.suggestions.length,2);
 assert.equal(result.suggestions[0].details,'Adicionar filtro por cidade.');
});
test('recusa links inseguros, origem cruzada e envia no máximo 5 sugestões por hora por IP',async()=>{
 const {env}=mock();
 const bad=await onRequestPost({request:request('POST',{kind:'accessory',title:'GPS',link:'http://insecure.example'},{'CF-Connecting-IP':'203.0.113.9'}),env});
 assert.equal(bad.status,422);
 const forged=await onRequestPost({request:request('POST',{kind:'improvement',details:'O mapa pode melhorar?'},{Origin:'https://evil.example'}),env});
 assert.equal(forged.status,403);
 for(let i=0;i<5;i++){
  const res=await onRequestPost({request:request('POST',{kind:'improvement',details:'Ideia útil número '+i},{'CF-Connecting-IP':'203.0.113.9'}),env});
  assert.equal(res.status,201,'envio '+i+' deve passar');
 }
 const tooMany=await onRequestPost({request:request('POST',{kind:'improvement',details:'Mais uma ideia'},{'CF-Connecting-IP':'203.0.113.9'}),env});
 assert.equal(tooMany.status,429);
});
test('admin pode excluir mensagem individual após confirmação, visitante não',async()=>{
 const {env,entries}=mock();
 const added=await onRequestPost({request:request('POST',{kind:'improvement',details:'Sugiro novas fotos.'}),env});
 assert.equal(added.status,201);
 const id=entries[0].id;
 const denied=await onRequestDelete({request:request('DELETE',{id}),env});assert.equal(denied.status,403);
 assert.equal(entries.length,1);
 const success=await onRequestDelete({request:request('DELETE',{id},{Cookie:cookie}),env});
 assert.equal(success.status,200,await success.text());
 assert.equal(entries.length,0);
});
