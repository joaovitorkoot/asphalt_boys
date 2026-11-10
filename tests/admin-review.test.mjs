import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {onRequestPatch,onRequestDelete} from '../functions/api/visitor-suggestions.js';
import {onRequestPost as suggestCategories} from '../functions/api/category-suggest.js';

const admin=fs.readFileSync('admin.html','utf8');
const review=fs.readFileSync('visitor-suggestions-admin.js','utf8');
const pageScript=admin.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const photo1='/api/image?id=11111111-1111-4111-8111-111111111111';
const photo2='/api/image?id=22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const cookie='__Host-ab_admin='+'A'.repeat(43);
const url='https://asphalt-boys.pages.dev/api/visitor-suggestions';

function mockDb(){
 const state={
  suggestion:{status:'pendente',payload:JSON.stringify({visitorName:'Cachoeira do Cipó',
   mapsUrl:'https://maps.app.goo.gl/teste',destinationMode:'existente',
   destinationId:'guaramiranga',destinationName:'',photos:[photo1,photo2]})},
  stops:[],destinations:[]
 };
 const db={
  prepare(sql){
   let args=[];
   const stmt={
    bind(...items){args=items;return stmt;},
    async first(){
     if(sql.startsWith('SELECT expires_at'))return {expires_at:Math.floor(Date.now()/1000)+600};
     if(sql.startsWith('SELECT email,salt,password_hash'))return {email:'admin@example.test'};
     if(sql.startsWith('SELECT status,payload FROM ab_visitor_suggestions'))return state.suggestion?{...state.suggestion}:null;
     if(sql.startsWith('SELECT status FROM ab_visitor_suggestions'))return state.suggestion?{status:state.suggestion.status}:null;
     if(sql.startsWith('SELECT id FROM site_content'))return null;
     return null;
    },
    async all(){return {results:[]}},
    async run(){
     if(sql.startsWith("UPDATE ab_visitor_suggestions SET status='pendente'")){state.suggestion.status='pendente';}
     if(sql.startsWith('DELETE FROM ab_visitor_suggestions')){state.suggestion=null;}
     if(sql.startsWith('UPDATE ab_visitor_suggestions SET payload=')){
      state.suggestion.payload=args[0];
      state.suggestion.status=sql.includes("status='rascunho'")?'rascunho':'publicado';
     }
     if(sql.startsWith('INSERT INTO site_content(')){
      const kind=sql.includes("'paradas'")?'paradas':'destinos';
      const payload=JSON.parse(args[kind==='paradas'?2:1]);
      state[kind==='paradas'?'stops':'destinations'].push(payload);
     }
     return {meta:{changes:1}};
    }
   };
   return stmt;
  },
  async batch(queries){for(const q of queries)await q.run()}
 };
 return {db,state};
}
function request(body){
 return new Request(url,{method:'PATCH',headers:{Origin:'https://asphalt-boys.pages.dev',
  Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
function payload(extra={}){
 return {id,action:'publicar',approvedName:'Cachoeira do Cipó',
  nameChoice:'visitante',mapsUrl:'https://maps.app.goo.gl/teste',
  chosenDestinationMode:'existente',chosenDestinationId:'guaramiranga',
  selectedPhoto:photo2,selectedCategories:['cafe','turismo'],...extra};
}
test('JS do painel e formulário de visitantes continuam com sintaxe válida',()=>{
 assert(pageScript,'O painel deve manter seu script');
 new vm.Script(pageScript);new vm.Script(review);
 assert(admin.includes('id="adminVisitorTab"'));
 for(const tab of ['destinos','paradas','rotas','backup','motos'])
  assert(admin.includes('data-tab="'+tab+'"'));
 assert(admin.includes('id="adminMoreMenu"'));
 assert(review.includes('id="abPhotoOptions"'));
 assert(review.includes('name="abCategories"'));
 assert(review.includes("'/api/category-suggest'"));
 assert(review.includes('selectedPhoto,selectedCategories'));
 assert(review.includes('id="abDeleteSuggestion"'));
 assert(review.includes('id="abReopenSuggestion"'));
 assert(review.includes('id="abOpenPublishedStop"'));
 assert(review.includes('async function deleteSuggestion('));
 assert(admin.includes('.photoFrameChoice:has(input:checked)'));
 assert(admin.includes('.ab-category-check'));
});
test('foto falsa e categoria desconhecida são rejeitadas',async()=>{
 const {db}=mockDb();
 let response=await onRequestPatch({request:request(payload({selectedPhoto:'/api/image?id=44444444-4444-4444-8444-444444444444'})),env:{DB:db}});
 assert.equal(response.status,422);
 response=await onRequestPatch({request:request(payload({selectedCategories:['hack']})),env:{DB:db}});
 assert.equal(response.status,422);
});
test('publicação exige categoria e escolha explícita de foto',async()=>{
 const {db}=mockDb();
 let response=await onRequestPatch({request:request(payload({selectedCategories:[]})),env:{DB:db}});
 assert.equal(response.status,422);
 response=await onRequestPatch({request:request(payload({selectedPhoto:''})),env:{DB:db}});
 assert.equal(response.status,422);
});
test('salvar mantém as escolhas e publicar respeita foto e duas categorias',async()=>{
 const {db,state}=mockDb();
 let response=await onRequestPatch({request:request(payload({action:'salvar'})),env:{DB:db}});
 assert.equal(response.status,200,await response.text());
 assert.equal(state.suggestion.status,'rascunho');
 assert.equal(JSON.parse(state.suggestion.payload).selectedPhoto,photo2);
 assert.deepEqual(JSON.parse(state.suggestion.payload).selectedCategories,['cafe','turismo']);
 response=await onRequestPatch({request:request(payload()),env:{DB:db}});
 assert.equal(response.status,200,await response.text());
 assert.equal(state.stops.length,1);
 const stop=state.stops[0];
 assert.equal(stop.foto,photo2,'não pode escolher automaticamente a primeira foto');
 assert.equal(stop.categoria,'cafe');
 assert.deepEqual(stop.categorias,['cafe','turismo']);
 assert.equal(stop.destinoId,'guaramiranga');
 assert.equal(state.suggestion.status,'publicado');
});
test('a API de categorias aceita somente sessão e origem autorizadas',async()=>{
 const {db}=mockDb();
 const target='https://asphalt-boys.pages.dev/api/category-suggest';
 const body=JSON.stringify({placeId:'ChIJtestPlace123'});
 const notLogged=await suggestCategories({request:new Request(target,{method:'POST',
  headers:{Origin:'https://asphalt-boys.pages.dev','Content-Type':'application/json'},body}),
  env:{DB:db,GOOGLE_PLACES_API_KEY:'test'}});
 assert.equal(notLogged.status,401);
 const wrongOrigin=await suggestCategories({request:new Request(target,{method:'POST',
  headers:{Origin:'https://evil.example',Cookie:cookie,'Content-Type':'application/json'},body}),
  env:{DB:db,GOOGLE_PLACES_API_KEY:'test'}});
 assert.equal(wrongOrigin.status,401);
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({displayName:{text:'Cafeteria Mirante'},
  types:['cafe','tourist_attraction'],businessStatus:'OPERATIONAL',
  regularOpeningHours:{weekdayDescriptions:['Segunda: 8h às 18h']}}),{status:200});
 try{
  const ok=await suggestCategories({request:new Request(target,{method:'POST',
   headers:{Origin:'https://asphalt-boys.pages.dev',Cookie:cookie,
   'Content-Type':'application/json'},body}),env:{DB:db,GOOGLE_PLACES_API_KEY:'test'}});
  assert.equal(ok.status,200);
  const answer=await ok.json();
  assert(answer.suggestions.some(x=>x.id==='cafe'));
  assert(answer.suggestions.some(x=>x.id==='turismo'));
  assert(answer.hours.length>0);
 }finally{globalThis.fetch=previousFetch}
});

test('sugestão rejeitada pode ser reaberta para edição',async()=>{
 const {db,state}=mockDb();
 state.suggestion.status='rejeitada';
 const response=await onRequestPatch({request:request({id,action:'reabrir'}),env:{DB:db}});
 assert.equal(response.status,200);
 assert.equal(state.suggestion.status,'pendente');
});
test('sugestão publicada permanece protegida contra reabertura e republicação',async()=>{
 const {db,state}=mockDb();
 state.suggestion.status='publicado';
 const rejected=await onRequestPatch({request:request({id,action:'reabrir'}),env:{DB:db}});
 assert.equal(rejected.status,409);
 const published=await onRequestPatch({request:request(payload()),env:{DB:db}});
 assert.equal(published.status,409);
 assert.equal(state.stops.length,0);
});
function deleteRequest(body,origin='https://asphalt-boys.pages.dev',logged=true){
 return new Request(url,{method:'DELETE',headers:{Origin:origin,
  ...(logged?{Cookie:cookie}:{}),'Content-Type':'application/json'},
  body:JSON.stringify(body)});
}
test('exclusão remove uma sugestão pendente e não toca nas paradas',async()=>{
 const {db,state}=mockDb();
 const response=await onRequestDelete({request:deleteRequest({id}),env:{DB:db}});
 assert.equal(response.status,200);
 assert.equal(state.suggestion,null);
 assert.equal(state.stops.length,0);
});
test('histórico publicado só pode ser excluído explicitamente, sem apagar o cadastro',async()=>{
 const {db,state}=mockDb();
 state.suggestion.status='publicado';
 state.stops.push({id:'parada-morro-branco',nome:'Restaurante Morro Branco'});
 let response=await onRequestDelete({request:deleteRequest({id}),env:{DB:db}});
 assert.equal(response.status,422);
 assert.equal(state.stops.length,1);
 response=await onRequestDelete({request:deleteRequest({id,deleteOnlyHistory:true}),env:{DB:db}});
 assert.equal(response.status,200);
 assert.equal(state.suggestion,null);
 assert.equal(state.stops[0].nome,'Restaurante Morro Branco');
});
test('exclusão de sugestão exige sessão válida e origem correta',async()=>{
 const {db,state}=mockDb();
 let response=await onRequestDelete({request:deleteRequest({id},'https://evil.example'),env:{DB:db}});
 assert.equal(response.status,403);
 response=await onRequestDelete({request:deleteRequest({id},'https://asphalt-boys.pages.dev',false),env:{DB:db}});
 assert.equal(response.status,401);
 assert(state.suggestion);
});
