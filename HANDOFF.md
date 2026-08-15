# BigFive Afiliadas — Documento de Handoff

Este documento existe pra que qualquer pessoa (ou IA) consiga entender e dar manutenção nesse app sem precisar reconstruir o histórico do zero. Se você está lendo isso porque a Claude não está mais disponível: o app **continua funcionando sozinho** (webhooks, cron, backfill automático) — isso aqui é só pra quando precisar **mudar** algo.

## O que esse app faz

Sistema de gestão de comissões pra loja Shopify da BigFive Hype (loja LGBT de roupas). Tem dois tipos de parceiro:

- **Influencer** — ganha comissão por **cupom de desconto**. Percentual sobe por *tier* conforme o volume vendido no mês (configurável em `/painel/configuracoes`).
- **Designer** — ganha comissão por **produto vinculado** (estampa própria). Percentual fixo por designer, sobre o valor do item vendido, não do pedido inteiro.

Regra importante: se o cupom usado numa venda é o **cupom do próprio designer** daquele produto, a comissão de design **não duplica** com a de cupom (evita pagar duas vezes pela mesma venda).

## Arquitetura

```
Shopify (loja) → webhook → Vercel (app) → Supabase (dados de negócio)
                                        ↘ Prisma/Postgres (sessão OAuth da Shopify)
                                        ↘ Resend (e-mails)
```

- **Frontend/backend**: React Router v7 (framework fullstack, roda em Node no Vercel)
- **Hospedagem**: Vercel — deploy automático a cada `git push` na branch `main`
- **Banco de negócio**: Supabase (Postgres) — afiliadas, designers, pedidos, comissões, pagamentos
- **Sessão da Shopify**: Prisma + Postgres (tabela `Session`, no mesmo banco Supabase) — token de acesso da loja
- **E-mail**: Resend — OTP de login, aviso de venda, aviso de cancelamento
- **App Shopify**: embutido (App Bridge), aparece dentro do admin da loja

## Domínios

- `bigfive-afiliadas.vercel.app` — domínio técnico. É o que a Shopify conhece pra autenticação (OAuth). **Não muda sem reinstalar o app.**
- `parcerias.bigfivehype.com.br` — domínio bonito, é o que se manda pra influencer/designer e o que você usa no dia a dia. Mesmo app, DNS apontando pro mesmo Vercel.
- `/painel` — painel admin (senha). `/parcerias/login` — portal da influencer (código por e-mail). Designer **não tem portal próprio**, só é gerenciado por você via `/painel`.

## Contas necessárias pra mexer nisso

| Conta | Pra quê |
|---|---|
| GitHub (`studiobigfive/bigfive-afiliadas`) | Código-fonte |
| Vercel | Hospedagem, variáveis de ambiente, cron |
| Supabase | Banco de dados |
| Shopify Partners | App "Bigfive Afiliadas" (Dev Dashboard) |
| Resend | Envio de e-mail |

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Pra quê |
|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Credenciais do app na Shopify |
| `SCOPES` | Permissões pedidas na instalação (precisa bater com `shopify.app.toml`) |
| `SHOPIFY_APP_URL` | URL do app pra Shopify (`https://bigfive-afiliadas.vercel.app`) — **crítico**, se ficar vazio o app inteiro quebra |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Acesso ao banco de negócio |
| `DATABASE_URL` / `DIRECT_URL` | Acesso do Prisma ao Postgres (sessão da Shopify) — **precisa ser idêntico** ao que o Supabase realmente usa |
| `DASHBOARD_PASSWORD` | Senha de login do `/painel` |
| `DASHBOARD_SECRET` | Chave de assinatura dos cookies de sessão (painel e portal) |
| `RESEND_API_KEY` / `RESEND_FROM` | Envio de e-mail |
| `ADMIN_EMAIL` | Pra onde vai o aviso de "nova venda" |
| `CRON_SECRET` | Opcional — protege a rota `/api/keepalive` |

## Problemas já enfrentados (não repita)

1. **Dois apps na Shopify com nome parecido.** No Dev Dashboard existem `bigfive-afiliadas` (criado pela CLI, 0 instalações, fantasma inofensivo) e `Bigfive Afiliadas` (o que a loja realmente instalou). Sempre confira qual tem **1 instalação** antes de mexer em scopes/config.
2. **Supabase pausa sozinho** depois de 7 dias sem atividade (plano free). Resolvido com um cron no Vercel (`/api/keepalive`, a cada 3 dias, ver `vercel.json`). Se voltar a pausar, é só clicar em "Resume project" no Supabase.
3. **Webhooks não registravam sozinhos.** A biblioteca da Shopify não registra webhook automaticamente só por declarar no `shopify.app.toml` — precisa também do `webhooks` + `hooks.afterAuth` explícitos em `app/shopify.server.ts` (já está assim, não reverta pro padrão do template).
4. **Produto excluído e recriado na Shopify** perde o vínculo com pedidos antigos (a Shopify retorna `product: null` no pedido). Não tem solução automática — corrige na mão comparando pelo nome do produto.
5. **`DATABASE_URL` do Vercel desalinhado do Supabase real** causa `MissingSessionTableError` mesmo com a tabela existindo. Sempre que esse erro aparecer, confira se `DATABASE_URL`/`DIRECT_URL` no Vercel batem com o projeto Supabase certo.

## Backfill (recuperar vendas antigas)

Quando um cupom/produto começa a ser rastreado DEPOIS de já ter vendas, o webhook não pega retroativo sozinho. Isso já é **automático**:
- Influencer: dispara sozinho ao cadastrar ela com o cupom (`app/lib/backfill.server.ts` → `backfillInfluencer`)
- Designer: dispara sozinho ao vincular um produto (`backfillProdutoDesigner`)

Pra rodar manualmente (ex: descobriu uma venda perdida antiga), tem os scripts:
```bash
node --env-file=.env scripts/backfill-influencers.mjs [dias]
node --env-file=.env scripts/backfill-designers.mjs [dias]
```

## Testar localmente

```bash
npx vite dev --port 5555
```
Abre `http://localhost:5555/painel/login` — funciona sem precisar da Shopify (só `/painel` e `/parcerias`, não o app embutido).

## Deploy

Qualquer `git push` na branch `main` já dispara deploy automático no Vercel. Não tem ambiente de staging — vai direto pra produção. Sempre rodar `npm run typecheck` antes.

## Mapa de arquivos importantes

```
app/shopify.server.ts              → config do app Shopify (auth, webhooks)
app/lib/supabase.server.ts         → cliente do banco de negócio
app/lib/backfill.server.ts         → recuperação automática de vendas antigas
app/lib/email.server.ts            → todos os e-mails (Resend)
app/lib/shopify-admin.server.ts    → chamadas à API da Shopify (criar cupom, buscar produto)
app/routes/webhooks.orders.paid.tsx      → processa venda nova (cupom + designer)
app/routes/webhooks.orders.cancelled.tsx → processa cancelamento
app/routes/webhooks.refunds.create.tsx   → processa reembolso parcial/total
app/routes/painel.*                → telas do admin (senha)
app/routes/parcerias*              → portal da influencer (login por e-mail)
app/routes/api.keepalive.tsx       → ping pro Supabase não pausar
scripts/*.mjs                      → scripts manuais (backfill, seed de teste, limpeza)
```

## Terminologia

Internamente (banco de dados, código) tudo ainda se chama `afiliada` — é só o **nome visível** que virou "Influencer". Não é bug, é decisão consciente pra não precisar migrar o banco. Se for mexer no código, procure por `afiliada`.
