# Laudo técnico — cards duplicados no Report Semanal Operacional (Squad Contact, W31/2026)

**Página analisada:** `visao-projetos/report-semanal-operacional.html`
**URL:** `.../report-semanal-operacional.html?week=2026-W31#squad=Todas`
**Sintoma:** o card "Contact" (com o mesmo texto de "Resultado esperado", mesma data de subida
e mesmo responsável "Fernanda da Rocha / Ro...") aparece 3 vezes seguidas (itens 06, 07 e 08),
enquanto o card "Guardiões" (item 05) aparece apenas uma vez.

## Veredito

**É um bug da ferramenta**, não um erro do usuário no sentido de "uso indevido" — a ferramenta
permitia uma ação legítima do usuário (clicar em "Salvar ação") gerar múltiplos registros porque
não havia nenhuma trava contra reenvio duplicado do formulário. O gatilho mais provável foi um
duplo/triplo clique (ou clique + nova tentativa após não ver retorno visual imediato) no botão
**"Salvar ação"**, mas a causa raiz é a ausência de proteção contra isso no código.

## Como as ações manuais são armazenadas e renderizadas

1. Cada ação manual criada em **"Gerenciar ações da semana" → "+ Nova ação manual"** é adicionada
   ao array `extras.actions` (dentro de `weeklyExecutiveReport`, persistido na chave `vpQuickNotes`
   do backend/Apps Script), via:

   ```js
   window.saveWeeklyAction = async function(id){
     ...
     extras.actions.push({title, owner, dueDate, outcome, text:'', week: state.selectedWeek,
                           createdAt: new Date().toISOString()});
     await persistQuick();      // salva localStorage + envia POST para o GAS
     closeWeeklyActionEditor(); // só aqui o modal fecha
     ...
   }
   ```

2. No render, cada item de `extras.actions` vira **um card separado**, sem qualquer deduplicação
   por conteúdo:

   ```js
   manual.forEach(function(a,i){
     var id='manual-'+(a.createdAt||i);
     out.push({id:id, title:a.title, owner:..., outcome:a.outcome||a.text||'Resultado a confirmar.', source:'Manual'});
   });
   ```

   Ou seja: **3 objetos no array = 3 cards na tela**, mesmo que o conteúdo seja idêntico. O único
   campo que os diferencia é `createdAt` (timestamp de criação em milissegundos), o que é
   consistente com o padrão observado (3 cards com texto e responsável idênticos, criados em
   sequência rápida).

## Causa raiz identificada no código (antes da correção)

O botão **"Salvar ação"** do modal `openWeeklyActionEditor` não tinha:

- nenhum atributo `disabled` aplicado durante o salvamento;
- nenhuma variável de trava (mutex) contra chamadas reentrantes de `saveWeeklyAction`;
- nenhum feedback visual instantâneo de "salvando..." — o modal só fecha depois do
  `await persistQuick()`, e `persistQuick()` faz um `fetch(...)` com `mode:'no-cors'` (sem
  aguardar de fato a confirmação do servidor, pois a função não retornava a Promise do fetch).

Isso deixa uma janela em que **cada clique adicional em "Salvar ação" antes do modal fechar
gera um novo `push()` no array de ações**, e como o Google Apps Script grava o payload inteiro
(sem deduplicar), os 3 registros idênticos foram persistidos e passaram a ser renderizados como
3 cards.

### Precedente no próprio repositório

Esse é exatamente o mesmo padrão de bug já corrigido no commit `3465c15` ("Corrige perda de
dados na importação de cargas"), que adicionou uma **trava de importação (mutex)** nos botões de
upload do SALA justamente para "bloquear duplo clique e importações simultâneas". Essa proteção
nunca havia sido replicada para o formulário de ação manual do Report Semanal — o que confirma
que a duplicação por clique repetido é uma classe de bug conhecida da ferramenta, não uma
anomalia isolada de uso.

## Correção aplicada

Em `report-semanal-operacional.html`, `window.saveWeeklyAction`:

- adicionado guard `_weeklyActionSaving` que ignora chamadas reentrantes enquanto uma gravação
  está em andamento;
- o botão `#weeklyActionSaveBtn` é desabilitado (visualmente e via `disabled=true`) assim que o
  clique é processado, e reabilitado apenas em caso de erro (`finally`);
- em caso de sucesso o modal fecha, então o botão não precisa ser reabilitado.

Isso impede que cliques repetidos no "Salvar ação" gerem múltiplos `push()` no array de ações,
eliminando a causa raiz da duplicação para novas ações.

## O que ainda precisa de ação manual (dado já duplicado)

A correção de código **não apaga os 3 cards "Contact" já duplicados** na semana 2026-W31, pois
eles já estão persistidos no backend (`vpQuickNotes`). Para limpar:

1. Abrir o Report Semanal da semana 2026-W31.
2. Clicar em **"Gerenciar ações da semana"**.
3. Localizar as 2 entradas repetidas de "Contact" e clicar em **"Excluir"** em cada uma,
   mantendo apenas 1.

Nenhuma alteração de schema ou script de backend é necessária para essa limpeza — a função
`deleteWeeklyAction` (já existente) resolve pela própria UI.

## Resumo para o time

| Pergunta | Resposta |
|---|---|
| Foi erro do usuário? | Não no sentido de má utilização — o usuário fez uma ação válida (salvar), a ferramenta que não bloqueou o duplo envio. |
| É um bug? | Sim — ausência de trava contra reenvio duplicado do formulário de ação manual. |
| Já existe correção? | Sim, aplicada nesta branch (guard + desabilitação do botão durante o salvamento). |
| Os cards já duplicados somem sozinhos? | Não — precisam ser excluídos manualmente via "Gerenciar ações da semana" (2 dos 3 "Contact"). |
