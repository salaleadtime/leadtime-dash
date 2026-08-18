/* Ops4Ops — Gestão Estratégica · Parâmetros configuráveis.
   Nenhum limiar de negócio pode ficar hardcoded em regra ou componente visual
   (requisito 4 e 10): tudo o que classifica risco, desvio ou concorrência mora
   aqui e pode ser alterado pela tela de Configuração sem tocar em código. */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Ops4OpsConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Default de fábrica. A configuração efetiva é este objeto sobreposto pelo
  // que o usuário salvou (ver store.js) — nunca substituído por inteiro, para
  // que um parâmetro novo criado numa versão futura não fique indefinido em
  // quem já tem configuração salva.
  const PADRAO = {
    desvio: {
      // Regra 4. Desvio = data real/atual - data planejada, com sinal.
      noPrazoAte: 0,      // <= 0 dias  → No prazo (inclui adiantado)
      atencaoAte: 5       // 1..5 dias  → Atenção; acima disso → Crítico
    },
    concorrencia: {
      // Regra 10. Janela em torno do início de DEV planejado de cada iniciativa.
      janelaDiasAntes: 15,
      janelaDiasDepois: 15
    },
    concentracao: {
      // Regra 11. "concorrentes" = outras iniciativas da mesma squad na janela.
      altoConcorrentes: 3,          // >= 3 concorrentes → ALTO
      altoConcorrentesSquadPequena: 2, // >= 2 concorrentes com squad <= devPequena → ALTO
      devPequena: 2,
      medioConcorrentes: 2,         // == 2 concorrentes → MÉDIO
      medioDevMinimo: 1             // 1 concorrente numa squad de 1 DEV → MÉDIO
    },
    desbloqueio: {
      // Regra 12. Quantas iniciativas bloqueadas da squad voltariam juntas.
      baixoAte: 1,
      medioAte: 2       // acima de medioAte → ALTO
    },
    marcos: {
      janelaDias: 30    // Regra 18. Próximos marcos exibidos na Visão Executiva.
    },
    horas: {
      // Automação adicional: viabilidade física da janela de DEV.
      // horas planejadas / (DEV x dias úteis da janela) > horasDiaPorDev → janela
      // improvável mesmo sem nenhum atraso registrado ainda.
      horasDiaPorDev: 6,
      diasUteisPorSemana: 5
    },
    dataQualidade: {
      // Auditoria de fonte. Não corrige nada: só sinaliza para validação humana.
      anoMinimoPlausivel: 2020,
      anoMaximoPlausivel: 2035
    }
  };

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  // Sobreposição profunda: mantém as chaves do padrão que o salvo não conhece.
  function mesclar(base, sobreposicao) {
    const saida = clonar(base);
    if (!sobreposicao || typeof sobreposicao !== 'object') return saida;
    Object.keys(saida).forEach(function (grupo) {
      const vindo = sobreposicao[grupo];
      if (!vindo || typeof vindo !== 'object') return;
      Object.keys(saida[grupo]).forEach(function (chave) {
        const v = vindo[chave];
        if (typeof v === 'number' && Number.isFinite(v)) saida[grupo][chave] = v;
      });
    });
    return saida;
  }

  return { PADRAO: PADRAO, padrao: function () { return clonar(PADRAO); }, mesclar: mesclar };
});
