// Diagnóstico mínimo da configuração do projeto (sem mostrar credenciais).
// Não valida senhas e não executa nenhuma operação administrativa.
export function onRequestGet({env}){
  return new Response(JSON.stringify({
    databaseReady:Boolean(env.DB),
    adminSecretPresent:typeof env.ADMIN_TOKEN==="string"&&env.ADMIN_TOKEN.trim().length>0,
    adminReady:typeof env.ADMIN_TOKEN==="string"&&env.ADMIN_TOKEN.trim().length>=20,
    googleReady:typeof env.GOOGLE_PLACES_API_KEY==="string"&&env.GOOGLE_PLACES_API_KEY.trim().length>0
  }),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
