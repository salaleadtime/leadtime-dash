# ✅ Checklist de Deploy — Apps Script (estórias, backlog e Discovery PMO)

> Lembrete: o `index.html` sobe sozinho pelo GitHub Pages a cada push no `main`.
> O **Apps Script NÃO** — ele precisa ser publicado manualmente. Use esta lista
> sempre que mexer em `apps-script-backlog.gs`.

## ⚠️ ANTES DE COLAR: conferir se o repositório está atualizado

Este arquivo `.gs` já ficou **atrás da produção** uma vez: o repositório estava na
v11 enquanto o publicado já rodava a v12 (`2026-07-27-discovery-raid-area-v12`,
com a normalização de área do RAID). Quem colasse o repositório por cima teria
apagado essa funcionalidade **sem nenhum aviso**.

Então, sempre, **antes** de colar qualquer coisa:

1. Abrir `?action=health` (URL abaixo) e anotar a `version` que está no ar
2. Conferir se essa `version` bate com o `BACKLOG_SCRIPT_VERSION` da linha 41 de
   [`apps-script-backlog.gs`](./apps-script-backlog.gs), ou é **anterior** a ela
3. Se a produção estiver **à frente** do repositório: **pare**. Copie o código
   publicado para cá primeiro, senão a publicação vira uma regressão silenciosa

## Publicar a nova versão

1. Abrir o projeto do Apps Script de `BK_GAS_URL` em https://script.google.com
2. Colar o conteúdo atualizado de [`apps-script-backlog.gs`](./apps-script-backlog.gs)
3. Confirmar que as chaves `discoveryPmo` e `vpPlanningConfirmations` estão no
   `VP_SHEET_MAP` do código publicado
4. Rodar `autorizarPlanilhaUmaVez()` uma vez e aceitar as permissões
5. **Na primeira publicação da v13, rodar também `ativarModoObservacao()`**
   (ver a seção "Camada de proteção de escrita" abaixo)
6. **Implantar → Gerenciar implantações → ✏️ (editar)**
7. No campo **Versão**, escolher **"Nova versão"**
   ⚠️ Não reutilizar uma versão antiga — senão o código editado **não** é publicado
   ⚠️ **Nunca criar uma implantação nova** — isso gera uma URL nova e quebra os três
   dashboards e o ambiente do Bradesco de uma vez
8. **Implantar**

## Verificar (abrir no navegador)

```
https://script.google.com/macros/s/AKfycbxOSQe41hqngh7b0iscE_Bcb_Z2mBfbwfqaaMCU_cKXDfCKnDvsQ6jb2HTPbnLso30C/exec?action=health
```

Resposta esperada (sinais de que deu certo):

```json
{ "ok": true, "version": "2026-07-28-guardas-e-snapshots-v13",
  "stories": 0, "writesEnabled": true, "guardDryRun": true, ... }
```

- ✅ `"version"` = `2026-07-28-guardas-e-snapshots-v13` → versão nova no ar
- ✅ campo `"stories"` presente → ações de estória ativas
- ✅ chave `discoveryPmo` disponível → Discovery PMO ativo no Apps Script publicado
- ✅ `"writesEnabled": true` → gravações liberadas
- ✅ `"guardDryRun": true` → subiu em modo observação (o esperado na 1ª publicação)

> Nota: a v10 chegou a exigir um token (`API_TOKEN`) em toda chamada, mas foi
> revertida — a varredura de segredos do pipeline do Bradesco (GitLeaks) barrava
> o build por causa do valor fixo no código-fonte. Se a Propriedade do Script
> `API_TOKEN` ainda existir de quando isso foi testado, pode apagá-la (Configurações
> do projeto → Propriedades do script) — o código não usa mais essa checagem,
> então ela fica só como propriedade órfã, inofensiva, mas sem função.

## Camada de proteção de escrita (v13)

O Web App é implantado como "qualquer pessoa, mesmo anônima" — o ambiente do
Bradesco consome assim e **também grava** (`flushPendingWrites()`, as migrações de
carga e o `saveData()` do Discovery disparam POST sozinhos, sem ninguém clicar).
Como não dá para controlar *quem* chama, a v13 controla *o que uma chamada
consegue destruir*: guarda contra exclusão em massa, snapshots antes de
sobrescrever, kill switch e trilha de auditoria. Nada disso depende de segredo no
código-fonte — o GitLeaks não é acionado, ao contrário do que houve na v10.

### Rollout em duas etapas

| Quando | O que fazer | Efeito |
| ------ | ----------- | ------ |
| Ao publicar | `ativarModoObservacao()` | A guarda **avalia e registra, mas não bloqueia**. O comportamento fica idêntico ao de hoje. |
| ~48 h depois | Abrir a aba `_audit` e filtrar a coluna `resultado` por `BLOQUEARIA` | Mostra o que seria recusado, **inclusive o que vem do Bradesco** |
| Se a lista não tiver uso legítimo | `ativarGuardas()` | Passa a recusar gravação que zere ou reduza demais a base |

Se aparecer uso legítimo na lista, ajuste `GUARD_MAX_SHRINK` (padrão `0.30`) antes
de ativar, em vez de ativar e descobrir depois.

### Funções administrativas (só pelo editor do Apps Script)

Nenhuma delas tem `action` em `doGet`/`doPost` — de propósito, já que o endpoint
é anônimo.

| Função | Para quê |
| ------ | -------- |
| `ativarModoObservacao()` / `ativarGuardas()` | Alterna entre observar e bloquear |
| `desativarEscritas()` / `reativarEscritas()` | Kill switch: congela gravações sem republicar. Leitura continua normal |
| `liberarReducaoPor30Min()` | Abre janela para uma limpeza planejada e grande da base |
| `listarBackups()` | Lista os snapshots existentes, com tamanho e nº de registros |
| `restaurarBackup('discoveryPmo', 1)` | Restaura um snapshot (guarda o estado atual antes, então o restore também é reversível) |

### Abas criadas automaticamente (todas ocultas)

`_audit` (máx. 5.000 linhas, se autolimita) · `<aba>__bak1/2/3` (ring buffer de 3
snapshots por chave) · `_vp_planning_confirmations`.

Os snapshots **copiam**, nunca movem nem apagam. Nenhum dado existente é alterado
pela publicação da v13 — o Apps Script só executa quando recebe requisição.

## Testar de ponta a ponta

1. Num navegador, importar a planilha do Jira na aba **Qtd Story/Épicos**
2. Abrir o dashboard em **outro** navegador/dispositivo
3. As estórias devem aparecer sincronizadas (sem importar de novo)

Se a `version` ainda mostrar uma versão antiga, a implantação não pegou o código
novo — repita o passo "Nova versão".

## Testes automatizados

Antes de publicar qualquer alteração no `.gs`, rode a suíte (não precisa instalar
nada — Node puro, sem dependências):

```
node tests/apps-script-backlog.test.js
```

São 51 casos ponta a ponta contra uma planilha simulada em memória: guarda de
exclusão em massa, snapshot + restauração, ring buffer, modo observação, merge
por chave, normalização de área do RAID, kill switch e sanitização do callback
JSONP. **Todos precisam passar antes de colar o código no Apps Script.**

## Registro das publicações

| Data | Responsável | Versão publicada | Commit |
| ---- | ----------- | ---------------- | ------ |
|      |             | `2026-07-28-guardas-e-snapshots-v13` |  |

> Preencher a cada publicação. Sem isso não há como saber qual versão está no ar
> em cada ambiente — foi assim que o repositório ficou uma versão atrás da
> produção sem ninguém perceber.
