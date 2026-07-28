# Estado de deduplicação do Boletim Diário DS

Este diretório guarda apenas `last-sent.json`, com a última data em que o
boletim foi efetivamente enviado por e-mail. É usado só para impedir envio
duplicado do mesmo boletim no mesmo dia — não contém dados de negócio,
credenciais ou destinatários.

O arquivo é criado/atualizado pelo próprio workflow
`.github/workflows/boletim-diario-ds.yml` após um envio bem-sucedido.
