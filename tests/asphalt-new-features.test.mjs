import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {onRequestPost,onRequestGet,onRequestDelete} from '../functions/api/site-feedback.js';

const index=fs.readFileSync('index.html','utf8');
const motoHtml=fs.readFileSync('motos.html','utf8');
const admin=fs.readFileSync('admin.html','utf8');
const planner=fs.readFileSync('planejador.js','utf8');
const motoJs=fs.readFileSync('motos-v2.js','utf8');
const feedbackPublic=fs.readFileSync('site-feedback-public.js','utf8');
const feedbackAdmin=fs.readFileSync('site-feedback-admin.js','utf8');
test('todos os scripts e o calendário são sintaticamente válidos',()=>{
 for(const [name,code] of Object.entries({planner,motoJs,feedbackPublic,feedbackAdmin}))
  assert.doesNotThrow(()=>new vm.Script(code),name);
 const inline=index.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 if(inline)assert.doesNotThrow(()=>new vm.Script(inline));
 assert(index.includes('id="tripCustomAddPanel"'));
 assert(index.includes('id="tripPreviewHours" class="abHoursWeek"'));
 assert(motoHtml.includes('id="productShareDialog"'));
 assert(motoHtml.includes('id="abSuggestAccessoriesMount"'));
 assert(motoHtml.includes('id="abSuggestImprovementMount"'));
 assert(index.includes('id="abSuggestImprovementMount"'));
 assert(admin.includes('site-feedback-admin.js'));
});
test('calendário diferencia fechado/vermelho e aberto/verde sem inventar dias',()=>{
 const start=planner.indexOf(' function displayHours('),end=planner.indexOf(' function preview(',start);
 assert(start>0&&end>start);
 const root={children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x)}};
 const createElement=()=>({children:[],append(...x){this.children.push(...x)}});
 const run=vm.runInNewContext(planner.slice(start,end)+';displayHours',{
  q:()=>root,document:{createElement}
 });
 run(['segunda-feira: Fechado','terça-feira: Fechado','quarta-feira: 09:00–17:00',
  'quinta-feira: 09:00–17:00','sexta-feira: 09:00–21:00',
  'sábado: 09:00–22:00','domingo: 07:30–16:00']);
 assert.equal(root.children.length,7);
 assert(root.children[0].className.includes('closed'));
 assert.equal(root.children[0].children[1].textContent,'Fechado');
 assert(root.children[2].className.includes('open'));
 assert.equal(root.children[2].children[1].textContent,'09:00–17:00');
 run(['Horário informado manualmente: 08:00–18:00']);
 assert.equal(root.children.length,1);
 assert(root.children[0].className.includes('abHoursManual'));
});
test('paradas pessoais precisam de ID, GPS real e ficam limitadas a vinte',()=>{
 const start=planner.indexOf(' function normalizeCustomStops('),end=planner.indexOf(' function currentStops()',start);
 assert(start>0&&end>start);
 const validCoords=s=>{const m=String(s).match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);return m&&Math.abs(+m[1])<=90&&Math.abs(+m[2])<=180?s:''};
 const funcs=vm.runInNewContext(planner.slice(start,end)+';({normalizeCustomStops,receiveSharedCustom})',{
  validCoords,validPlaceId:x=>/^[a-zA-Z0-9_-]{5,250}$/.test(x)?x:'',
  originMapURL:x=>String(x||'').startsWith('https://maps.app.goo.gl/')?x:'',
  MAX_ROUTE_STOPS:20,URL,encodeURIComponent,mapping:x=>x,destination:{id:'guaramiranga'}
 });
 const list=funcs.normalizeCustomStops([
  {id:'pessoal-abcdefgh',nome:'Mirante do teste',mapCoordinates:'-4.216,-38.959',maps:'https://maps.app.goo.gl/safe'},
  {id:'pessoal-00000000',nome:'Ponto inválido',mapCoordinates:'-400.5,-30.6'}
 ]);
 assert.equal(list.length,1);assert.equal(list[0].custom,true);
 assert.equal(list[0].mapCoordinates,'-4.216,-38.959');
 assert.equal(funcs.receiveSharedCustom(JSON.stringify([['pessoal-abcdefgh','Mirante do teste','-4.216,-38.959','ChIJ12345']])).length,1);
 assert(planner.includes('existing.map(p=>p.id)'));
 assert(planner.includes('if(stop.custom)return stop'));
 assert(planner.includes("u.searchParams.set('pontos'"));
});
test('link do acessório abre modelo correto em vez da página genérica',()=>{
 assert(motoJs.includes("u.searchParams.set('produto',modelId)"));
 assert(motoJs.includes("u.searchParams.set('moto',bike().id)"));
 assert(motoJs.includes("u.searchParams.set('grupo',groupId)"));
 assert(motoJs.includes('function applySharedProduct()'));
 assert(motoJs.includes('card.scrollIntoView'));
 assert(motoJs.includes('data-share-model'));
 assert(motoHtml.includes('productShareWhats'));
});
function mockDB(){
 const suggestions=[],database={
  prepare(sql){
   let params=[];const q={
    bind(...v){params=v;return q},
    async run(){
     if(sql.startsWith('INSERT INTO ab_site_feedback')){
      suggestions.push({id:params[0],kind:params[1],title:params[2],details:params[3],category:params[4],link:params[5],visitor_hash:params[6],created_at:'2026-11-10'});
     }else if(sql.startsWith('DELETE FROM ab_site_feedback')){
      const at=suggestions.findIndex(x=>x.id===params[0]);if(at>=0){suggestions.splice(at,1);return {meta:{changes:1}}}
      return {meta:{changes:0}};
     }
     return {meta:{changes:1}}
    },
    async first(){
     if(sql.startsWith('SELECT COUNT(*)'))return {count:0};
     if(sql.startsWith('SELECT expires_at'))return {expires_at:Math.floor(Date.now()/1000)+1000};
     if(sql.startsWith('SELECT email,salt'))return {email:'admin@example.com'};
     return null;
    },
    async all(){return {results:suggestions.map(x=>({...x}))}}
   };return q;
  }
 };
 return {database,suggestions};
}
const origin='https://asphalt-boys.pages.dev';
const cookie='__Host-ab_admin='+'A'.repeat(43);
function req(method,body,admin=false,validOrigin=true){
 return new Request(origin+'/api/site-feedback',{method,headers:{...(validOrigin?{Origin:origin}:{Origin:'https://evil.example'}),
  ...(admin?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
test('receber, ler e excluir sugestões: autenticação e proteção de acesso',async()=>{
 const {database,suggestions}=mockDB(),env={DB:database};
 let response=await onRequestPost({request:req('POST',{kind:'accessory',title:'Suporte de celular',category:'Suportes',link:'https://example.com/item'}),env});
 assert.equal(response.status,201,await response.text());
 assert.equal(suggestions.length,1);
 response=await onRequestPost({request:req('POST',{kind:'improvement',details:'Adicionar filtros por cidade'}),env});
 assert.equal(response.status,201);
 assert.equal(suggestions.length,2);
 response=await onRequestPost({request:req('POST',{kind:'improvement',details:'Ideia',link:'javascript:alert(1)'},false,false),env});
 assert.equal(response.status,403);
 response=await onRequestGet({request:req('GET',null),env});
 assert.equal(response.status,401);
 response=await onRequestGet({request:req('GET',null,true),env});
 assert.equal(response.status,200);
 assert.equal((await response.json()).suggestions.length,2);
 response=await onRequestDelete({request:req('DELETE',{id:suggestions[0].id},false),env});
 assert.equal(response.status,403);
 response=await onRequestDelete({request:req('DELETE',{id:suggestions[0].id},true),env});
 assert.equal(response.status,200);
 assert.equal(suggestions.length,1);
});
