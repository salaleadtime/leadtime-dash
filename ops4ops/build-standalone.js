/* Gera ops4ops/prototipo.html: a mesma aplicação de ops4ops/index.html, porém
   em arquivo único, com os módulos e a base de dados embutidos.

   Motivo: index.html carrega os módulos como <script src> e lê o seed por
   fetch, o que exige um servidor HTTP. A versão de arquivo único abre com
   duplo clique e é o formato que o restante deste repositório usa para as
   páginas entregues por substituição manual de arquivo.

   Os módulos continuam sendo a fonte de verdade — este script só concatena.
   Rode novamente após qualquer alteração:  node ops4ops/build-standalone.js  */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const ler = f => fs.readFileSync(path.join(dir, f), 'utf8');

const html = ler('index.html');
const seed = ler('seed-discovery.json');

const modulos = ['config.js', 'rules.js', 'store.js', 'view-executivo.js', 'view-gestao.js'];

// Substitui o primeiro <script src> pelo pacote inteiro e remove os demais.
let saida = html.replace(
  /<script src="config\.js"><\/script>/,
  '<script>\n/* Base de planejamento 2026 embutida (gerada por build-standalone.js). */\nwindow.OPS4OPS_SEED = ' + seed.trim() + ';\n</script>\n' +
  modulos.map(m => '<script>\n/* ── ' + m + ' ── */\n' + ler(m).trim() + '\n</script>').join('\n')
);
modulos.slice(1).forEach(m => {
  saida = saida.replace(new RegExp('<script src="' + m.replace('.', '\\.') + '"></script>\\n?'), '');
});

// Um <script src> remanescente significaria módulo não embutido: falha alto,
// em vez de gerar um arquivo que abre quebrado no cliente.
const restantes = saida.match(/<script src="[^"]+"><\/script>/g);
if (restantes) throw new Error('Módulo não embutido: ' + restantes.join(', '));

saida = saida.replace('<title>Ops4Ops — Gestão Estratégica</title>',
  '<title>Ops4Ops — Gestão Estratégica</title>\n<!-- Arquivo único gerado por ops4ops/build-standalone.js. Não editar à mão: altere os módulos em ops4ops/ e rode o script de novo. -->');

fs.writeFileSync(path.join(dir, 'prototipo.html'), saida);
console.log('ops4ops/prototipo.html gerado — ' + Math.round(saida.length / 1024) + ' KB, ' + modulos.length + ' módulos embutidos.');
