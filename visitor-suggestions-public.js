// Asphalt Boys: formulário público de sugestões (sem publicação automática).
(()=>{
 const section=document.getElementById('destinos');if(!section)return;
 const css=document.createElement('style');
 css.textContent=`
 #abSuggest{margin-top:27px;padding:22px;background:#181c22;border:1px solid #8e562e;border-radius:18px;color:#f7f7f7}
 #abSuggest h3{font-size:clamp(21px,3vw,27px);font-weight:900;margin:4px 0}
 #abSuggest p{font-size:13px;color:#bec5d1;line-height:1.6;margin:5px 0 12px}
 #abSuggest label{display:block;font-size:13px;font-weight:800;margin:16px 0 6px}
 #abSuggest input:not([type=file]),#abSuggest select{background:#272d35;border:1px solid #666e7b;border-radius:9px;color:white;width:100%;min-height:44px;padding:11px;font-size:15px}
 #abSuggest input:focus,#abSuggest select:focus{outline:2px solid #fb923c}
 #abSuggest button{font:inherit;cursor:pointer}
 #abSuggest .primary{background:#fb923c;color:#130e09;border:0;border-radius:10px;padding:12px 17px;font-weight:850;min-height:44px}
 #abSuggest .primary:disabled{opacity:.5}
 #abSuggest .mapcheck{display:inline-block;border:1px solid #6b7280;padding:10px 13px;border-radius:10px;color:#ffba8a;text-decoration:none;font-size:13px;font-weight:750}
 #abSuggest .mapcheck[aria-disabled=true]{pointer-events:none;opacity:.45}
 #abSuggest .boxform{border-top:1px solid #40464f;padding-top:8px;margin-top:18px}
 #abSuggest .photos{border:1px dashed #666f7b;background:#252a32;padding:12px;border-radius:10px;min-width:0;overflow-wrap:anywhere}
 #abSuggest .photoTitle{display:block;font-size:13px;font-weight:800;margin:16px 0 6px}
 #abSuggest .photoPicker{display:inline-flex;align-items:center;justify-content:center;max-width:100%;min-height:44px;margin:0;padding:10px 16px;border:1px solid #fb923c;border-radius:10px;color:#ffba8a;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap}
 #abSuggest .photoPicker:focus-within{outline:2px solid #fb923c;outline-offset:2px}
 #abSuggest .photoPicker input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}
 #abSuggest .thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
 #abSuggest .thumbs img{height:90px;width:100%;object-fit:cover;border-radius:9px}
 #abSuggest [hidden]{display:none!important}
 #abSuggest .note{font-size:12px;color:#cbd5e1;line-height:1.55}
 #abSuggest #abSuggestMsg:empty{display:none}
 @media(max-width:500px){#abSuggest{padding:16px}#abSuggest .primary{width:100%}}
 `;
 document.head.append(css);
 const wrap=document.createElement('section');wrap.id='abSuggest';
 wrap.innerHTML=`
  <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
   <div><div style="font-size:11px;font-weight:800;letter-spacing:.11em;color:#fb923c">SUGIRA UMA PARADA</div>
   <h3>📍 Conhece um lugar incrível?</h3><p>Compartilhe sua descoberta com outros motociclistas!</p></div>
   <button id="abSuggestOpen" class="primary" type="button" aria-expanded="false">Indicar um lugar</button>
  </div>
  <div id="abSuggestArea" class="boxform" hidden>
   <form id="abSuggestForm">
    <label for="abSuggestMaps">1. Link do Google Maps *</label>
    <input id="abSuggestMaps" type="url" maxlength="1200" placeholder="Cole o link do Google Maps" autocomplete="off" required>
    <p class="note" id="abSuggestLinkInfo" role="status">Confira se o link abre o lugar correto.</p>
    <a id="abSuggestVerify" class="mapcheck" target="_blank" rel="noopener noreferrer" aria-disabled="true">↗ Ver no Google Maps</a>
    <label for="abSuggestName">2. Nome do local (opcional)</label>
    <input id="abSuggestName" minlength="3" maxlength="120" placeholder="Ex.: Cachoeira, mirante, restaurante">
    <label for="abSuggestDestination">3. Para qual viagem é a sugestão? *</label>
    <select id="abSuggestDestination" required>
     <option value="guaramiranga">Guaramiranga</option>
     <option value="canoa-quebrada">Canoa Quebrada</option>
     <option value="__novo">Outro destino</option>
    </select>
    <div id="abSuggestNewArea" hidden><label for="abSuggestNew">Nome do novo destino *</label>
     <input id="abSuggestNew" maxlength="120" placeholder="Ex.: Morro Branco">
     <p class="note">Esse nome será exibido ao administrador.</p></div>
    <span class="photoTitle">4. Fotos (opcional, até 3)</span>
    <div class="photos"><label class="photoPicker"><input id="abSuggestPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple>Escolher arquivos</label>
     <div id="abSuggestThumbs" class="thumbs" aria-live="polite"></div></div>
    <p id="abSuggestMsg" role="status" aria-live="polite" class="note"></p>
    <button type="submit" id="abSuggestSend" class="primary">Enviar sugestão</button>
   </form>
  </div>`;
 const cards=document.getElementById('cards');if(cards?.parentElement===section)cards.insertAdjacentElement('afterend',wrap);else section.append(wrap);
 const $=id=>wrap.querySelector('#'+id);
 const area=$('abSuggestArea'),open=$('abSuggestOpen'),maps=$('abSuggestMaps'),dest=$('abSuggestDestination');
 const newArea=$('abSuggestNewArea'),newName=$('abSuggestNew'),photos=$('abSuggestPhotos'),thumbs=$('abSuggestThumbs'),msg=$('abSuggestMsg'),send=$('abSuggestSend');
 let previewURLs=[];
 function official(raw){
  try{const u=new URL(raw.trim()),h=u.hostname.toLowerCase(),domains=['google.com','google.com.br','google.pt','google.co.uk','google.es','google.ca','google.fr','google.de','google.com.mx','google.com.ar'];
   const google=domains.some(d=>h===d||h.endsWith('.'+d));
   return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<=1200&&
    ((h==='maps.app.goo.gl'&&u.pathname.length>1)||(h==='goo.gl'&&u.pathname.startsWith('/maps/'))||
    (google&&(u.pathname.startsWith('/maps')||u.pathname.startsWith('/search')||u.searchParams.has('q')||u.searchParams.has('query'))))?u.href:'';
  }catch{return ''}
 }
 open.onclick=()=>{area.hidden=!area.hidden;open.setAttribute('aria-expanded',String(!area.hidden));open.textContent=area.hidden?'Indicar um lugar':'Fechar formulário';if(!area.hidden)maps.focus()};
 maps.oninput=()=>{const url=official(maps.value),btn=$('abSuggestVerify');btn.setAttribute('aria-disabled',String(!url));if(url)btn.href=url;else btn.removeAttribute('href');$('abSuggestLinkInfo').textContent=url?'✓ Link reconhecido. Abra para conferir o local.':'Cole somente um link HTTPS verdadeiro do Google Maps.'};
 dest.onchange=()=>{newArea.hidden=dest.value!=='__novo';newName.required=!newArea.hidden};
 (async()=>{try{const r=await fetch('/api/content',{cache:'no-store'});if(!r.ok)return;const data=await r.json();const known=new Set(['guaramiranga','canoa-quebrada']);
  for(const d of data.destinos||[]){if(!d?.id||!d.nome||known.has(d.id))continue;known.add(d.id);const o=document.createElement('option');o.value=d.id;o.textContent=d.nome;dest.insertBefore(o,dest.lastElementChild)}
 }catch{}})();
 function clearPreviews(){previewURLs.forEach(x=>URL.revokeObjectURL(x));previewURLs=[];thumbs.replaceChildren()}
 photos.onchange=()=>{clearPreviews();const files=Array.from(photos.files||[]);if(files.length>3){photos.value='';msg.textContent='Selecione no máximo três fotos.';return}
  if(files.some(f=>f.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))){msg.textContent='Use fotos JPEG, PNG ou WebP com até 10 MB.';return}
  msg.textContent='';files.forEach(f=>{const url=URL.createObjectURL(f),img=document.createElement('img');previewURLs.push(url);img.src=url;img.alt='Prévia de '+f.name;thumbs.append(img)})};
 async function compress(file){
  let bitmap=null,source=null;
  try{
   if(window.createImageBitmap){bitmap=await createImageBitmap(file);source=bitmap}
   else{const url=URL.createObjectURL(file);try{source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url})}finally{URL.revokeObjectURL(url)}}
   const w=source.width||source.naturalWidth,h=source.height||source.naturalHeight;
   if(!w||!h)throw Error('Foto inválida.');
   const c=document.createElement('canvas');
   for(const max of [1600,1200,960,780,620,480]){
    const ratio=Math.min(1,max/Math.max(w,h));c.width=Math.max(1,Math.round(w*ratio));c.height=Math.max(1,Math.round(h*ratio));
    const x=c.getContext('2d');if(!x)throw Error('Não foi possível otimizar a foto.');
    x.fillStyle='#ffffff';x.fillRect(0,0,c.width,c.height);x.drawImage(source,0,0,c.width,c.height);
    for(const quality of [.82,.72,.62,.5,.38]){
     const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',quality));
     if(blob?.type==='image/webp'&&blob.size>=100&&blob.size<=180000)return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
    }
   }
   throw Error('Não foi possível reduzir uma das fotos. Escolha outra imagem.');
  }finally{bitmap?.close?.()}
 }
 $('abSuggestForm').onsubmit=async e=>{
  e.preventDefault();if(send.disabled)return;
  const url=official(maps.value),name=$('abSuggestName').value.trim(),files=Array.from(photos.files||[]);
  if(!url){msg.textContent='Informe um link verdadeiro do Google Maps.';return}
  if(name&&name.length<3){msg.textContent='Se informar o nome do local, use pelo menos 3 caracteres.';return}
  if(dest.value==='__novo'&&newName.value.trim().length<3){msg.textContent='Informe o nome do novo destino.';return}
  if(files.length>3||files.some(f=>f.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))){msg.textContent='Escolha até três fotos JPEG, PNG ou WebP de no máximo 10 MB.';return}
  send.disabled=true;msg.textContent='Otimizando fotos e enviando...';
  try{
   const data=new FormData();data.set('placeName',name);data.set('mapsUrl',url);
   data.set('destinationMode',dest.value==='__novo'?'novo':'existente');data.set('destinationId',dest.value==='__novo'?'':dest.value);
   data.set('destinationName',dest.value==='__novo'?newName.value.trim():'');
   for(const f of files)data.append('photos',await compress(f));
   const r=await fetch('/api/visitor-suggestions',{method:'POST',credentials:'same-origin',cache:'no-store',body:data});
   const result=await r.json();if(!r.ok)throw Error(result.error||'Falha no envio.');
   msg.textContent='✓ Sugestão recebida! Será analisada antes de aparecer no site.';
   $('abSuggestForm').reset();clearPreviews();newArea.hidden=true;maps.oninput();
  }catch(error){msg.textContent='⚠️ '+String(error.message||error)}
  finally{send.disabled=false}
 };
})();