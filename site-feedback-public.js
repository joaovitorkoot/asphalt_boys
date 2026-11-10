/* Formulários públicos de sugestões. Não publicam conteúdo automaticamente. */
(()=>{
 'use strict';
 const accessory=document.getElementById('abSuggestAccessoriesMount');
 const improvement=document.getElementById('abSuggestImprovementMount');
 if(!accessory&&!improvement)return;
 const accessoryHtml=`
  <div class="abFeedbackCard">
   <div class="abFeedbackHead"><span class="abFeedbackIcon" aria-hidden="true">🏍️</span><div><h2>Sugira um acessório</h2><p>Qual acessório você gostaria de encontrar aqui?</p></div></div>
   <form data-feedback-kind="accessory">
    <label>Nome do acessório<input name="title" required maxlength="120" minlength="3" autocomplete="off" placeholder="Ex.: Suporte para celular"></label>
    <label>Categoria<select name="category"><option>Suportes</option><option>Capacetes e proteção</option><option>Bolsas e bagageiros</option><option>Iluminação</option><option>Outros acessórios</option></select></label>
    <label>Link do acessório (opcional)<input name="link" type="url" maxlength="700" inputmode="url" placeholder="https://..."></label>
    <button type="submit">↗ Enviar sugestão</button><p class="abFeedbackStatus" role="status" aria-live="polite"></p>
   </form>
  </div>`;
 const improvementHtml=`
  <div class="abFeedbackCard">
   <div class="abFeedbackHead"><span class="abFeedbackIcon" aria-hidden="true">💡</span><div><h2>Ajude a melhorar o site</h2><p>O que você gostaria de ver no Asphalt Boys?</p></div></div>
   <form data-feedback-kind="improvement">
    <label>Sua ideia<textarea name="details" required minlength="5" maxlength="1500" placeholder="Escreva sua ideia aqui..."></textarea></label>
    <button type="submit">↗ Enviar melhoria</button><p class="abFeedbackStatus" role="status" aria-live="polite"></p>
   </form>
  </div>`;
 if(accessory){accessory.className='abFeedback';accessory.setAttribute('aria-label','Sugestões de acessórios');accessory.innerHTML=accessoryHtml}
 if(improvement){improvement.className='abFeedback';improvement.setAttribute('aria-label','Sugestões de melhorias');improvement.innerHTML=improvementHtml}
 document.querySelectorAll('[data-feedback-kind]').forEach(form=>{
  const msg=form.querySelector('.abFeedbackStatus'),send=form.querySelector('button[type=submit]');
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(send.disabled||!form.reportValidity())return;
   const kind=form.dataset.feedbackKind;
   const title=String(form.elements.title?.value||'').trim();
   const details=String(form.elements.details?.value||'').trim();
   const category=String(form.elements.category?.value||'').trim();
   const link=String(form.elements.link?.value||'').trim();
   if(link){try{const u=new URL(link);if(u.protocol!=='https:')throw Error('HTTPS');}catch{msg.textContent='Cole um link HTTPS válido para o acessório.';msg.dataset.ok='false';return}}
   send.disabled=true;msg.dataset.ok='false';msg.textContent='Enviando sugestão...';
   try{
    const res=await fetch('/api/site-feedback',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,title,details,category,link})});
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'Não foi possível enviar.');
    form.reset();msg.dataset.ok='true';msg.textContent='✓ Sugestão recebida! Obrigado por ajudar a melhorar o Asphalt Boys.';
   }catch(error){msg.dataset.ok='false';msg.textContent='⚠️ '+String(error.message||error)}
   finally{send.disabled=false}
  });
 });
})();
