/**
 * Asphalt Boys — aviso de nova sugestão via Gmail.
 * Publique como Web App: Executar como "Eu"; acesso "Qualquer pessoa".
 * As chamadas são autenticadas com um segredo de 30+ caracteres.
 * Não publica conteúdo no site: só envia aviso ao proprietário.
 */
function abResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function abRecipient() {
  var p = PropertiesService.getScriptProperties();
  var recipient = String(p.getProperty('AB_NOTIFY_EMAIL') || '').trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) ? recipient : '';
}
function doPost(e) {
  var lock = null;
  try {
    var props = PropertiesService.getScriptProperties();
    var token = String(props.getProperty('AB_NOTIFY_TOKEN') || '');
    if (token.length < 30) return abResponse({ok:false,error:'not-configured'});
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 4000)
      return abResponse({ok:false,error:'bad-request'});
    var input = JSON.parse(e.postData.contents);
    if (typeof input.token !== 'string' || input.token !== token)
      return abResponse({ok:false,error:'unauthorized'});
    var id = String(input.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return abResponse({ok:false,error:'bad-id'});
    var to = abRecipient();
    if (!to) return abResponse({ok:false,error:'recipient-not-configured'});
    if (MailApp.getRemainingDailyQuota() < 1)
      return abResponse({ok:false,error:'mail-quota'});
    var subject = String(input.subject || '').slice(0,140);
    var body = String(input.text || '').slice(0,2500);
    if (!subject || !body) return abResponse({ok:false,error:'empty-message'});
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return abResponse({ok:false,error:'busy'});
    var cache = CacheService.getScriptCache();
    var key = 'ab_sent_' + id.replace(/-/g, '');
    if (cache.get(key)) return abResponse({ok:true,alreadySent:true});
    MailApp.sendEmail({to:to,subject:subject,body:body,name:'Asphalt Boys'});
    cache.put(key,'1',21600);
    return abResponse({ok:true});
  } catch (err) {
    console.error('Asphalt Boys email failure',String(err && err.name || 'Error'));
    return abResponse({ok:false,error:'send-failed'});
  } finally {
    if (lock) {
      try {lock.releaseLock()} catch(ignore) {}
    }
  }
}
/**
 * Execute uma vez pelo editor para liberar permissão de envio e testar.
 * Envia só para AB_NOTIFY_EMAIL, salvo nas propriedades do script.
 */
function testarNotificacao() {
  var to = abRecipient();
  if (!to) throw new Error('Defina AB_NOTIFY_EMAIL nas propriedades do script.');
  MailApp.sendEmail({
    to:to,
    subject:'Teste de aviso — Asphalt Boys',
    body:'Teste concluído. Quando o webhook for ativado no Cloudflare Pages, você receberá avisos de novas sugestões.',
    name:'Asphalt Boys'
  });
  console.log('E-mail de teste enviado com sucesso.');
}
