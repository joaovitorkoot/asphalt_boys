# Asphalt Boys — configuração do painel e das rotas

O site usa **Cloudflare Pages** conectado ao GitHub (`main`). O código do painel e do planejador não requer serviços pagos para abrir rotas no Google Maps. Para salvar conteúdo de forma pública, é necessário configurar uma vez um banco **Cloudflare D1**. As fotos, avaliações e horários **não são importados automaticamente** do Google Maps apenas colando o link.

## O que já existe no código

- `admin.html`: destinos, paradas (café da manhã, almoço, turismo e descanso), rotas com ordem de paradas, rascunho/publicado, importação/exportação e conexão com banco.
- `index.html` e `planejador.js`: três abas (Montar rota, Rotas prontas, Meu roteiro), prévia com foto autorizada em destaque, endereço, link do Maps, Google Maps/Waze e compartilhamento do roteiro.
- `functions/api/content.js`: API pública de leitura e operações administrativas protegidas por token.
- `db/schema.sql`: tabelas e índice do Cloudflare D1.

## Configuração única na Cloudflare

1. Entre na conta Cloudflare usada no projeto **asphalt-boys**.
2. Em **Storage & Databases → D1 SQL Database**, crie um banco exclusivo chamado, por exemplo, `asphalt-boys-db`.
3. Abra o **Console** SQL do banco e execute o conteúdo do arquivo `db/schema.sql`.
4. Vá em **Workers & Pages → asphalt-boys → Settings → Bindings**. Adicione um **D1 database binding** com **Variable name = DB**, selecionando o novo banco. Não use o banco de casamento.
5. Em **Settings → Variables and Secrets**, adicione um **secret criptografado** chamado **ADMIN_TOKEN**. Defina um valor aleatório forte, com pelo menos 20 caracteres. **Nunca envie ou publique essa senha no GitHub**.
6. Salve os dois bindings e faça um novo deploy da versão `main` (ou um redeploy) para os bindings passarem a valer. Se usar prévias do GitHub, configure bindings específicos também para Preview.

O formulário do painel pede o valor de `ADMIN_TOKEN` **somente ao conectar**. O token não é salvo no navegador por este código. Não compartilhe esse token com visitantes.

## Primeiro cadastro público

1. Abra `https://asphalt-boys.pages.dev/admin.html`.
2. Informe o token da Cloudflare e clique **Conectar ao banco**. A mensagem deve informar **Banco conectado**.
3. Na aba **Destinos**, salve/publicar os destinos que aparecerão no site (por exemplo Guaramiranga, id `guaramiranga`). Se você já criou rascunhos antes, pode enviá-los ao banco pelo botão específico, depois conferir os status.
4. Em **Paradas**, escolha o destino, a categoria, cole o link do Google Maps, informe o endereço para navegação e marque **Publicado**. Não precisa cadastrar o link do Maps novamente em cada rota.
5. Em **Rotas prontas**, escolha o destino, selecione as paradas na ordem correta, marque **Publicado** e salve.
6. Abra `https://asphalt-boys.pages.dev/` e confira as abas do planejador. Em **Meu roteiro → Compartilhar**, o link preserva as paradas selecionadas. A pessoa pode alterar sua cidade de origem.

**Atenção:** links para mapas e ordenação não dependem de Google Maps API. Contudo, obter automaticamente *fotos, avaliações, avaliações em estrelas, horários e miniaturas de mapa do Google dentro da prévia* exige integração com Google Maps Platform / Places e configuração de faturamento. **Esta etapa NÃO está ativa**, e não deve ser simulada com informações inventadas. Até lá, a prévia mostra fotos autorizadas cadastradas pelo administrador e um botão **Ver no Google Maps** para consultar a ficha oficial do local.

## Limitações e segurança

- Até **três paradas por link de Google Maps** no planejador, para compatibilidade ampla em telefones.
- Rotas com mais de três paradas podem ser cadastradas, mas devem ser divididas em trechos antes de serem usadas pelo planejador móvel.
- O Waze abre somente o destino; não recebe a lista de paradas intermediárias.
- Sem D1 configurado, o painel mostra e armazena **rascunhos locais** e a página pública exibe apenas conteúdo inicial; isso não é um erro de publicação.
- Colar um link do Google Maps não autoriza copiar/armazenar fotos ou avaliações do Google. Prefira as APIs oficiais e respeite as atribuições dos autores.
- Cadastros publicados ficam visíveis por `GET /api/content`; operações de escrita exigem `ADMIN_TOKEN` como bearer token.
- Não coloque `ADMIN_TOKEN`, Google API keys ou credenciais no GitHub.

Documentação da Cloudflare: https://developers.cloudflare.com/pages/functions/bindings/
