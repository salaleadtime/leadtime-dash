# Boletim Diário DS

Módulo isolado de leitura que monta automaticamente um boletim com três
blocos — Pontos críticos do dia, Discoveries em refinamento e Homologação
fora do prazo — a partir das mesmas fontes já usadas pelo dashboard e pelo
Discovery PMO (Google Apps Script / planilha). Não cria segunda base, não
edita dados de origem e não redefine nenhuma regra existente (meta de Lead
Time, SLA de Homologação, classificação de refinamento).

## Arquivos

- `boletim-ds/index.html` — página isolada (CSS/IDs escopados a
  `#boletim-ds-root`), útil para consultar o boletim a qualquer momento no
  navegador. É publicada pelo GitHub Pages junto com o restante do site, e
  tem um atalho na aba **📰 Boletim DS** do painel Admin do `index.html`
  principal (menu Admin → aba própria, só um link — nenhuma lógica do
  boletim roda dentro do `index.html`).
- `boletim-ds/rules.js` — regras de seleção/classificação compartilhadas
  entre a página e o pipeline de geração (fonte única, sem duplicar lógica).
- `.github/scripts/boletim_ds/run.mjs` — pipeline de geração: busca dados,
  valida, seleciona, renderiza HTML, gera PNG (Playwright) e envia e-mail
  (Nodemailer), com deduplicação por dia.
- `.github/workflows/boletim-diario-ds.yml` — workflow do GitHub Actions.

## Página única para copiar/colar (e-mail e Teams)

O Boletim é **uma única imagem** (`boletim.png`), pensada para ser copiada e
colada tanto no corpo do e-mail quanto no grupo do Teams — não existe mais
um cartão separado. Além dos três blocos originais (Pontos críticos,
Discoveries em refinamento, Homologação fora do prazo), a página traz um
quarto bloco, "Lead Time e entregas do dia": o Lead Time geral (média das
entregas concluídas hoje) e o Lead Time médio por squad que entregou. Esse
bloco é gerado com dado novo a cada execução — nunca estático — e some
sozinho para "Nenhuma entrega concluída hoje" quando não há entrega no dia
(nunca inventa dado).

## Variação visual diária

O cabeçalho e os ícones de cada bloco giram por dia do ano em 3 variações
(`rules.js:DAILY_THEMES` / `pickDailyThemeIndex`), sempre dentro das cores
institucionais Bradesco — vermelho + grafite, vermelho + preto, ou vermelho
+ branco. O robô e as cores semânticas dos selos (vermelho = crítico, âmbar
= atenção, verde = ok) **nunca mudam**, em qualquer dia — só teriam sentido
se fossem sempre iguais. A mesma lógica é usada no pipeline (`run.mjs`) e na
página ao vivo (`index.html`), então os dois ficam idênticos no mesmo dia.

O mesmo bloco aparece tanto na imagem gerada pelo
pipeline quanto na página `boletim-ds/index.html`, que busca os dados ao
vivo no navegador.

## Status atual: agendamento PAUSADO (reformulação)

O agendamento diário está **desativado por opção**, enquanto o boletim passa
por reformulação. No `.github/workflows/boletim-diario-ds.yml` o bloco
`schedule` está comentado, então o workflow **não roda sozinho** — só por
`workflow_dispatch` (Actions → Boletim Diário DS → Run workflow), o que
continua permitindo testar as mudanças sob demanda.

Nada mais foi desligado por causa disso:

- `boletim-ds/index.html` continua publicada e funcionando — ela busca os
  dados ao vivo no navegador e não depende do workflow.
- O atalho na aba **📰 Boletim DS** do painel Admin continua válido.
- Nenhum dado, regra ou fonte foi alterado (o pipeline sempre foi só leitura).

### Religar o agendamento

Descomentar as duas linhas do `schedule` no workflow:

```yaml
on:
  schedule:
    - cron: '0 12 * * *'   # 09:00 America/Sao_Paulo, todos os dias
  workflow_dispatch:
```

Horário aprovado: **todos os dias às 09:00 (America/Sao_Paulo, UTC-3 fixo,
sem horário de verão)** — 09:00 BRT = 12:00 UTC.

## Status do e-mail: envio BLOQUEADO até configuração dos secrets

Mesmo com o agendamento religado, o envio por e-mail em si só acontece se todos os
secrets abaixo estiverem configurados (`Settings → Secrets and variables →
Actions`). Sem eles, a execução roda, gera o HTML e o PNG
normalmente, mas **não envia** e-mail — isso é intencional (seção 11/13 da
especificação: destinatários e credenciais nunca ficam no código-fonte e o
envio automático não deve ser ativado sem validação explícita).

| Secret | Descrição |
| --- | --- |
| `BOLETIM_DS_SMTP_HOST` | Host SMTP autorizado pela área de TI/corporativo |
| `BOLETIM_DS_SMTP_PORT` | Porta SMTP (ex.: 587 ou 465) |
| `BOLETIM_DS_SMTP_USER` | Usuário/remetente autorizado |
| `BOLETIM_DS_SMTP_PASS` | Senha ou app-password do remetente |
| `BOLETIM_DS_RECIPIENTS` | Lista de destinatários autorizados, separados por vírgula |

Variável opcional (não secreta): `BOLETIM_DS_SYSTEM_LINK`, usada apenas
para exibir o link "consultar o sistema" no rodapé do e-mail.

## Testar manualmente

1. Configurar os secrets de SMTP/destinatários (ou deixar de fora para um
   teste "seco", que gera HTML/PNG sem enviar nada).
2. Rodar o workflow via **Actions → Boletim Diário DS → Run workflow**.
3. Conferir o artefato `boletim-ds-artefatos` (HTML e PNG gerados) antes de
   configurar o envio real.
4. Fazer um envio de teste para um destinatário próprio antes de liberar a
   lista definitiva (recomendado pela seção 11 da especificação).

## Rollback

- Pausar o agendamento (estado atual): comentar o bloco `schedule` no
  workflow — o `workflow_dispatch` continua disponível para rodar sob
  demanda.
- Desativar o envio automático: apagar/renomear o secret
  `BOLETIM_DS_RECIPIENTS` (o pipeline volta a rodar em modo "seco").
- Remover o módulo por completo: apagar a pasta `boletim-ds/`, o arquivo
  `.github/workflows/boletim-diario-ds.yml` e a pasta
  `.github/scripts/boletim_ds/`. Nenhum outro arquivo do repositório é
  alterado por essa remoção — o módulo é isolado por desenho.
