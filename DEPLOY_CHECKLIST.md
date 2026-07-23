# ✅ Checklist de Deploy — Apps Script (estórias, backlog e Discovery PMO)

> Lembrete: o `index.html` sobe sozinho pelo GitHub Pages a cada push no `main`.
> O **Apps Script NÃO** — ele precisa ser publicado manualmente. Use esta lista
> sempre que mexer em `apps-script-backlog.gs`.

## Publicar a nova versão

1. Abrir o projeto do Apps Script de `BK_GAS_URL` em https://script.google.com
2. Colar o conteúdo atualizado de [`apps-script-backlog.gs`](./apps-script-backlog.gs)
3. Confirmar que a chave `discoveryPmo` está disponível no Apps Script publicado
4. Rodar `autorizarPlanilhaUmaVez()` uma vez e aceitar as permissões
5. **Implantar → Gerenciar implantações → ✏️ (editar)**
6. No campo **Versão**, escolher **"Nova versão"**
   ⚠️ Não reutilizar uma versão antiga — senão o código editado **não** é publicado
7. **Implantar**

## Token compartilhado (API_TOKEN) — só na primeira vez

Os 3 dashboards (`index.html`, `visao-projetos/index.html`, `discovery-pmo/index.html`)
já mandam um token em toda chamada ao Apps Script (constantes `BK_GAS_TOKEN` /
`_VP_GAS_TOKEN` / `DISC_GAS_TOKEN` — hoje as três têm o mesmo valor). Enquanto a
Propriedade do Script abaixo não existir, o Apps Script **ignora** esse token e
aceita tudo normalmente — ou seja, publicar o `.gs` acima não quebra nada por si só.

⚠️ **Ordem importa**: só configure a propriedade DEPOIS de confirmar que o commit
com o token nos 3 dashboards já está no ar (GitHub Pages publica `main` sozinho,
mas leva um instante). Se configurar a propriedade antes disso, todo mundo fica
sem acesso até o GitHub Pages atualizar.

1. Confirmar que os 3 dashboards em produção já têm a constante do token (abrir
   "Ver código-fonte" de qualquer um deles e procurar por `GAS_TOKEN`)
2. No projeto do Apps Script: **Configurações do projeto (⚙️) → Propriedades do
   script → Adicionar propriedade do script**
3. Nome: `API_TOKEN` · Valor: o mesmo texto que está em `BK_GAS_TOKEN` no `index.html`
4. Salvar

A partir daqui, qualquer chamada sem o token (ou com token errado) recebe
`{"ok":false,"error":"não autorizado"}` em vez de ler/gravar dados.

## Verificar (abrir no navegador)

```
https://script.google.com/macros/s/AKfycbxOSQe41hqngh7b0iscE_Bcb_Z2mBfbwfqaaMCU_cKXDfCKnDvsQ6jb2HTPbnLso30C/exec?action=health
```

Resposta esperada (sinais de que deu certo):

```json
{ "ok": true, "version": "2026-07-23-backlog-sheet-chunks-v10", "stories": 0, ... }
```

- ✅ `"version"` = `2026-07-23-backlog-sheet-chunks-v10` → versão nova no ar
- ✅ campo `"stories"` presente → ações de estória ativas
- ✅ chave `discoveryPmo` disponível → Discovery PMO ativo no Apps Script publicado

Depois de configurar o `API_TOKEN` (seção acima), essa mesma URL sem `&token=...`
passa a responder `{"ok":false,"error":"não autorizado"}` — isso é o esperado,
não um erro; é só um jeito rápido de confirmar que a trava está ativa.

## Testar de ponta a ponta

1. Num navegador, importar a planilha do Jira na aba **Qtd Story/Épicos**
2. Abrir o dashboard em **outro** navegador/dispositivo
3. As estórias devem aparecer sincronizadas (sem importar de novo)

Se a `version` ainda mostrar uma versão antiga, a implantação não pegou o código
novo — repita o passo "Nova versão".
