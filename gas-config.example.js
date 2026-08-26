// Modelo do arquivo gas-config.js (NAO comitar o gas-config.js real — ver .gitignore).
//
// Cada ambiente precisa da sua propria copia deste arquivo, com os valores
// reais, colocada na RAIZ do projeto (mesmo nivel deste arquivo-modelo):
//   - GitHub Pages: gerado automaticamente pelo workflow "Deploy GitHub
//     Pages" a partir dos Secrets do repositorio (Settings > Secrets and
//     variables > Actions): SALA_GAS_MAIN_URL e SALA_GAS_MEASUREMENT_URL.
//   - Ambiente do cliente: crie manualmente este arquivo (com este nome,
//     gas-config.js) na raiz, uma unica vez — ele nao faz parte do espelho
//     de arquivos substituidos a cada entrega, entao sobrevive a proximas
//     atualizacoes de index.html/visao-projetos/discovery-pmo.
//
// Se o arquivo faltar, cada pagina cai no mesmo comportamento que ja tinha
// para "sem webapp configurado" (mensagens tipo "Importe a planilha" em vez
// de sincronizar) — nao quebra a pagina, so desliga a sincronizacao.
window.__SALA_GAS__ = {
  main: 'https://script.google.com/macros/s/SUBSTITUA_PELO_TOKEN_REAL/exec',
  measurement: 'https://script.google.com/macros/s/SUBSTITUA_PELO_TOKEN_REAL/exec'
};
