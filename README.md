# WebScrapper - API de Editais

Projeto base para scraping, normalizacao e API de editais publicos.

## Comandos

- `npm run dev` - API em modo dev
- `npm run worker` - worker BullMQ
- `npm run build` - build TypeScript

## Ambiente

Copie `.env.example` para `.env` e ajuste variaveis.

## Estrutura

- `src/api` - Fastify + rotas
- `src/scrapers` - scrapers e parsers
- `src/workers` - workers e filas
- `src/db` - conexao e migrations
- `docker` - arquivos de infra
