# Avisos por Gmail — Asphalt Boys

O site permanece em https://asphalt-boys.pages.dev/ (sem domínio próprio). O formulário público salva a sugestão no D1 e a deixa pendente, independentemente de o e-mail ser enviado ou não.

A integração usa Google Apps Script (MailApp), autorizado na sua própria conta Gmail, para enviar **um aviso por sugestão**. Não altera os destinos automaticamente nem publica nada por e-mail.

## 1. Criar o script

1. Faça login no Gmail que deseja usar para receber os avisos.
2. Abra https://script.google.com/home/projects/create.
3. Apague o conteúdo inicial do arquivo `Code.gs` e copie o conteúdo de [Code.gs](./Code.gs) deste diretório.
4. Salve o projeto como "Asphalt Boys — Avisos".

## 2. Configurar as propriedades (não coloque senhas no GitHub)

No Apps Script, abra **Configurações do projeto** (engrenagem) → **Propriedades do script** e adicione:

| Propriedade | Valor |
| --- | --- |
| `AB_NOTIFY_EMAIL` | Seu endereço Gmail para receber os avisos (o mesmo e-mail da administração, se preferir). |
| `AB_NOTIFY_TOKEN` | Um segredo aleatório com **no mínimo 30 caracteres**, escolhido por você, sem espaços. |

Guarde `AB_NOTIFY_TOKEN` em local seguro. Não o coloque em arquivos públicos, capturas de tela ou mensagens do chat.

## 3. Autorizar o envio de e-mails

Na barra de funções do editor, selecione `testarNotificacao` e clique em **Executar**. O Google solicitará autorização para **enviar e-mails em seu nome**. Autorize apenas se for seu projeto e você reconhecer o código. Confirme que recebeu o e-mail de teste com o assunto "Teste de aviso — Asphalt Boys".

## 4. Implantar um aplicativo da web

Clique em **Implantar → Nova implantação → Aplicativo da Web** e configure:

- **Executar como:** Eu (proprietário da conta Gmail).
- **Quem pode acessar:** Qualquer pessoa. O endpoint público exige `AB_NOTIFY_TOKEN` secreto antes de enviar; não divulgue esse token.

Clique em **Implantar**, copie a **URL do aplicativo da Web**, terminada em `/exec`.

> Por que "Qualquer pessoa"? O servidor Cloudflare precisa chamar o script automaticamente, sem abrir login do Google. A autenticação específica deste endpoint é feita pelo token secreto, verificado no script.

## 5. Ligar o Apps Script à Cloudflare

No painel Cloudflare, abra **Workers & Pages → projeto Asphalt Boys → Settings → Variables and Secrets** (ou **Environment variables**), ambiente **Production**, e configure como **secrets**:

| Variável | Valor |
| --- | --- |
| `AB_GMAIL_WEBAPP_URL` | URL do aplicativo da Web do Apps Script, terminada em `/exec`. |
| `AB_GMAIL_WEBHOOK_TOKEN` | **Exatamente** o valor de `AB_NOTIFY_TOKEN` que você guardou nas propriedades do Google. |

Salve e faça um **novo deploy** do projeto Pages para as variáveis entrarem em vigor. Elas são lidas **somente pelo servidor**; não aparecem no formulário do visitante.

## 6. Teste real

1. No site público, envie uma sugestão de teste com link Google Maps e nome do local, sem precisar anexar foto.
2. Confira se apareceu em **Administração → Sugestões dos visitantes**, com o status **Pendente**.
3. Confira no Gmail a mensagem **"Nova sugestão de visitante — Asphalt Boys"**, contendo o nome, destino e atalho para administração.
4. Confira a pasta Spam se não chegar à caixa principal. No Apps Script, verifique **Execuções** para possíveis erros.

**Atenção:** Se o Apps Script ou o Gmail falhar, a sugestão continua salva no banco para moderação; o envio de e-mail não altera a publicação.

## Limites

Em contas pessoais Gmail, o Apps Script atualmente prevê até **100 destinatários de e-mail/dia** para serviços como o MailApp, sujeito a mudanças e outras cotas da conta. Consulte a [documentação oficial](https://developers.google.com/apps-script/guides/services/quotas?hl=pt-BR).

## Segurança e privacidade

- O Google Apps Script só envia ao `AB_NOTIFY_EMAIL` configurado no próprio script, nunca a um endereço fornecido por visitante.
- A chamada da Cloudflare exige dois segredos no servidor e nenhum deles aparece no GitHub nem no navegador.
- Não desative a validação de token; não cole segredos em tickets públicos.
- Revogue/rotacione `AB_NOTIFY_TOKEN` e atualize `AB_GMAIL_WEBHOOK_TOKEN` se houver suspeita de exposição.
- A URL do Apps Script é privada porque integra a conta de e-mail; evite compartilhá-la publicamente.

**Referência técnica**: https://developers.google.com/apps-script/guides/web
