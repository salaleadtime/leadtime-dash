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
