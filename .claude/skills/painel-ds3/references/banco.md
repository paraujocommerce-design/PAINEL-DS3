# Mapa do banco

Supabase/PostgreSQL. 14 migrations aplicadas (`db/migrations/0001` a `0014`).
Tudo com RLS ativa; escrita só por RPC `security definer`.

## Permissão

Três papéis no enum `app_role`: `admin` (Paulo, gestor), `operacao`
(Mariucha) e `supervisao` (Berg).

- `pode_operar(uuid)` — admin OU operação. Checagem da maioria das RPCs.
- `pode_ver_financeiro(uuid)` — admin, operação OU supervisão. Só leitura:
  Berg enxerga a ordem que vai autorizar, mas não apura, não lança e não paga.
- `f_tem_papel(uuid, text)` — um papel exato, comparado como texto.
- `has_role(uuid, app_role)` / `f_exigir_admin()` — de migrations anteriores.

A concessão de papel não passa pela aplicação: é `INSERT` manual em
`user_roles` pelo SQL Editor, buscando o usuário por e-mail em `auth.users`
(nunca colando UUID à mão).

Contas reais: `paraujocommerce@gmail.com` admin,
`suportecomercialds3@consultcenter.com.br` operação,
`bergcalasans@consultcenter.com.br` supervisão.

## Representantes

| Tabela | Papel |
| --- | --- |
| `representantes` | cadastro. `codigo` = 4 dígitos manuais e **imutável** (trigger). Guarda `valor_premiacao_contrato`, `valor_comissao_lideranca`, `meta_minima_mensal`, `valor_ajuda_custo_fixa` e os dados bancários — todos podem ser `NULL` = não cadastrado |
| `supervisores` | Berg e Clênio. Não são usuários de login |
| `representante_vinculos` | histórico representante → supervisor, sem sobreposição (EXCLUDE gist) |
| `representante_liderancas` | histórico representante → líder. Hierarquia **distinta** do supervisor: é a que gera comissão |
| `representante_eventos` | `cadastro`, `mudanca_supervisor`, `alteracao_cadastro` |
| `producoes` | produção legada agregada (imutável) |
| `metas` | indicador + valor + vigência sem sobreposição |

**RPCs:** `criar_representante`, `atualizar_cadastro_representante` (nome e
observação, guardando o valor anterior no histórico),
`atualizar_valores_representante`, `mudar_supervisor`,
`definir_lider_representante`, `encerrar_lideranca_representante`,
`atualizar_dados_financeiros_representante`, `cancelar_producao`.

**Views:** `v_representantes_carteira`, `v_representantes_configuracao`
(valores + se é líder + tamanho da equipe), `v_representantes_lideranca_atual`,
`v_producoes_atribuidas` (produção já atribuída ao supervisor vigente **na data
do fato**), `v_reativacoes` (derivada por LAG, nunca armazenada),
`f_carteira_referencia(supervisor, data)` — carteira numa data qualquer.

## Contratos

`representante_contratos` — um registro por contrato vendido.

Campos que importam: `data_venda`, `representante_id`, `codigo_contrato`
(+ `codigo_contrato_norm` gerada), `nome_fantasia`, `cnpj` (14 dígitos, opcional),
`valor_plano` (mensalidade — base do incentivo de 10%), `premiavel` + motivo,
`possui_pendencia` + tipo, `status_pos_venda`, `origem` (`manual` | `importacao`),
`valor_premiacao` + `desconto_premiacao` + motivo, `lider_id` +
`valor_comissao_lideranca` + desconto + motivo.

**Chave de deduplicação:** `codigo_contrato_norm + representante_id + data_venda`,
entre os não cancelados. O código do contrato sozinho não é único na origem.

**Imutabilidade (trigger `f_contratos_imutavel`):** identidade e valores
financeiros não mudam. CNPJ, código e nome do cliente podem ser **preenchidos**
quando vazios (a planilha de vendas não traz CNPJ), mas não trocados depois.

**RPCs:** `cadastrar_contrato_representante` (puxa premiação padrão e líder
vigente **na data da venda**), `complementar_dados_contrato`,
`cancelar_contrato_representante`.

**Views:** `v_contratos_premiacao` (valores líquidos — **use esta como fonte do
cálculo**, não recalcule no front), `v_contratos_incompletos`.

## Financeiro

| Tabela | Papel |
| --- | --- |
| `rubricas_pagamento` | as ~20 linhas do formulário real. Cada uma diz o `sinal` (+1 ou -1), se é `automatica`, se `gera_debito` e se `exige_contrato` |
| `ordem_pagamento_autorizacoes` | uma linha por instância exigida: gerência, supervisão, auditoria, diretoria |
| `representante_debitos` | dívida do representante. `origem_item_id` liga ao lançamento que a criou |
| `representante_debito_abatimentos` | abatimento, ligado ao contrato que descontou |
| `meta_plus_faixas` | 10 → R$ 500, 15 → R$ 1.000, 20 → R$ 2.000. `valor_total` é o TOTAL da faixa, não incremento |
| `ordens_pagamento` | uma por representante por competência |
| `ordem_pagamento_itens` | itens discriminados; `valor_liquido` é coluna gerada |

`ordem_pagamento_itens.tipo` **é** o código da rubrica (FK), não uma lista
paralela. `valor_liquido` é gerado como `sinal * (bruto - desconto)`, então
abatimento e estorno de fato subtraem.

**RPCs:** `apurar_ordem_pagamento(representante, competência)` — **a fonte
única do cálculo**, lança as rubricas automáticas e preserva as manuais;
`apurar_competencia(data)` apura todos de uma vez;
`adicionar_item_ordem` / `remover_item_ordem` (rubricas manuais);
`exigir_autorizacao_ordem`, `remover_exigencia_autorizacao`,
`decidir_autorizacao_ordem`; `definir_destinatario_ordem`,
`limpar_destinatario_ordem`; `registrar_debito_representante`,
`abater_debito_representante`; `fechar_ordem_pagamento`,
`pagar_ordem_pagamento`, `reabrir_ordem_pagamento`,
`cancelar_ordem_pagamento`, `adicionar_ajuste_ordem`.

**Quem faz o quê:** operação apura, lança e fecha. Supervisão autoriza a
instância dela. **Só admin paga**, reabre e dispensa exigência. Pagar exige
todas as autorizações exigidas concedidas, e grava forma, data, valor e
comprovante.

**Trava de duplicidade:** o trigger `f_item_sem_duplicidade` recusa um
segundo lançamento do mesmo contrato na mesma rubrica, em qualquer ordem não
cancelada, nomeando a ordem anterior na mensagem.

Reapurar uma ordem **aberta** recalcula sem duplicar e preserva itens do tipo
`ajuste`. Ordem `fechada` ou `paga` recusa reapuração — é o que protege
pagamento já feito.

**Views:** `v_ordens_pagamento` (com supervisor, contagem de autorizações,
`liberada_para_pagamento` e os dados bancários efetivos),
`v_ordem_pagamento_linhas` (a ordem no formato do formulário),
`v_financeiro_representante` (apurado × pago × saldo devedor),
`v_relatorio_pagamento` (as linhas com a **origem** do valor identificada —
na comissão de liderança o valor é do líder mas o contrato é de quem vendeu;
é o que permite quebrar o relatório do líder por membro da equipe),
`v_representante_debitos`, `v_representante_saldo_devedor`.

Atenção ao campo `referencia` de `ordem_pagamento_itens`: na linha de
incentivo ele guarda o **valor da carteira**, não um código de contrato. Use
`v_relatorio_pagamento.codigo_contrato`, que só vem preenchido quando há
contrato de verdade.

## Importação

`importacao_frentes` (só `representantes` está implementada),
`importacao_lotes` (hash SHA-256 do arquivo; unique parcial em
`(frente, hash)` onde status = confirmado — impede reimportar o mesmo arquivo),
`importacao_linhas` (status `importada` | `duplicada` | `rejeitada`, com
`motivo_rejeicao` obrigatório quando rejeitada e `payload` jsonb).

Linha que não pode entrar **fica registrada como rejeitada**, com os dados
originais no payload. Não se descarta nada — é assim que o gestor corrige depois.

`producao_corte` + `v_producao_representantes_unificada` evitam contagem dupla
entre a produção legada agregada e os contratos individuais.

**RPC:** `confirmar_importacao_representantes` — transacional, revalida cada
linha no servidor. O preview no navegador não grava nada.

## Prefeituras

Funil oficial de 9 etapas: prospecção → contato → diagnóstico → decisor →
apresentação → interesse → processo institucional → negociação → contrato.

`prefeituras`, `prefeitura_contatos`, `prefeitura_oportunidades`,
`prefeitura_movimentos` (append-only), `prefeitura_interacoes`,
`prefeitura_contratos`, `prefeitura_metas`.

Regras no banco: avanço de uma etapa por vez, retrocesso exige motivo, etapa
`decisor` exige contato decisor cadastrado, `contrato` só via ganho. O
responsável operacional está travado em Clênio por trigger.

**RPCs:** `criar_prefeitura`, `abrir_oportunidade_prefeitura`,
`mover_etapa_prefeitura`, `definir_proximo_passo_prefeitura`,
`ganhar_oportunidade_prefeitura`, `perder_oportunidade_prefeitura`,
`reabrir_oportunidade_prefeitura`, `registrar_renovacao_prefeitura`,
`cancelar_contrato_prefeitura`, `registrar_contato_prefeitura`,
`registrar_interacao_prefeitura`.

## Listas configuráveis

`opcoes_cadastro` (categoria, codigo, rotulo, ordem, ativo) para
`status_pos_venda`, `tipo_pendencia` e `motivo_nao_premiavel`. Substituíram o
texto livre da planilha, que tinha a mesma coisa escrita de seis jeitos e
inviabilizava contagem. Novas opções entram por INSERT, sem migration.

## Exclusão administrativa

`exclusoes_auditoria` guarda quem apagou, quando e cópia do registro.

**RPCs (só admin):** `excluir_contrato`, `excluir_lote_importacao`,
`excluir_contratos_periodo`, `excluir_representante`, `excluir_meta`.

Os triggers de imutabilidade liberam `DELETE` apenas quando a chave de sessão
`app.exclusao_admin` está ligada — e só essas funções a ligam, sempre
registrando a auditoria antes de apagar.
