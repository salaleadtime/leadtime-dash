# ✅ Checklist de Deploy — Apps Script (estórias da aba Qtd Story/Épicos)

> Lembrete: o `index.html` sobe sozinho pelo GitHub Pages a cada push no `main`.
> O **Apps Script NÃO** — ele precisa ser publicado manualmente. Use esta lista
> sempre que mexer em `apps-script-backlog.gs`.

## Publicar a nova versão

1. Abrir o projeto do Apps Script de `BK_GAS_URL` em https://script.google.com
2. Colar o conteúdo atualizado de [`apps-script-backlog.gs`](./apps-script-backlog.gs)
3. Rodar `autorizarPlanilhaUmaVez()` uma vez e aceitar as permissões
4. **Implantar → Gerenciar implantações → ✏️ (editar)**
5. No campo **Versão**, escolher **"Nova versão"**
   ⚠️ Não reutilizar uma versão antiga — senão o código editado **não** é publicado
6. **Implantar**

## Verificar (abrir no navegador)

```
https://script.google.com/macros/s/AKfycbxOSQe41hqngh7b0iscE_Bcb_Z2mBfbwfqaaMCU_cKXDfCKnDvsQ6jb2HTPbnLso30C/exec?action=health
```

Resposta esperada (sinais de que deu certo):

```json
{ "ok": true, "version": "2026-06-03-backlog-sheet-chunks-v3", "stories": 0, ... }
```

- ✅ `"version"` = `2026-06-03-backlog-sheet-chunks-v3` → versão nova no ar
- ✅ campo `"stories"` presente → ações de estória ativas

## Testar de ponta a ponta

1. Num navegador, importar a planilha do Jira na aba **Qtd Story/Épicos**
2. Abrir o dashboard em **outro** navegador/dispositivo
3. As estórias devem aparecer sincronizadas (sem importar de novo)

Se a `version` ainda mostrar uma versão antiga, a implantação não pegou o código
novo — repita o passo "Nova versão".
