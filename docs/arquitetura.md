# Fase 1 — Auditoria e Arquitetura: CRM + Tracking + Atribuição AutoSíntese

Data: 07/09/2026 · Repo auditado: `bernardo783/sistema-autosintese@ce47f81` · Supabase: `fuieonexmdupupcsyowg`

---

## 1. O que existe hoje (auditoria)

### 1.1 Stack

| Camada | Hoje |
|---|---|
| Front | **1 arquivo** `index.html` (1,07 MB, 13.749 linhas), HTML+CSS+JS vanilla, sem build, sem framework, sem TypeScript |
| Hospedagem | GitHub Pages (`autosintese.app.br`), PWA sem service worker |
| Backend | Supabase: Postgres + RLS + Auth + Storage + **37 Edge Functions (Deno)** |
| Cliente DB | `supabase-js@2` via CDN; chave publicável inline; sem realtime; sem `.rpc()` do cliente |
| Deploy | `gravar → conferir → publicar2` (edge functions com 5 travas); `publicar-arquivo` para `.html` avulsos; `reverter` para rollback |
| Testes | `testes/rodar.js` (Node + `vm`, recorta blocos do HTML): **209 testes, 5 falhando hoje** |
| Lint / typecheck | **Não existe.** Única validação: `new Function()` nos blocos `<script>` |
| Extensões PG ativas | `pgcrypto`, `http`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`. **Disponíveis, não instaladas:** `pg_cron`, `pg_net`, `pgmq` |

### 1.2 Autenticação e autorização

- Supabase Auth (e-mail/senha). `perfis` espelha `auth.users`: `role ∈ {master, membro}`, `aprovado`, `gerente bool`, `cargo text` (livre: "gestor de trafego", "gerente", "comercial"…), `squads text[]`, `telas_off text[]`.
- Funções RLS: `is_master()`, `is_aprovado()`, `is_gerente()`, `meus_squads()`, `squad_da_ficha()`, `tarefa_visivel()`, `no_liberado()`.
- Front: gate por `currentUser.role==='master'` em `render()`; abas master-only escondidas via `show/hide(#navX)`.
- Edge functions: validam JWT manualmente (`admin.auth.getUser`) ou usam **segredo no path da URL** (`/meta/Mt7kXp4wQn9c`, `/wa/<WA_WEBHOOK_SECRET>/lead`).
- **Não existe papel SDR, closer ou gestor comercial.** 10 perfis: 4 master (Bernardo, Gabriel, José/comercial, robô), 6 membros.

### 1.3 Banco — entidades existentes relevantes

| Tabela | Estado | Reaproveitável? |
|---|---|---|
| `wa_leads` (telefone UNIQUE, estagio, campanha/conjunto/anuncio texto, utm_*, ctwaclid, valor, motivo_perda texto, responsavel_id, bruto) | **0 linhas** | Modelo lead-único (pessoa = oportunidade). Vira **legado**: substituído por `contacts` + `opportunities`. Como está vazia, não há migração de dados |
| `wa_eventos` (lead_id, tipo, de, para, texto, por, bruto) + trigger `wa_registrar_estagio` | **0 linhas** | Conceito certo (evento por transição). Vira `funnel_events` com o contrato pedido |
| `wa_estagios` (chave, nome, ordem, cor, fim) | 7 estágios | **Reaproveitar** a tabela como catálogo do pipeline (adicionar estágios que faltam) |
| `leads` (Yay Forms, upsert por externo_id, utm_*) | 0 linhas | Manter como fonte secundária (`source='form'`) alimentando `contacts/opportunities` |
| `agenda_google` (dono, refresh_token **em texto puro**) + `agenda_eventos` | 2 conexões | OAuth Google já funciona (Modo Pessoal). **Reaproveitar** fluxo; mover token para `vault` |
| `perfis` / `equipe_nomes` (view) | 10 | Base do RBAC; adicionar `papel_crm` |
| `notificacoes` + triggers `ntf_*` | 1.146 | **Reaproveitar** para "lead novo", "no-show", "venda" |
| `trafego_ids` | 5 | IDs de ativos Meta de clientes — não é o caso da casa |
| `itens.contas_meta` / `trafego` | — | Painel de tráfego **dos clientes**. Não misturar |
| `audit`/`webhook raw` | — | **Não existe** |

Índices existentes: `wa_leads(telefone) UNIQUE, (estagio), (criado_em desc)`, `wa_eventos(lead_id,quando)`, `leads(externo_id) UNIQUE`.

### 1.4 Funil atual (`#v/funil`, master-only)

- Sub-aba **Anúncios (Meta)**: chama `edge meta/funil/act_1784945562132417` **a cada carregamento** (3 chamadas Graph API: insights período, série diária, campanhas com insights) + período anterior. Cards: gasto, leads (action types `MT_LEADS`), CPL, CTR, CPC, campanhas ordenadas por gasto. Leads de formulário do Yay entram como "leads reais" com CPL real.
- Sub-aba **WhatsApp**: Kanban `wa_leads × wa_estagios`, drag-and-drop, timeline por `wa_eventos`, `prompt()` para valor/motivo de perda (texto livre), `+ Lead` manual.
- Funções puras já testáveis: `fnMetricas`, `fnVar`, `fnSerie`, `fnJanelaAnterior`, `waResumo`, `waFone`.

### 1.5 Integrações existentes (Edge Functions)

| Função | O que faz | Veredito |
|---|---|---|
| `meta` | Proxy Graph API v21 com `META_TOKEN` (token de usuário único). Rotas: `teste, contas, resumo, insights, funil, campanhas, anuncios` (com `creative.thumbnail_url`). Sem persistência, sem `time_increment` por anúncio | Mantém para o painel de clientes. Para a casa: **novo sync que grava no banco** (`meta-sync`) |
| `wa` | Webhook Cloud API + Z-API + Evolution + manual. Verificação `hub.challenge` ✔. **Sem `X-Hub-Signature-256`**, **sem multi-número** (ignora `metadata.phone_number_id`), captura só `ctwa_clid/headline/source_id`, dedup por `bruto->>msgId` sem índice, first-touch destrutivo (apaga campos), não guarda payload bruto por evento | Substituir por `wa-webhook` (novo). Manter Z-API/Evolution fora do escopo |
| `lead` | Webhook Yay Forms → `leads` | Manter; acoplar a `contacts` via trigger |
| `google-agenda` | OAuth Google (`calendar.events`), `authurl/callback/dia/criar`, refresh token em `agenda_google` | **Reaproveitar** OAuth; estender escopos e adicionar `conferenceData` + Meet |
| `agente-lead`, `contrato*`, `fechamento`, `asaas-conferir`, `lancar`, `dados` | Outros domínios | Não tocar |

Secrets já configurados (nomes): `META_TOKEN`, `WA_WEBHOOK_SECRET`, `LEAD_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.

### 1.6 Componentes de UI reutilizáveis

`modal(title, html, onSave)`, `toast()`, `esc()`, `brl()`, `fmtDate()`, `dtCampo()`, `svgIco()`, `.cards/.card.fn-card` (KPI), `.fin-tabs/.ftab` (sub-abas), `.toolbar`, `.search`, `.dl-box/.dl-grp/.dl-sec/.dl-hist` (detalhe + timeline), `.wa-board/.wa-col/.wa-card` (Kanban), `.page-head`, `.empty`, `.hint`, `.btn .ghost .small`. Tokens: `--bg --panel --panel2 --line --brand --brand2 --ok --danger --warn --info --muted`; 4 temas via `data-tema`. Fonte Inter. Sem lib de gráfico no tronco (barras em CSS).

### 1.7 Dívidas técnicas relevantes

1. **Arquivo único de 1 MB** — cada feature nova engorda o boot. Lint/typecheck inexistentes. O novo módulo CRM deve ir para **arquivo separado** (`crm.js`, carregado via `<script src>` no mesmo repo) para não inflar ainda mais o `index.html` e poder rodar ESLint/TS-check só nele.
2. **5 testes já falham** (4 de paleta de cores, 1 "achou as abas no código") — corrigir na Fase 1.5 para o `rodar.js` voltar a ser verde e servir de gate.
3. `agenda_google.refresh_token` em **texto puro**; `META_TOKEN` é token pessoal, não System User.
4. Webhook `wa` sem assinatura, sem raw log, sem retry.
5. Segredos em path de URL (`/meta/Mt7k…`) — aceitável para webhooks externos, não para chamadas do front logado (o `meta` já exige JWT, ok).
6. `perfis.cargo` é texto livre usado como papel (`/trafego/.test(cargo)`). RBAC comercial precisa de coluna enumerada.
7. Dashboard Meta consulta a Graph API a cada render — exatamente o que o pedido proíbe.

---

## 2. Decisões de arquitetura

| # | Decisão | Motivo |
|---|---|---|
| A1 | **Stack mantida**: HTML/JS vanilla + Supabase (Postgres, Edge Functions Deno, Auth, Vault). Sem framework, sem servidor extra | Pedido explícito; equipe já opera esse fluxo |
| A2 | CRM em **módulo separado** `crm.js` + `crm.css` no repo, incluído pelo `index.html` com uma linha. Publicação via `publicar-arquivo` estendido para `.js/.css/.md` | Não engordar o monolito; permitir ESLint/tsc (`// @ts-check` + JSDoc) e testes só do módulo |
| A3 | **Banco é a fonte de todo dashboard.** Meta/Google alimentam tabelas locais via sync agendado (`pg_cron` → `pg_net` → edge function). Front só lê Postgres | Performance e pedido explícito |
| A4 | Event sourcing pragmático: `funnel_events` **append-only** (RLS sem UPDATE/DELETE, nem para master) + coluna `opportunities.stage` como projeção, mantida por **trigger** que grava o evento | Histórico imutável; estado atual barato de filtrar |
| A5 | Métricas por **views SQL** (`v_funnel_daily`, `v_opportunity_attrib`, `v_sdr_perf`, `v_closer_perf`, `v_ad_perf`) + 1 RPC `crm_dashboard(filtros jsonb)` | Filtros afetam tudo de uma vez; testável em SQL (`pgtap`) |
| A6 | Tokens em **`vault.secrets`** (Supabase Vault, já instalado); edge functions leem via service role; front nunca vê. Segredos de app (App Secret, Client Secret) em Edge Secrets | Pedido; Vault já disponível |
| A7 | RBAC: coluna `perfis.papel_crm ∈ {admin, gestor, sdr, closer}` (null = sem CRM). Funções `crm_papel()`, `crm_admin()`. Master ⇒ admin automaticamente | Não quebra `role/cargo` existentes |
| A8 | Idempotência por **UNIQUE constraints** no banco (não por lógica de aplicação): `messages.wamid`, `integration_webhook_events(provider, external_event_id)`, `meta_conversion_events(opportunity_id, event_name)`, `meta_daily_insights(ad_id, date)` | Provider reenvia → `ON CONFLICT DO NOTHING` |
| A9 | Webhook grava o bruto **primeiro** (`integration_webhook_events`, status `received`) e responde 200; processamento em seguida na mesma invocação com `try/catch`; falhas ficam `status='error'` e um cron reprocessa (`attempts`, backoff) | Meta exige 200 rápido; nunca perder payload |
| A10 | Telefone normalizado E.164 por função SQL `crm_e164(text)` imutável, usada em trigger e em índice UNIQUE de `contacts.phone_e164` | Dedup no banco, testável |
| A11 | `wa_leads/wa_eventos` ficam **congeladas** (vazias). UI do Kanban antiga é substituída pela nova. Nada é dropado nesta etapa | Zero risco; drop só numa fase de limpeza futura, justificada |

### 2.1 WhatsApp — o achado que muda o plano ⚠️

Pesquisa na doc oficial (set/2026):

- **Coexistence** (manter o WhatsApp Business App dos SDRs e receber tudo via Cloud API) **existe e é oficial**: mensagens do app chegam por webhook `smb_message_echoes`, histórico de até 180 dias, Embedded Signup v4 com `featureType: 'whatsapp_business_app_onboarding'`.
- **Porém exige que o app Meta seja Solution Partner ou Tech Provider**: Business Verification + App Review com Advanced Access em `whatsapp_business_messaging` e `whatsapp_business_management`. Isso leva de dias a semanas e não depende de código.
- Limitações a aceitar: throughput 20 mps, sem grupos/listas via API, dispositivos vinculados desconectados (WhatsApp Web precisa reconectar pelo celular), mensagens enviadas pelo WhatsApp para Windows não geram webhook.
- Embedded Signup **v2 é descontinuado em 15/10/2026** → implementar direto na v4.

Caminhos (decisão do Gabriel, ver bloco final):

| Opção | O que muda | Custo |
|---|---|---|
| **A. Tech Provider próprio + Coexistence** (recomendada) | SDRs continuam no app; sistema recebe tudo. Precisa abrir verificação da empresa e App Review agora, em paralelo à Fase 2–3 | Burocracia Meta (2–6 semanas); código igual |
| B. Migrar os 2 números para Cloud API puro | SDR perde o app; teríamos que construir inbox de atendimento no sistema (escopo grande) | Alto em código, zero em burocracia |
| C. BSP com coexistência (ex.: 360dialog/Gupshup) como intermediário | Eles já são Solution Partner; webhook vem deles no formato Cloud API | Mensalidade por número; dependência |

Arquitetura fica **igual nas três**: `whatsapp_connections.provider` e o parser do webhook isolam a diferença. Fases 2 e 3 começam já; o fluxo de Embedded Signup vai atrás do que for decidido.

---

## 3. Schema proposto

Convenções: `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at` via trigger `touch_atualizado_em` (já existe). Tudo em `public`, RLS ligado. Nada é dropado.

### 3.1 Núcleo CRM

```sql
-- pessoa
contacts (
  id uuid pk, phone_e164 text UNIQUE NOT NULL, name text, email text, company text,
  wa_profile_name text, first_seen_at timestamptz, last_message_at timestamptz,
  tags text[], notes text, merged_into uuid → contacts, created_at, updated_at )

-- ciclo comercial
opportunities (
  id uuid pk, contact_id uuid → contacts NOT NULL,
  stage text → wa_estagios.chave NOT NULL default 'novo_lead',      -- projeção
  status text check in ('open','won','lost') default 'open',
  sdr_id uuid → perfis, closer_id uuid → perfis,
  whatsapp_connection_id uuid → whatsapp_connections,
  source text,                        -- whatsapp_ctwa | whatsapp_organic | form | manual | referral
  first_touchpoint_id uuid → marketing_touchpoints, last_touchpoint_id uuid → marketing_touchpoints,
  qualified_at, appointment_at, attended_at, won_at, lost_at timestamptz,
  value numeric(12,2), revenue numeric(12,2), currency text default 'BRL',
  lost_reason_id uuid → lost_reasons, lost_notes text,
  first_inbound_at, first_sdr_response_at, first_lead_reply_at timestamptz,  -- p/ tempo de resposta
  next_activity_at timestamptz, next_activity text,
  created_at, updated_at, closed_at )
  -- índice parcial: 1 oportunidade aberta por contato
  UNIQUE (contact_id) WHERE status='open'

-- histórico imutável
funnel_events (
  id uuid pk, contact_id uuid NOT NULL, opportunity_id uuid,
  event_type text NOT NULL,   -- lead_created, whatsapp_first_message, sdr_first_response, lead_responded,
                              -- qualified, unqualified, appointment_created/confirmed/rescheduled/canceled,
                              -- meeting_attended, no_show, proposal, won, lost, stage_changed,
                              -- owner_changed, note, value_changed, attendance_overridden
  occurred_at timestamptz NOT NULL default now(),
  actor_user_id uuid → perfis,          -- null = sistema/webhook
  source text NOT NULL,                 -- webhook_whatsapp | ui | calendar | meet | cron | capi
  previous_stage text, new_stage text,
  metadata jsonb default '{}', created_at )
  -- RLS: INSERT p/ aprovado com papel_crm; sem UPDATE/DELETE p/ ninguém (nem master)

marketing_touchpoints (
  id uuid pk, contact_id uuid NOT NULL, opportunity_id uuid,
  platform text default 'meta', source_type text, ctwa_clid text, source_id text, source_url text,
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  creative_id text, headline text, body text, media_type text, media_url text,
  utm jsonb, happened_at timestamptz NOT NULL, raw_metadata jsonb NOT NULL, enriched_at timestamptz,
  created_at )   -- append-only, mesma RLS de funnel_events

lost_reasons ( id uuid pk, key text UNIQUE, name text, ordem int, ativo bool default true )
-- seed: sem_orcamento, sem_interesse, nao_respondeu, fora_icp, timing, concorrente,
--       no_show_nao_recuperado, nao_fechou_pos_reuniao, duplicado, outro

-- wa_estagios: ADICIONAR chaves (não apagar as 7 existentes):
-- novo_lead, em_atendimento, respondeu, qualificacao, qualificado, agendado, no_show, compareceu,
-- negociacao, ganho, perdido  (+ coluna `grupo` p/ agrupar e `metrica` p/ mapear à definição)

crm_settings ( key text pk, value jsonb, updated_by uuid, updated_at )
-- seed: reopen_window_days=30, timezone='America/Sao_Paulo', attended_min_minutes=5,
--       internal_domains=['autosintese.com.br'], webhook_retention_days=90
```

### 3.2 WhatsApp

```sql
whatsapp_connections (
  id uuid pk, name text, phone_number text, phone_number_id text UNIQUE, waba_id text,
  business_id text, assigned_user_id uuid → perfis (SDR), provider text default 'meta_cloud',
  connection_status text default 'pending',  -- pending|connected|degraded|error|disconnected
  coexistence bool default false, token_secret_id uuid → vault.secrets, dataset_id text (CAPI),
  last_webhook_at timestamptz, last_error text, created_at, updated_at )

messages (
  id uuid pk, wamid text UNIQUE NOT NULL, whatsapp_connection_id uuid NOT NULL,
  contact_id uuid NOT NULL, opportunity_id uuid, direction text check in ('inbound','outbound'),
  sent_by_user_id uuid → perfis, msg_type text, body text, media jsonb,
  is_ad_prefilled bool default false, referral_touchpoint_id uuid → marketing_touchpoints,
  wa_timestamp timestamptz NOT NULL, status text, raw jsonb, created_at )

integration_webhook_events (
  id uuid pk, provider text NOT NULL,  -- whatsapp|meta_ads|google_calendar|google_meet|meta_capi|yayforms
  external_event_id text, event_type text, received_at timestamptz default now(),
  processed_at timestamptz, status text default 'received', -- received|processed|error|skipped|duplicate
  attempts int default 0, next_retry_at timestamptz, raw_payload jsonb NOT NULL, headers jsonb, error text,
  UNIQUE (provider, external_event_id) )
```

### 3.3 Agenda / Meet

```sql
appointments (
  id uuid pk, contact_id, opportunity_id NOT NULL, closer_id, sdr_id,
  scheduled_start, scheduled_end timestamptz NOT NULL, timezone text default 'America/Sao_Paulo',
  status text default 'scheduled', -- scheduled|confirmed|rescheduled|canceled|attended|no_show|undetermined
  calendar_id text, calendar_event_id text UNIQUE, meet_url text, conference_id text, meet_space_name text,
  rescheduled_from_id uuid → appointments, canceled_reason text, created_by uuid, created_at, updated_at )

meeting_attendance (
  id uuid pk, appointment_id NOT NULL, source text, -- meet_api | manual
  conference_record text, participant_name text, participant_type text, -- signedin|anonymous|phone
  participant_email text, is_internal bool, joined_at, left_at timestamptz, duration_seconds int,
  raw jsonb, created_at )
-- resultado automático em appointments.status; override manual grava funnel_event
-- `attendance_overridden` com {from,to,by} e nunca apaga meeting_attendance

google_connections ( user_id uuid pk → perfis, google_email text, token_secret_id uuid → vault.secrets,
  scopes text[], calendar_id text default 'primary', connected_at, last_sync_at, status )
-- reaproveita agenda_google migrando refresh_token para o Vault (sem apagar a coluna nesta fase)
```

### 3.4 Meta Ads (snapshots locais)

```sql
meta_ad_accounts ( id text pk /*act_…*/, name text, currency text, business_id text, status int,
  token_secret_id uuid → vault.secrets, is_house bool default false, last_sync_at, sync_error text )
meta_campaigns ( id text pk, account_id text → meta_ad_accounts, name text, objective text, status text,
  daily_budget numeric, first_seen_at, last_seen_at, snapshot jsonb )
meta_adsets    ( id text pk, campaign_id text →, account_id text, name text, status text, snapshot jsonb, … )
meta_ads       ( id text pk, adset_id text →, campaign_id text, account_id text, name text, status text,
  creative_id text, snapshot jsonb, … )
meta_creatives ( id text pk, account_id text, name text, thumbnail_url text, headline text, body text,
  media_type text, snapshot jsonb, fetched_at )
meta_daily_insights ( ad_id text, adset_id text, campaign_id text, account_id text, date date,
  spend numeric, impressions int, reach int, clicks int, link_clicks int, msg_conversations_started int,
  actions jsonb, raw jsonb, synced_at, PRIMARY KEY (ad_id, date) )
meta_conversion_events ( id uuid pk, opportunity_id NOT NULL, event_name text NOT NULL, event_time timestamptz,
  ctwa_clid text, waba_id text, dataset_id text, event_id text, payload jsonb, meta_response jsonb,
  status text default 'pending', -- pending|sent|accepted|error|skipped
  attempts int default 0, next_retry_at, error text, sent_at, created_at,
  UNIQUE (opportunity_id, event_name) )
```

### 3.5 Auditoria e operação

```sql
audit_logs ( id bigserial pk, at timestamptz default now(), user_id uuid, action text, entity text, entity_id text,
  old_value jsonb, new_value jsonb, ip text, ua text )  -- append-only
integration_health ( provider text pk, status text, last_ok_at, last_error_at, last_error text, details jsonb, checked_at )
sync_runs ( id uuid pk, provider text, operation text, started_at, finished_at, ok bool, items int, error text, meta jsonb )
```

### 3.6 Índices

`contacts(phone_e164) UNIQUE` · `opportunities(contact_id)`, `(status, stage)`, `(sdr_id)`, `(closer_id)`, `(created_at)`, `(whatsapp_connection_id)` · `funnel_events(opportunity_id, occurred_at)`, `(contact_id)`, `(event_type, occurred_at)` · `marketing_touchpoints(opportunity_id)`, `(ctwa_clid)`, `(ad_id)`, `(campaign_id)`, `(happened_at)` · `messages(wamid) UNIQUE`, `(opportunity_id, wa_timestamp)`, `(contact_id)` · `appointments(scheduled_start)`, `(opportunity_id)`, `(closer_id, scheduled_start)`, `(calendar_event_id) UNIQUE` · `meta_daily_insights(date)`, `(campaign_id, date)` · `integration_webhook_events(status, next_retry_at)`, `(received_at)` · `meta_conversion_events(status)`.

### 3.7 Regras (triggers/funções SQL)

- `crm_e164(text) → text` imutável (BR: 10/11 dígitos ⇒ `+55…`; já com 55 ⇒ `+`; rejeita <12 dígitos).
- `crm_set_stage(opportunity_id, new_stage, actor, source, metadata)` — única porta de mudança de estágio: atualiza projeção, carimba `*_at`, grava `funnel_events`, grava `audit_logs`. UI e webhooks só chamam ela (RPC `security definer` com checagem de papel).
- `trg_opportunities_no_direct_stage`: bloqueia `UPDATE opportunities SET stage` fora da função (via `current_setting('crm.via_fn')`).
- `crm_ingest_inbound(...)`: usada pelo webhook — localiza/cria `contact`, aplica regra de reabertura (`reopen_window_days`), cria/reaproveita `opportunity`, grava `message`, `touchpoint` (se referral), eventos `lead_created`/`whatsapp_first_message`/`lead_responded`. Tudo numa transação.
- `crm_attribution()`: first touch = primeiro touchpoint da oportunidade; last touch = último touchpoint com `happened_at ≤ won_at` (ou agora). Nunca reatribui oportunidade fechada.

---

## 4. Fluxo completo Meta → WhatsApp → CRM → Calendar → Meet → Venda → CAPI

```
[Meta Ads]  anúncio CTWA (ad_id)
   │ clique
   ▼
[WhatsApp do lead] mensagem pré-preenchida → número do SDR (phone_number_id)
   │ webhook POST /wa-webhook  (X-Hub-Signature-256 validada com APP_SECRET)
   ▼
[wa-webhook]  1. grava integration_webhook_events (UNIQUE wamid)  → 200 OK
              2. phone_number_id → whatsapp_connections → sdr_id
              3. crm_e164(from) → contacts (find/create)
              4. regra de reabertura → opportunities (find open / create)
              5. messages (inbound, is_ad_prefilled = body == referral.welcome_message.text)
              6. referral? → marketing_touchpoints (ctwa_clid, source_id=ad_id, headline, body, raw)
                              first_touchpoint_id se vazio; last_touchpoint_id sempre
              7. funnel_events: lead_created + whatsapp_first_message  (ou lead_responded)
              8. notificacoes p/ SDR
   │
   ▼  smb_message_echoes / messages outbound do SDR
[wa-webhook]  messages(outbound) → funnel_events sdr_first_response (1ª vez) → opportunities.first_sdr_response_at
   │
   ▼  cron 1h (pg_cron → meta-sync)
[meta-sync]   touchpoints sem enriched_at → GET /{ad_id}?fields=name,adset{..},campaign{..},creative{..}
              → preenche campaign/adset/ad/creative + snapshots em meta_*; insights diários D-3..D0 → meta_daily_insights
   │
   ▼  SDR na UI
[Pipeline]    crm_set_stage(… 'qualificado' …)  → funnel_event qualified
              Agendar → escolhe closer + horário → edge google-agenda/crm_agendar:
                freebusy.query (closer) → events.insert(conferenceDataVersion=1, attendees) 
                → appointments (calendar_event_id, conference_id, meet_url) → funnel_event appointment_created
   │
   ▼  após scheduled_end + 15 min (cron → meet-attendance)
[Meet API]    conferenceRecords.list(filter space.meeting_code=conference_id) → participants → participantSessions
              → meeting_attendance (1 linha por participante/sessão)
              → regra: ≥1 participante externo ≥ attended_min_minutes ⇒ 'compareceu' ; nenhum ⇒ 'no_show' ;
                sem registro/anônimo ambíguo ⇒ 'indeterminado' (closer confirma manualmente; override auditado)
              → crm_set_stage + funnel_event meeting_attended | no_show
   │
   ▼  closer na UI
[Negociação]  proposal → won (revenue obrigatório) | lost (lost_reason_id obrigatório)
              → funnel_events won/lost, audit_logs, opportunities.status
   │
   ▼  trigger AFTER won → meta_conversion_events(pending)  (UNIQUE opportunity_id+event_name)
[capi-send]   se first_touchpoint.ctwa_clid: POST /{dataset_id}/events
              { event_name: Purchase, action_source: business_messaging, messaging_channel: whatsapp,
                user_data: { whatsapp_business_account_id, ctwa_clid (SEM hash) },
                custom_data: { value, currency: 'BRL', order_id: opportunity_id } }
              → status sent/accepted/error + retry backoff (1m, 5m, 30m, 2h, 12h)
   │
   ▼
[Dashboards]  só SQL: v_funnel_daily ⋈ meta_daily_insights → Investimento→Leads→Respondidos→Qualificados→
              Agendados→Compareceram→Vendas→Receita; CPL, CAC, ROAS, ROI; drill Campaign→AdSet→Ad→Leads→Opp
```

Definições fixas (SQL, `docs/funnel-metrics.md`): LEAD = `funnel_events.lead_created`; CONTATADO = `sdr_first_response`; RESPONDIDO = `lead_responded` (inbound **após** `sdr_first_response` e com `is_ad_prefilled=false`); QUALIFICADO = `qualified`; AGENDADO = `appointments.status ∉ (canceled)`; COMPARECEU = `meeting_attended`; NO-SHOW = `no_show`; VENDA = `status='won' and revenue>0`; PERDIDO = `status='lost' and lost_reason_id not null`. Todas com divisão protegida (`nullif(x,0)`).

---

## 5. Credenciais e configurações necessárias (quem provê: administrador)

| Chave (onde fica) | Para quê | Onde obter |
|---|---|---|
| `META_APP_ID`, `META_APP_SECRET` (Edge Secrets) | Embedded Signup, validar assinatura de webhook, trocar `code` por token | developers.facebook.com → App → Configurações básicas |
| `META_ES_CONFIG_ID` (Edge Secrets) | Embedded Signup v4 (WhatsApp + coexistência) | App → Facebook Login for Business → Configurations |
| `WA_VERIFY_TOKEN` (Edge Secrets) | `hub.verify_token` do webhook | gerar aleatório |
| Token por WABA (Vault, gravado pelo callback do Embedded Signup) | Ler/escrever na WABA de cada número | automático após o signup |
| `META_SYSTEM_USER_TOKEN` (Vault, por `meta_ad_accounts`) | Marketing API `ads_read` na conta da casa `act_1784945562132417` | Business Settings → System Users → gerar token com `ads_read`, `business_management` (leitura) |
| `META_DATASET_ID` (por conexão, `whatsapp_connections.dataset_id`) | CAPI for Business Messaging | `POST /{WABA_ID}/dataset` (o sistema cria) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (já existem) | OAuth do closer/SDR | Google Cloud Console → OAuth client (adicionar escopos `calendar.events`, `calendar.freebusy`, `meetings.space.readonly`; app precisa de verificação por escopo *sensitive*) |
| Refresh token por usuário (Vault, `google_connections.token_secret_id`) | Calendar/Meet em nome do closer | automático no callback |
| `CRM_CRON_SECRET` (Edge Secrets + `vault`) | `pg_cron` chamar edge functions com `pg_net` | gerar aleatório |
| Pré-requisitos Meta (fora de código) | Business Verification; App Review para `whatsapp_business_messaging`, `whatsapp_business_management`, `whatsapp_business_manage_events` (Advanced Access); Tech Provider p/ coexistência; forma de pagamento na WABA | Meta Business Suite |

---

## 6. Plano por fases (com escopo de arquivos)

| Fase | Entrega | Arquivos/objetos | Gate |
|---|---|---|---|
| **1** ✅ | Este documento | `docs/ARQUITETURA.md` | — |
| **1.5** | Base técnica: `crm.js/crm.css` vazios ligados ao `index.html`; `publicar-arquivo` aceita `.js/.css/.md` e pasta `docs/`; ESLint + `tsc --checkJs` + `testes/crm.test.js`; corrigir 5 testes vermelhos | `index.html` (1 linha), `crm.js`, `crm.css`, `package.json`, `.eslintrc`, `tsconfig.json`, edge `publicar-arquivo` | `node testes/rodar.js` 100% verde |
| **2** | Migrations 3.1 + 3.5 (`contacts, opportunities, funnel_events, marketing_touchpoints, lost_reasons, crm_settings, audit_logs`), `wa_estagios` ampliada, `perfis.papel_crm`, funções `crm_e164`, `crm_set_stage`, `crm_ingest_inbound`, RLS, pgtap | `supabase/migrations/2026090x_crm_core.sql`, `testes/sql/*.sql` | pgtap verde; normalização/dedup/reabertura testadas |
| **3** | `whatsapp_connections`, `messages`, `integration_webhook_events`; edge `wa-webhook` (assinatura, raw-first, idempotência, multi-número, parsing referral, echoes); cron de reprocesso; tela Integrações → WhatsApp (admin) | edge `wa-webhook`, `crm-reprocess`; `crm.js` (aba Integrações) | fixtures de payload Meta (texto, referral, echo, status, duplicado) passando |
| **3b** | Embedded Signup v4 (coexistência) conforme opção escolhida; ou cadastro manual de `phone_number_id` + token no Vault (fallback imediato) | edge `wa-onboard`, `crm.js` | número de teste conectado; webhook recebido |
| **4** | Tabelas `meta_*`; edge `meta-sync` (estrutura + insights `time_increment=1`, enriquecimento de touchpoints por `ad_id`); `pg_cron` hora a hora; tela Integrações → Meta Ads | edge `meta-sync`, migration `crm_meta.sql`, `crm.js` | touchpoint enriquecido com campaign/adset/ad; insights de 30 dias no banco |
| **5** | Pipeline novo (Kanban + ficha da oportunidade com card "Origem do Lead", timeline unificada, motivos de perda, valor/receita, troca de responsável) e views/RPC de métricas; substitui sub-aba WhatsApp do funil | `crm.js`, `crm.css`, migration `crm_views.sql` | testes das fórmulas (CPL, CAC, ROAS, ROI, show rate, close rate) em JS e SQL |
| **6** | `appointments`, `google_connections` (Vault); edge `google-agenda` estendida (`crm_freebusy`, `crm_agendar`, `crm_reagendar`, `crm_cancelar`, `conferenceData`); tela Agenda | edge `google-agenda`, migration `crm_agenda.sql`, `crm.js` | evento criado com Meet; reagendamento encadeia `rescheduled_from_id` |
| **7** | `meeting_attendance`; edge `meet-attendance` (cron pós-reunião); regra configurável; override manual auditado | edge `meet-attendance`, `crm.js` | fixture de conferenceRecord → compareceu/no-show/indeterminado |
| **8** | Dashboard executivo (funil com conversões, 15 cards), Relatório por campanha/anúncio com drill-down até a oportunidade, dashboards SDR e closer, filtros globais | `crm.js`, `crm.css`, RPC `crm_dashboard` | as 23 perguntas do critério de sucesso respondidas só pelo sistema |
| **9** | `meta_conversion_events`, trigger em `won`, edge `capi-send` com retry/backoff, painel Pendente/Enviado/Aceito/Erro | edge `capi-send`, migration `crm_capi.sql`, `crm.js` | Purchase duplicado bloqueado por UNIQUE; erro transitório reenviado |
| **10** | Hardening: `integration_health` + tela Saúde, logs estruturados, retenção de webhooks, revisão RLS/RBAC (SDR/closer sem credenciais), migrar `agenda_google.refresh_token` → Vault, docs `/docs/integrations/*.md`, `attribution.md`, `funnel-metrics.md` | edge `crm-health`, docs | checklist de segurança; testes RBAC |

Em cada fase: lista de arquivos → decisão → implementação → `eslint` + `tsc` + `node testes/rodar.js` + pgtap → publicar com rollback anotado.

---

## 7. Critério de sucesso — mapeamento pergunta → fonte

| Pergunta | Fonte no banco |
|---|---|
| Quanto investimos / leads / CPL / CAC / ROAS / ROI | `meta_daily_insights` ⋈ `v_funnel_daily` (filtros de período, campanha, conjunto, anúncio, conta) |
| Qual SDR recebeu cada lead | `opportunities.sdr_id` ← `whatsapp_connections.assigned_user_id` |
| Quantos responderam / agendados / compareceram / vendidos | `funnel_events` (`lead_responded`, `appointment_created`, `meeting_attended`, `won`) |
| Qual closer vendeu / receita | `opportunities.closer_id`, `revenue` |
| Qual campanha/conjunto/anúncio gerou a receita | `opportunities.first_touchpoint_id → marketing_touchpoints.(campaign_id, adset_id, ad_id)` |
| Anúncio barato que não vende / caro que vende | `v_ad_perf` (spend, leads, CPL, sales, CAC, ROAS por `ad_id`) |
| Qual SDR agenda melhor / melhor taxa de resposta | `v_sdr_perf` |
| Show rate / close rate do closer | `v_closer_perf` |
| Quais vendas devolvemos via CAPI | `meta_conversion_events.status` |
