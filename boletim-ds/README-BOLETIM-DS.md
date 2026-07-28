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

## Horário: aprovado — 09:00 todos os dias

O workflow roda automaticamente **todos os dias às 09:00 (America/Sao_Paulo,
UTC-3 fixo)** via `schedule: cron: '0 12 * * *'`. Continua também disponível
por `workflow_dispatch` para testes manuais.

## Status atual do e-mail: envio BLOQUEADO até configuração dos secrets

O horário está ativo, mas o envio por e-mail em si só acontece se todos os
secrets abaixo estiverem configurados (`Settings → Secrets and variables →
Actions`). Sem eles, a execução diária roda, gera o HTML e o PNG
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

- Desativar o envio automático: apagar/renomear o secret
  `BOLETIM_DS_RECIPIENTS` (o pipeline volta a rodar em modo "seco").
- Remover o módulo por completo: apagar a pasta `boletim-ds/`, o arquivo
  `.github/workflows/boletim-diario-ds.yml` e a pasta
  `.github/scripts/boletim_ds/`. Nenhum outro arquivo do repositório é
  alterado por essa remoção — o módulo é isolado por desenho.
