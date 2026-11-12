# Fork Converzon — DeskcommCRM com as mudanças de um cliente

Ramo `converzon` do fork `obrunodomingues/DeskcommCRM`. Base: a tag do upstream
que está no ar (hoje `v1.86.0`), mais as mudanças abaixo, cada uma em commit
próprio. Só a imagem do **app** é trocada na VPS; worker, scheduler, banco e WAHA
seguem nas imagens oficiais da mesma versão.

## O que muda em relação ao upstream

| Mudança | Arquivos |
|---|---|
| Inbox com 3 abas: **Todas** (primeira e padrão), **Novas mensagens**, **Aguardando resposta**; Fechadas/Arquivadas numa linha discreta | `lib/inbox/abas-converzon.ts`, `components/inbox/InboxFilters.tsx`, `components/inbox/InboxLayout.tsx`, `app/api/v1/conversations/{_handler,route,counts/route}.ts`, `hooks/inbox/*` |
| Cor do balão por quem respondeu: CRM na cor da marca, celular azul, IA roxo. Digitada no CRM diz **CRM** (não "Você"/"Atendente"), também na citação | `components/inbox/MessageBubble.tsx`, `components/inbox/Composer.tsx` |
| Notas internas fixadas no painel do contato | `components/inbox/NotasInternasDoPainel.tsx`, `components/inbox/CRMSidePanel.tsx` |
| Funil: card mais recente no topo da coluna (chegada na coluna) | `lib/kanban/ordem-da-coluna.ts`, `components/kanban/KanbanBoard.tsx`, `hooks/kanban/useMoveCard.ts` |
| Menu: "Inbox" vira **WhatsApp**, com o ícone do WhatsApp | `lib/navigation/catalogo.ts`, `lib/navigation/registry.ts`, `app/app/inbox/page.tsx` |
| **Métricas do site** (Análise): Google Analytics 4 com gráficos, comparação com o período anterior, "agora no site" e "Do site ao CRM" | `lib/converzon/{ga4,metricas-do-site}.ts`, `app/api/v1/converzon/metricas-do-site/route.ts`, `app/app/metricas-do-site/*` |

## Variáveis de ambiente do fork

No `.env` da VPS (o app lê o `.env` inteiro), documentadas em `.env.example`:

- `CONVERZON_GA4_PROPERTY_ID` — ID numérico da propriedade do GA4.
- `CONVERZON_GA4_CREDENTIALS_B64` — JSON da conta de serviço (papel "Leitor"
  na propriedade) em base64 numa linha. É SEGREDO: nunca em commit nem no chat.

Vazias, a tela "Métricas do site" explica que falta configurar. O app só lê o
`.env` ao ser recriado (`crm-versao.sh` faz isso).

As abas antigas (Automático, Fila, Minhas) continuam existindo por baixo —
`tabToFilter`, contagens e links antigos —, só não aparecem. Isso mantém o diff
pequeno e as regras do upstream valendo.

## SQL do fork

`converzon/sql/` — fora de `supabase/migrations` de propósito (o `update.sh`
aplica as do upstream). Cada arquivo é aditivo e idempotente. **Aplicar antes de
subir a imagem**, senão as abas novas respondem erro:

```bash
ssh vps-dr 'docker exec -i deskcommcrm-supabase-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1' < converzon/sql/0001_converzon_sem_resposta.sql
```

## Publicar uma versão nova do fork

1. Checagens locais (no clone, `C:\Users\bruno\dev\deskcomm-converzon`):
   `NODE_OPTIONS=--max-old-space-size=6144 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json`,
   eslint nos arquivos mexidos e os testes de unidade das telas tocadas.
2. `git push origin converzon`.
3. Gerar as imagens no GitHub (nada compila na VPS):
   `gh workflow run publish-image.yml --repo obrunodomingues/DeskcommCRM --ref converzon`
   — sai `ghcr.io/obrunodomingues/deskcommcrm:converzon` (multi-arquitetura).
4. Pegar o **digest** da imagem publicada e usar ele (imutável), nunca só a tag.

## Trocar a versão na VPS (e voltar)

O `.env` da VPS manda: `APP_IMAGE`. Script: `/root/converzon/crm-versao.sh`
(`fork <digest>` / `oficial` / `status`). Ele faz backup do `.env`, troca só o
`APP_IMAGE`, recria só o contêiner `app` e confere `/` = 200 e `/app` = 307.
Voltar para a oficial é o mesmo script com `oficial` — menos de um minuto.

## Atualizar o CRM (upstream lançou versão nova)

⚠️ **Não rodar o `update.sh` direto.** Ele regrava o `APP_IMAGE` com a imagem
oficial: o CRM atualiza, mas as mudanças do fork somem da tela, em silêncio.

1. `git fetch upstream --tags` e `git rebase vX.Y.Z` no ramo `converzon`
   (resolver conflitos; os arquivos da tabela acima são os candidatos).
2. Checagens do passo "Publicar", push, imagens.
3. Rodar o `update.sh` (atualiza banco, worker, scheduler na versão nova) e, logo
   depois, `crm-versao.sh fork <digest novo>`.
4. Rodar de novo `/root/converzon/menu-dr.sh` para cada pessoa (telas novas).
