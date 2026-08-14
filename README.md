# WebScrapper

API, frontend e worker para coleta, normalização e consulta de editais públicos.

## Funcionalidades

- Frontend operacional para consulta e filtros.
- API Fastify com contrato OpenAPI 3.0.
- Documentação interativa Scalar em `/docs`.
- Consulta de editais em `/api/editais/`.
- Enfileiramento de scraping com BullMQ/Redis.
- Extração de detalhes com Playwright e Cheerio.
- Sanitização de texto e bloqueio de SSRF para destinos privados.
- Suporte a publicação sob prefixo `/webscrapper`.

## Executar localmente

Requisitos: Node.js 22+, PostgreSQL 15+, Redis 7+.

```bash
npm ci
cp .env.example .env
npm run migrate:dev
npm run dev
```

URLs locais:

- Frontend: `http://127.0.0.1:3000/`
- Subpágina: `http://127.0.0.1:3000/webscrapper`
- Scalar: `http://127.0.0.1:3000/docs`
- OpenAPI: `http://127.0.0.1:3000/openapi.json`

O processo também carrega credenciais compartilhadas de `$HERMES_HOME/.env` ou `~/.hermes/.env` antes do `.env` local. Variáveis já exportadas no processo têm prioridade.

## Produção

A API e o worker devem ser executados como serviços separados. PostgreSQL e Redis são dependências obrigatórias.

A rota `/webscrapper` pode ser publicada atrás de um proxy existente sem alterar outra aplicação no mesmo domínio. O proxy deve encaminhar também `/webscrapper/api/*` para o serviço.

## Segurança

- Endpoints da API exigem Basic Auth.
- Altere `BASIC_AUTH_USER` e `BASIC_AUTH_PASS` antes de publicar.
- Não commite `.env`, tokens, cookies, dumps ou dados coletados.
- O endpoint de scraping aceita somente HTTP/HTTPS, bloqueia localhost, loopback, redes privadas, metadata endpoints, portas explícitas e credenciais embutidas.
- O texto extraído é limitado a 200.000 caracteres.
- O timeout de navegação é de 20 segundos.

## Testes e validação

```bash
npm run build
npm audit --omit=dev --audit-level=high
```

## Licença

MIT.
