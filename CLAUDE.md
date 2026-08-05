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
mantida por substituição manual de arquivo — é essa cópia que os usuários
reais normalmente acessam, não necessariamente a URL pública do GitHub Pages.
Por isso, "mesclou em `main`" não é o mesmo que "chegou em quem usa de
verdade": qualquer `.html` alterado aqui também precisa ser enviado
completo, junto com o `.gs` quando for o caso, para a pessoa responsável
poder substituir manualmente nesse ambiente.

**Fluxo de entrega de qualquer arquivo que exija passo manual em produção**
(hoje isso é `apps-script-backlog.gs` sempre, e qualquer `.html` alterado
sempre que a mudança também precisa valer no ambiente espelhado do cliente):

1. A pessoa responsável decide quando aplicar em produção e pede o arquivo
   quando quiser — não presuma que "commitei/mesclei" significa "já está em
   produção" para esse tipo de arquivo.
2. Toda alteração relevante precisa ser informada explicitamente (o que
   mudou e por quê) e o(s) arquivo(s) completo(s) e atualizado(s)
   enviado(s) para substituição, mesmo sem ser pedido — não deixe a pessoa
   descobrir sozinha que havia uma mudança pendente de aplicar.

`BACKLOG_SCRIPT_VERSION` no topo do arquivo deve ser incrementado a cada
mudança, e conferido via `?action=health` depois do redeploy.

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
