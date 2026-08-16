# leadtime-dash — guia para trabalhar neste repositório

## Diretriz permanente

Toda melhoria ou correção precisa funcionar **para todos os usuários, em qualquer
navegador**, de forma consistente — não só "no meu teste". Isso não é negociável
por página ou por feature: vale para o dashboard principal, para o Discovery PMO
Tracker, para a Visão de Projetos e para qualquer página nova que vier a existir
aqui. Concretamente, isso significa:

- Toda chamada nova ao Apps Script (JSONP) precisa ter timeout e retry
  automático — nunca uma chamada de tentativa única. Veja "Padrão de
  resiliência" abaixo antes de escrever uma chamada nova.
- Qualquer estado que devesse ser "igual pra todo mundo" (regra ativa, base de
  dados, configuração compartilhada) precisa sincronizar via
  `saveVpData`/`getVpData` no Apps Script — nunca só em `localStorage`. Se
  você achar um lugar que devia sincronizar e não sincroniza, é bug, corrija.
- Antes de considerar uma correção de sincronização "pronta", teste como
  descrito em "Como validar" abaixo — não é suficiente o diff "parecer certo".
- Este repositório é **público**. Nunca commitar segredo, token, senha,
  chave de API, nome de cliente/empresa ou qualquer URL de produção que não
  devesse ser pública em nenhum arquivo aqui (incluindo este `CLAUDE.md`) —
  nem mesmo em comentário ou mensagem de commit. Se precisar registrar algo
  sensível para uma sessão futura, avise a pessoa responsável em vez de
  escrever no repositório.

## Arquitetura

Site estático publicado no GitHub Pages (deploy automático a cada push em
`main`, via `.github/workflows/pages.yml`). Várias páginas HTML independentes,
cada uma com sua própria cópia de um cliente JSONP, todas falando com o
**mesmo** backend Google Apps Script (`apps-script-backlog.gs`), identificado
pela constante `BK_GAS_URL` / `DISC_GAS_URL` / `_VP_GAS_URL` / `GAS` conforme o
arquivo:

- `index.html` — dashboard principal ("SALA — Lead Time"). Cliente JSONP:
  `_gasJsonp`.
- `discovery-pmo/index.html` — Discovery PMO Tracker. Cliente JSONP:
  `_discGasJsonp`.
- `discovery-pmo/report-semanal.html` — relatório semanal do Discovery.
  Cliente JSONP: `jsonp` (baseado em Promise).
- `visao-projetos/index.html` — Visão de Projetos. Cliente JSONP:
  `_vpGasJsonp`.
- `visao-projetos/report-semanal-operacional.html` — relatório semanal
  operacional. Cliente JSONP: `jsonp` (baseado em Promise).

`apps-script-backlog.gs` é a fonte de verdade do backend, mas **não tem deploy
automático**. Alterá-lo aqui não basta: alguém precisa colar o arquivo
atualizado no editor do Apps Script (script.google.com) e reimplantar como
"Nova versão" na implantação **existente** (nunca "Nova implantação" — isso
gera uma URL `/exec` diferente e quebra todo mundo que aponta pra URL antiga).

**GitHub Pages não é o único lugar onde as páginas HTML são servidas.** Existe
também uma cópia hospedada no ambiente do cliente (fora deste repositório),
mantida por substituição manual de arquivo, espelhando **a mesma estrutura de
pastas deste repositório** (ex.: `visao-projetos/index.html` daqui vai na
pasta `visao-projetos/` de lá, `discovery-pmo/index.html` vai em
`discovery-pmo/`, etc.). É essa cópia que os usuários reais normalmente
acessam, não necessariamente a URL pública do GitHub Pages. Por isso,
"mesclou em `main`" não é o mesmo que "chegou em quem usa de verdade".

**Checklist de entrega ao final de QUALQUER alteração de código neste
projeto** (pedido explícito da pessoa responsável — sempre, mesmo sem ser
pedido de novo a cada vez):

1. O arquivo completo alterado (nunca só o trecho/diff) — pronto pra baixar e
   substituir direto.
2. O caminho exato da pasta de destino, espelhando a estrutura deste repo
   (ver acima).
3. Se a alteração for em `apps-script-backlog.gs`: avisar explicitamente que
   esse arquivo **não é upload direto** — precisa colar o conteúdo no editor
   do Google Apps Script e criar uma **Nova versão** de implantação (nunca
   "Nova implantação").
4. Um resumo curto e direto do que mudou e por quê — sem economizar nos
   detalhes técnicos se algo for crítico (bug de perda de dado, travamento,
   etc.).
5. Se mais de um arquivo mudou, entregar todos juntos, prontos pra
   substituir de uma vez — não em rodadas separadas.

**Formato validado pela pessoa responsável para o item 1+2**: uma tabela
`# | Arquivo | Onde substituir no ambiente do cliente`, uma linha por
arquivo tocado na sessão, com a pasta de destino na 2ª coluna — e um
destaque em texto na mesma linha quando aquele arquivo carrega a correção
de algo crítico (ex.: "este tem a correção do bug de X"). Exemplo real já
validado:

| # | Arquivo | Onde substituir no ambiente do cliente |
|---|---|---|
| 1 | `index.html` | Raiz do projeto |
| 2 | `apps-script-backlog.gs` | Não é arquivo de pasta — precisa ser colado no editor do Google Apps Script e implantado como Nova versão (não é upload de arquivo) |
| 3 | `visao-projetos/index.html` | Pasta `visao-projetos/` |
| 4 | `discovery-pmo/index.html` | Pasta `discovery-pmo/` |

Arquivos deste repositório que **não fazem parte do espelho** (não precisam
ser entregues, mesmo que alterados) — confirmado pela pessoa responsável:
`.github/workflows/*` (automação interna do GitHub, não se aplica),
`tests/apps-script-backlog.test.js` (só usado em desenvolvimento) e
`boletim-ds/**` (ferramenta interna separada, com seu próprio README). Se um
arquivo novo/desconhecido entrar em um diff, pergunte antes de presumir se
ele faz parte do espelho ou não — não adivinhe.

`BACKLOG_SCRIPT_VERSION` no topo do arquivo deve ser incrementado a cada
mudança, e conferido via `?action=health` depois do redeploy.

## Checklist de importação completa (Jira → dashboard)

O botão "🌐 Importar Tudo" (`index.html`, função `loadMultipleFiles` /
`detectUnifiedFileType`) aceita vários arquivos de uma vez e roteia **cada
um automaticamente** pro destino certo, por nome/conteúdo do arquivo — não
existe uma etapa manual de "escolher pra onde vai". Isso é importante
porque **importar só parte dos arquivos não é erro** (a importação
funciona normalmente e não avisa nada de errado) — só atualiza as áreas
correspondentes aos arquivos entregues, e o resto do site continua com o
dado antigo até a próxima importação que inclua o que falta.

Pra atualizar **tudo de uma vez** (dashboard principal, Discovery PMO
Tracker e Visão de Projetos), a rotina precisa reunir os 7 relatórios do
Jira abaixo antes de clicar em "Importar Tudo":

| # | Arquivo (contém no nome) | Tipo detectado | Atualiza |
|---|---|---|---|
| 1 | Épicos Pós-Identificado | `epics` | Tab Épicos |
| 2 | Qtd Épicos atrelados a Story | `stories` | Tab 📋 Qtd Story/Épicos |
| 3 | Story no Backlog Refinadas | `backlog` | Tab Backlog/Refinamento + **Demandas Emergenciais** |
| 4 | Acomp. Geral (Todas Squads) | `general_visao` | Visão de Projetos |
| 5 | Sprint ativa (Story, Melhorias e Bug) | `sprint_visao` | Visão de Projetos |
| 6 | Story em Homologação com data | `homologation_visao` | Visão de Projetos + SLA |
| 7 | Ops4Ops Refinada x Backlog | `ops4ops` | Discovery PMO Tracker |

Note que o arquivo 7 tem "Backlog" no nome mas **nunca** vai para a tab
Backlog do dashboard principal — `detectUnifiedFileType` prioriza a
detecção de "ops4ops" no nome de propósito (comentário no código: "Ops4Ops
tem a mesma estrutura e pode conter 'Backlog' no nome, mas sua fonte é o
Discovery PMO — nunca pode entrar no Backlog geral"). Quem não souber
disso pode achar que importou o Backlog quando na verdade importou pro
Discovery.

**Sintoma de quando falta o arquivo 3 especificamente**: uma história que
já apareceu em Demandas Emergenciais (via snapshot de Backlog confirmado)
muda de status no Jira pra algo diferente de "Product Backlog" (ex.: "Em
Desenvolvimento") — isso a tira do relatório de Backlog, e ela só continua
visível em Demandas Emergenciais se a base de Estórias (arquivo 3) for
reimportada com o status novo. Sem isso, a história some de Demandas
Emergenciais **e de qualquer outro lugar do dashboard principal**, mesmo
que ela apareça normalmente nos arquivos 4-7 (que vão pra outras páginas).
Caso real: card SLOPC-42490, 12/08/26 — sumiu de Demandas Emergenciais
porque só os arquivos 4-7 tinham sido importados naquele dia.

## Padrão de resiliência (histórico: falha "Não foi possível sincronizar")

Causa raiz recorrente: o hop `script.google.com` → conteúdo real da resposta
(`script.googleusercontent.com/macros/echo`) ocasionalmente atrasa ou falha
sozinho, sem relação com o payload ou com bug de código. Sintomas no console:
`Uncaught ReferenceError: _gasJP_... is not defined` e/ou 404 em
`.../macros/echo?user_content_key=...`. Isso é agravado por
`LockService.getScriptLock()` no Apps Script ser um lock **único para o script
inteiro**, compartilhado por todas as ações (leitura e escrita, todas as
chaves) — sob uso concorrente, até uma leitura simples pode esperar a vez e
"a" tentativa falhar.

Duas camadas de proteção, aplicadas em toda chamada nova:

1. **Retry de transporte**, dentro do próprio cliente JSONP (`_gasJsonp`,
   `_discGasJsonp`, `_vpGasJsonp`, ou o `jsonp` baseado em Promise): 1 retry
   automático (2s de respiro) em timeout e em `script.onerror`, antes de
   repassar a falha pro chamador. Isso já existe em todos os 5 clientes
   listados acima — se você adicionar outro, replique o mesmo padrão.
2. **Retry de conteúdo**, na função que consome a resposta: mesmo com o
   transporte OK, a resposta pode chegar com `ok:false` ou vazia (contenção de
   lock do lado do servidor). Funções que fazem essa checagem
   (`gasLoadOps4opsFromDiscovery` em `index.html`; `vp()`/`loadBacklogData()`
   em `visao-projetos/report-semanal-operacional.html`;
   `loadLiveDiscoveryData()` em `discovery-pmo/report-semanal.html`) devem
   tentar de novo 1x (2s de respiro) antes de desistir/cair em fallback.

Ao escrever uma chamada nova ao Apps Script, implemente as duas camadas desde
o início — não espere reproduzir a falha em produção para adicionar retry.

## Padrão de polling: ping de revisão em vez de buscar tudo (histórico: 05/08)

Motivação: os 3 painéis com sincronização automática (`index.html`,
`discovery-pmo/index.html`, `visao-projetos/index.html`) buscavam os dados
COMPLETOS num relógio fixo, mesmo quando nada tinha mudado desde a última vez
— pior caso encontrado: Discovery PMO Tracker a cada **15 segundos**;
`index.html` e Visão de Projetos a cada 2 min (a Visão de Projetos, além
disso, disparava 9 chamadas separadas por ciclo, uma por chave de
`VP_SHEET_MAP`). Com várias pessoas de aba aberta o dia todo, isso multiplica
exatamente o padrão de disputa de lock que já causou o esgotamento de cota do
incidente de 04–05/08 acima — mesmo sem nenhum bug, só de rodar o relógio.

**Correção (v21 do `apps-script-backlog.gs`)**: cada aba já tinha um contador
de revisão em Script Properties (`REV_<sheet>`, incrementado a cada escrita —
ver `bumpRevision_`), só não era exposto de forma barata. `action=getRevisions`
devolve SÓ esses contadores (backlog, stories, cada chave de `VP_SHEET_MAP`) —
sem ler planilha, sem lock. O polling automático dos 3 painéis passou a fazer
esse ping barato primeiro, e só busca os dados completos (a chamada de sempre,
inalterada) quando a revisão relevante realmente mudou:

- `index.html`: `gasCheckBacklogRevision()` no lugar de `gasLoadBacklog()`
  direto no `setInterval`.
- `discovery-pmo/index.html`: `discGasCheckRevision()` no lugar de
  `discGasSyncPull()` direto — era o maior consumidor de longe.
- `visao-projetos/index.html`: `gasCheckVpRevisionsAndApply()` — um único
  ping cobre as 9 chaves, e só as que mudaram disparam `gasLoadVpData`
  individual.

Todos os três: pausam quando `document.hidden` (aba em segundo plano não
gasta nem o ping), resincronizam na hora em `visibilitychange` ao voltar o
foco, e mantêm um resync completo incondicional bem espaçado (10–15 min) como
rede de segurança — mesmo espírito do "janelas abertas convergem sozinhas"
já usado no backlog. Os relatórios semanais (`report-semanal.html`,
`report-semanal-operacional.html`) não têm polling automático nenhum — só
carregam ao abrir a página — então não entram nesse padrão.

**Armadilha a NÃO repetir**: já existe um endpoint `getVpDataAll` que
consolida as 9 chaves da Visão de Projetos numa única chamada — parece a
solução óbvia para reduzir chamadas, mas **foi tentado e revertido duas
vezes** (`visao-projetos/index.html` e `report-semanal-operacional.html`,
ver `git log`): o payload combinado fica grande demais e chega truncado no
meio para quem acessa atrás de proxy corporativo, travando a sincronização em
silêncio (JSONP via `<script>` não detecta resposta cortada no meio — sem
timeout específico pra esse caso, trava pra sempre). Por isso
`action=getRevisions` devolve só números (payload sempre pequeno) e o
ping-e-busca continua usando as chamadas pequenas de sempre, uma por chave —
nunca consolide múltiplas chaves ou dados grandes numa única resposta JSONP
sem confirmar que ela não estoura esse limite.

Se adicionar um novo polling automático no futuro, siga o mesmo padrão: ping
de revisão + busca condicional, nunca um relógio fixo buscando tudo.

## Eleição de aba líder + pausa por inatividade (histórico: 15/08, v23)

Motivação: mesmo com o ping de revisão da seção anterior, uma pessoa só pode
multiplicar o consumo sozinha — usuária real flagrada com **10 janelas do
mesmo painel abertas ao mesmo tempo** no ambiente do cliente, cada uma
fazendo o próprio ping de revisão no mesmo ritmo. 10x o necessário para uma
única pessoa, sem nenhum bug envolvido, só do jeito que o navegador foi
usado.

**Correção (v23)**: os 3 painéis (`index.html`, `discovery-pmo/index.html`,
`visao-projetos/index.html`) ganharam duas camadas novas, sempre em cima do
ping de revisão já existente — nunca no lugar dele:

1. **Pausa por inatividade**: além de pausar quando `document.hidden`
   (aba em segundo plano), agora também pausa quando a aba está **visível
   mas sem interação** (mouse/teclado/scroll/toque) há 5 minutos —
   `_bkIsIdle()` / `_discIsIdle()` / `_vpIsIdle()`. Cobre o caso de aba
   aberta numa tela que ninguém está olhando. Qualquer interação retoma o
   ritmo normal na hora; não é um risco de dado ficar escondido, só evita
   gastar ping à toa em aba esquecida.
2. **Eleição de líder por `localStorage`**: entre várias abas do MESMO
   painel no MESMO navegador, só uma vira "líder" (heartbeat em
   `localStorage`, chave `sala_leader_<painel>_v1`) e de fato chama o
   Apps Script a cada tick — `_bkClaimOrIsLeader()` /
   `_discClaimOrIsLeader()` / `_vpClaimOrIsLeader()`. As demais ficam
   ouvindo o evento `storage` na chave `sala_shared_rev_<painel>_v1`: a
   líder publica a(s) revisão(ões) mais recente(s) que conhece a cada
   ciclo, e uma seguidora só dispara sua PRÓPRIA busca completa quando
   percebe uma revisão diferente da que já tinha — ou seja, o custo de N
   abas ociosas-mas-vivas continua sendo só o de uma. Se a aba líder for
   fechada, o heartbeat expira (2,5x o intervalo do painel) e a próxima
   aba que ticar assume sozinha, sem F5. `localStorage` indisponível (ex.:
   navegação anônima bloqueando) faz a aba agir sozinha, como antes da v23
   — nunca trava por causa disso.

**Isso é ortogonal ao ping de revisão, não substitui**: o ping de revisão
decide "vale a pena buscar tudo?"; a eleição de líder decide "sou eu quem
deveria estar perguntando isso agora, ou já tem outra aba minha cuidando?".
As duas camadas continuam funcionando mesmo com uma desativada — útil pra
depurar isoladamente se um dia for preciso.

**Ops4Ops (`OPS4OPS_LEAN_CACHE_TTL_SEC`, apps-script-backlog.gs)**: subiu de
10 para 25 min na mesma leva. Isso NÃO atrasa a visibilidade de uma
importação — a invalidação em `saveVpData/discoveryPmo` já limpa o cache **na
hora**, para todo mundo, independente do TTL (ver v19 no cabeçalho do
arquivo); o TTL só controla quanto tempo o cache sobrevive quando ninguém
grava nada, então esticá-lo só reduz quantas vezes por hora o
reprocessamento caro acontece à toa.

**Como validar mudança nesse mecanismo**: harness Node com `vm`, múltiplas
"abas" (sandboxes separados) compartilhando a MESMA instância de
`localStorage` falso — não basta 1 sandbox só, o ponto é provar que 10 abas
concorrendo pela mesma chave resultam em exatamente 1 líder por rodada. Ver
histórico de commits deste arquivo para o modelo do harness.

## Armadilhas conhecidas deste repositório

- **Funções duplicadas**: vários arquivos aqui têm a mesma função declarada
  mais de uma vez (histórico de patches incrementais). Em JS, a **última**
  declaração no arquivo é a que vale — as anteriores são código morto. Antes
  de editar uma função, confirme com
  `grep -n "function nomeDaFuncao"` que está editando a que realmente executa.
- **Deriva de branch após squash merge**: squash merge no GitHub reescreve o
  histórico em `main`, mas não atualiza o branch de origem. Se você continuar
  commitando no mesmo branch de trabalho depois de um squash merge sem
  sincronizar primeiro, o próximo PR desse branch pode aparecer como
  conflitante mesmo sem conflito real de conteúdo — ou, pior, tentar reverter
  uma mudança que outra sessão/PR mesclou em paralelo em `main`. Antes de
  continuar trabalhando em um branch de longa duração (e sempre antes de
  abrir um novo PR a partir dele), rode `git fetch origin main` e confira
  `git diff origin/main HEAD` por arquivo — se algo que você não tocou
  aparecer divergente, é sinal de que `main` avançou em paralelo; reconstrua o
  branch a partir de `origin/main` e reaplique (cherry-pick) só os commits
  realmente novos antes de abrir/mesclar o PR.

## Histórico: incidente de sincronização de 04–05/08

Registro técnico do que foi investigado e corrigido, para não precisar
reconstruir esse raciocínio do zero numa próxima sessão.

**Sintomas relatados**: "Não foi possível sincronizar o Ops4Ops", painéis com
números divergentes entre navegadores/abas, "Demandas Emergenciais" vazio em
um navegador e populado em outro, Discovery PMO Tracker preso em
"Sincronizando…" por vários minutos.

**Causas identificadas, em ordem de investigação**:

1. Endpoint novo (`getOps4opsData`) chamado pelo cliente antes do backend
   correspondente ser reimplantado manualmente no Apps Script (ver "não tem
   deploy automático" acima) — corrigido redeploy manual.
2. `getOps4opsData` lia e reprocessava a base completa do Discovery a cada
   chamada mesmo depois de enxugar a resposta — corrigido com cache
   (`CacheService`) de ~10 min, invalidado ativamente a cada gravação.
3. `LockService.getScriptLock()` é um lock único pra todo o script (ver
   "Padrão de resiliência" acima); 10s de espera era pouco sob uso
   concorrente — aumentado para 20s.
4. Nenhum dos 5 clientes JSONP tinha retry; um deles (`_vpGasJsonp`) nem
   tinha timeout — o hop instável do content-echo do Google (ver "Padrão de
   resiliência") deixava qualquer chamada vulnerável a uma falha transitória
   definitiva. Corrigido com as duas camadas de retry descritas acima.
5. Timeout do cliente (18–20s em alguns arquivos) menor que o novo
   `LOCK_TIMEOUT_MS` do servidor (20s) — o cliente podia desistir antes do
   servidor terminar de esperar a vez. Todos os clientes agora usam 28s.
6. **Empilhamento de retry**: 3 funções em `index.html`
   (`gasLoadBacklog`/`gasLoadStories`/`gasLoadOps4opsFromDiscovery`) já
   tinham retry externo próprio (2 tentativas) antes do retry genérico
   entrar no `_gasJsonp` (mais 1 tentativa) — as duas camadas se
   multiplicaram sem que isso fosse percebido, gerando um pior caso de quase
   5 minutos antes de desistir. **Lição**: ao adicionar retry num nível mais
   baixo/genérico, sempre auditar se os chamadores já não tinham o próprio
   retry por cima — nunca empilhar duas camadas de retry sem querer. Essas
   três funções agora desligam o retry interno do `_gasJsonp`
   (`retriesLeft=0` explícito) e mantêm só uma camada.
7. `renderSquadOverview()` do Discovery PMO Tracker, ao proteger contra
   mostrar dado local desatualizado (ver item seguinte), reescrevia a tela
   pra "Sincronizando…" em **todo** redesenho enquanto não sincronizasse —
   inclusive depois de uma tentativa já ter falhado de vez, escondendo o
   erro real e dando a falsa impressão de que ainda estava tentando.
   Corrigido guardando o último status real conhecido
   (`_discSyncStatusMessage`) em vez de um texto fixo.
8. Causa de fundo (não corrigível por código): o volume de testes do dia
   (dezenas de redeploys manuais, centenas de chamadas, os retries
   multiplicados do item 6) esgotou a cota diária de execução do Apps
   Script, que só resolveu sozinha depois do reset diário do Google.

**Outros achados de robustez, aplicados durante a mesma investigação**:

- Regra ativa de "Demandas Emergenciais" (`emergencyRuleId`) era salva só em
  `localStorage`, nunca em `emergencyState.config.activeRuleId` no servidor
  — cada navegador podia ficar preso numa regra diferente da do resto do
  time. Corrigido: `emSelectRule` agora sincroniza essa escolha.
- Dashboard de Squads do Discovery PMO Tracker renderizava com o que
  estivesse salvo localmente (mesmo desatualizado) antes de confirmar a
  sincronização, por velocidade — sob lentidão do servidor essa janela
  ficou perceptível o bastante para parecer perda de dado. Corrigido:
  `renderSquadOverview()` não desenha nada até `_discRemoteHydrated` ser
  `true`.

## Como validar antes de dizer que está pronto

1. Sintaxe: `node -e "new Function(require('fs').readFileSync(ARQUIVO,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1])"` para cada `<script>` alterado.
2. Testes do backend: `node tests/apps-script-backlog.test.js` (deve ficar
   87/87 ou mais, nunca menos).
3. Para lógica de retry nova, prove com uma simulação comportamental (harness
   Node com DOM falso, injetando falha na 1ª tentativa e sucesso na 2ª) — não
   basta ler o código e concluir que "parece certo". Veja os commits de
   histórico de retry no `git log` deste repo para um modelo de harness.
4. Confirme o deploy: o workflow `Deploy GitHub Pages` precisa terminar com
   sucesso pro commit em questão (a API do GitHub responde mesmo quando o
   `curl`/navegador direto ao site não funciona neste ambiente). Se possível,
   busque o conteúdo do arquivo publicado via API do GitHub no SHA do commit
   mesclado e confirme que a mudança está lá — não assuma que "mesclou" quer
   dizer "está no ar".
