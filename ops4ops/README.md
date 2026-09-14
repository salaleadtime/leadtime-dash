# Ops4Ops — Gestão Estratégica (protótipo)

Protótipo web da leitura executiva do planejamento 2026. Substitui progressivamente
a planilha de acompanhamento e é orientado a decisão da liderança, não a registro
operacional.

## Como rodar localmente

A página carrega os módulos como arquivos `.js` separados e lê `seed-discovery.json`
via `fetch`, então precisa ser servida por HTTP — abrir com duplo clique (`file://`)
não funciona (o navegador bloqueia o `fetch`; a aplicação abre vazia e informa isso
em vez de inventar dados).

```bash
# a partir da raiz do repositório
npx http-server -p 8080 .
# depois: http://localhost:8080/ops4ops/
```

Qualquer servidor estático serve (`python3 -m http.server 8080` também).

## Testes

```bash
node tests/ops4ops-rules.test.js
```

114 testes cobrindo cálculo de desvio, concorrência, concentração, risco se
desbloquear, comportamento com dados incompletos, múltiplas iniciativas da mesma
squad, alteração de capacidade e o caso `Desenvolvimento + refinamento contínuo`.

## Organização

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Shell, design system, abas e orquestração de estado. Sem regra de negócio. |
| `config.js` | Todos os limiares configuráveis (desvio, janela de concorrência, risco, marcos, auditoria). |
| `rules.js` | Motor de regras: funções puras, sem DOM. É o que os testes exercitam. |
| `store.js` | Persistência por adaptador. Hoje `localStorage`; trocar por API é implementar `carregar`/`salvar`. |
| `view-executivo.js` | Visão Executiva (somente leitura). Só formata o que o motor decidiu. |
| `view-gestao.js` | Gestão 2026, Squads e Parâmetros. Campos manuais em amarelo, calculados em cinza. |
| `seed-discovery.json` | Base de planejamento 2026 extraída do Discovery PMO Tracker (`discovery-pmo/index.html`). |

## Regra inegociável de dados

Ausência de informação **nunca** vira zero e nunca vira classificação otimista.
Um campo não informado aparece como `A validar` ou `Não informado`; um risco que
não pode ser calculado aparece como `DADO INCOMPLETO`, jamais como `BAIXO`.
O marcador `a definir` vindo da fonte é preservado literalmente.

A auditoria de qualidade aponta inconsistências da fonte (ano implausível, fim
antes do início, bloqueio sem responsável), mas **não corrige nada** — a fonte
permanece como está até validação humana.

## Trocar `localStorage` por backend

```js
Ops4OpsStore.usarAdaptador({
  nome: 'Apps Script',
  carregar: () => fetch(...).then(r => r.json()),
  salvar:   (estado) => fetch(..., { method: 'POST', body: JSON.stringify(estado) })
});
```

Nenhuma view e nenhuma regra conhece o meio de persistência.
