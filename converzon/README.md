# Fork Converzon — DeskcommCRM com as mudanças de um cliente

Ramo `converzon` do fork `obrunodomingues/DeskcommCRM`. Base: a tag do upstream
que está no ar (hoje `v1.86.0`), mais as mudanças abaixo, cada uma em commit
próprio. Só a imagem do **app** é trocada na VPS; worker, scheduler, banco e WAHA
seguem nas imagens oficiais da mesma versão.

## O que muda em relação ao upstream

| Mudança | Arquivos |
|---|---|
| Inbox com 4 abas: **Todas** (primeira e padrão), **Novas mensagens**, **Aguardando resposta**, **Clientes**; Fechadas/Arquivadas numa linha discreta | `lib/inbox/abas-converzon.ts`, `components/inbox/InboxFilters.tsx`, `components/inbox/InboxLayout.tsx`, `app/api/v1/conversations/{_handler,route,counts/route}.ts`, `hooks/inbox/*` |
| **Marcar como cliente** no card do contato: etiqueta `cliente` (a conversa entra na aba Clientes e não sai mais, em qualquer status) + "sempre atendimento humano" (a IA para de responder o contato). Desmarcar tira a etiqueta e a trava permanente, sem devolver a conversa ao automático. Sem SQL novo: a aba lê `tags_do_contato` (migration 0323) | `components/inbox/MarcarComoCliente.tsx`, `components/inbox/CRMSidePanel.tsx`, `app/api/v1/converzon/clientes/[id]/route.ts` |
| Cor do balão por quem respondeu: CRM na cor da marca, celular azul, IA roxo. Digitada no CRM diz **CRM** (não "Você"/"Atendente"), também na citação | `components/inbox/MessageBubble.tsx`, `components/inbox/Composer.tsx` |
| Notas internas fixadas no painel do contato | `components/inbox/NotasInternasDoPainel.tsx`, `components/inbox/CRMSidePanel.tsx` |
| Funil: card mais recente no topo da coluna (chegada na coluna) | `lib/kanban/ordem-da-coluna.ts`, `components/kanban/KanbanBoard.tsx`, `hooks/kanban/useMoveCard.ts` |
| Menu: "Inbox" vira **WhatsApp**, com o ícone do WhatsApp | `lib/navigation/catalogo.ts`, `lib/navigation/registry.ts`, `app/app/inbox/page.tsx` |
| **Métricas do site** (Análise): Google Analytics 4 com gráficos, comparação com o período anterior, "agora no site" e "Do site ao CRM" | `lib/converzon/{ga4,metricas-do-site}.ts`, `app/api/v1/converzon/metricas-do-site/route.ts`, `app/app/metricas-do-site/*` |
| **Visual do consultório**: Inter, fundo cinza-claro com cartões brancos, verde do cliente, letras maiores, botões em pílula, cartões que sobem com o mouse e **barra lateral no tema oposto** ao da página (`[data-lado-invertido]`) | `app/converzon.css`, `app/layout.tsx`, `app/globals.css` (só o `@custom-variant dark`), `components/shell/{Sidebar,MobileSidebar,NavHub}.tsx`, `components/ui/button.tsx`, `app/fonts/inter-100-900-latin.woff2` |
| **Início**: o resumo do dia (saudação, esperando resposta, pacientes novos, consultas e próximo horário livre, visitas do site, funil por etapa). Primeiro item de Atendimento e tela que abre ao entrar; Meta Ads saiu do menu lateral (fica no hub de Análise) para o teto de 15 | `app/app/inicio/*`, `app/api/v1/converzon/inicio/route.ts`, `lib/converzon/inicio.ts`, `lib/navigation/{catalogo,interface,registry}.ts`, `app/fonts/cormorant-garamond-600-latin.woff2` |
| **Ramo da instalação** (`CONVERZON_PERFIL`): o Início fala em leads e reuniões numa agência e em pacientes e consultas no consultório; o selo do compromisso mostra vídeo, ligação ou presencial pelo `location_kind` | `lib/converzon/perfil.ts`, `lib/env.ts`, `.env.example`, `app/app/inicio/*`, `app/api/v1/converzon/inicio/route.ts` |
| **Projetos** (só com `CONVERZON_PERFIL=agencia`): a execução de cada serviço vendido. Quadro por situação com o resumo da semana (atrasados, vencendo, parados, esperando o cliente), e por dentro fases com avançar e voltar, checklist por fase com prazo por item, notas e histórico automático. Modelos de fases e checklist por tipo de serviço (site, estrutura completa, tráfego, IA, sistema). No menu lateral ocupa o lugar de Tarefas (que segue no hub) pela capacidade `converzon_agencia`, que o layout põe numa agência. SQL: `0002_converzon_projetos.sql` | `lib/converzon/{projetos,perfil-servidor}.ts`, `app/app/projetos/*`, `app/api/v1/converzon/projetos/*`, `lib/navigation/{catalogo,interface}.ts`, `lib/organizacao/capacidades.ts`, `app/app/layout.tsx` |

`0003_converzon_despedida_e_apagar.sql` vale para TODA instalação do fork: troca a regra de "Sem resposta" (a imagem atual já se beneficia) e cria a função do botão "Apagar contato e conversas". Aplicar ANTES de subir a imagem que tem o botão — sem ele, apagar responde erro.
| **Ajustes do consultório (16/11/2026)**: abas "Sem resposta" e "Precisam de você" (antes "Novas mensagens" e "Aguardando resposta"); "Sem resposta" ignora mensagem apagada, despedida curta ("obrigado", "valeu", só emoji) e o botão **Não precisa responder**; **Apagar contato e conversas** no cabeçalho da conversa (gerente para cima; contato, conversas, mensagens, cards do funil e compromissos passados; recusa com consulta futura); prévia da lista diz "Mensagem apagada"; horário do agente com faixa própria por dia (`por_dia`, a tela oferece o sábado); aba Clientes e "Marcar como cliente" só na agência; Tarefas na barra do consultório e fora da barra da agência (`saiDoMenuCom`). SQL: `0003_converzon_despedida_e_apagar.sql` | `converzon/sql/0003_*.sql`, `components/inbox/{AcoesConverzonDaConversa,ConversationHeader,InboxFilters,MarcarComoCliente}.tsx`, `app/api/v1/converzon/{conversas,contatos}/*`, `lib/agent-engine/agent/janela-de-atendimento.ts`, `lib/ai/agents/validation.ts`, `app/app/ai/agents/[id]/_components/TriggerEditor.tsx`, `lib/navigation/{catalogo,registry}.ts`, `lib/waha/ingest.ts` |
| **Consultório (19/11/2026)**: com `converzon_consultorio` (posta pelo layout quando não há `CONVERZON_PERFIL`), o cabeçalho da conversa perde Liberar, Transferir e Lembrar, "Devolver ao automático" vira "Devolver para IA", e Funil, Tarefas, Contatos e Métricas do site sobem para o lugar de Respostas rápidas. No funil, só a primeira coluna (Novo) sai por chegada, as outras voltam à ordem manual, e toda coluna tem a altura da mais comprida (grade em `app/converzon.css`). O lembrete da agenda aceita `{{link}}` (link do Meet pronto) | `components/inbox/ConversationHeader.tsx`, `lib/navigation/registry.ts`, `components/kanban/KanbanBoard.tsx`, `lib/kanban/ordem-da-coluna.ts`, `app/api/v1/cron/agenda-reminder/route.ts`, `app/converzon.css` |

## Variáveis de ambiente do fork

No `.env` da VPS (o app lê o `.env` inteiro), documentadas em `.env.example`:

- `CONVERZON_GA4_PROPERTY_ID` — ID numérico da propriedade do GA4.
- `CONVERZON_GA4_CREDENTIALS_B64` — JSON da conta de serviço (papel "Leitor"
  na propriedade) em base64 numa linha. É SEGREDO: nunca em commit nem no chat.
- `CONVERZON_PERFIL` — o ramo da instalação. `agencia` põe a tela Início em
  leads e reuniões; vazio (ou qualquer outro valor) = consultório (pacientes e
  consultas). Valor errado não derruba o CRM: cai no padrão.

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

`0002_converzon_projetos.sql` (tabelas da tela Projetos) só é preciso numa instalação de agência: nas outras a tela e as rotas respondem 404 e nunca consultam essas tabelas.

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
