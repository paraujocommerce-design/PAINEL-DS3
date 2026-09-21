# Regras de negócio

Decididas com o gestor e já implementadas, salvo onde estiver marcado
"ainda não". A fonte longa é `docs/regra-premiacao-representantes.md`; o que
está aqui é o suficiente para trabalhar sem reler tudo.

## Remuneração do representante — as quatro formas de ganho

| Ganho | Base | Frequência |
| --- | --- | --- |
| Premiação por contrato | valor gravado no contrato | a cada contrato |
| Comissão de liderança | valor gravado no contrato do filiado | a cada contrato da equipe |
| Meta Plus | faixas por quantidade de contratos no mês | mensal |
| Incentivo comercial | 10% da soma das mensalidades da carteira ativa | mensal, **recorrente** |

### Premiação

O valor no cadastro do representante é **apenas o padrão sugerido**. No
lançamento do contrato define-se quanto ele recebe naquele contrato: o valor
cheio, ou reduzido para abater débito. Redução exige motivo.

Mudar o valor padrão depois **não mexe em contrato já lançado** — é isso que
impede reprocessar pagamento antigo.

### Comissão de liderança

Mesma lógica, para o líder do representante que vendeu. O líder é capturado
**na data da venda**, não o líder de hoje: se a equipe mudou em julho, um
contrato de maio continua comissionando quem era líder em maio.

Liderança é hierarquia **distinta** de supervisor (Berg e Clênio). Supervisor
não recebe comissão.

### Meta Plus — a faixa maior absorve a menor

| Contratos no mês | Valor **total** da faixa |
| --- | --- |
| 10 | R$ 500,00 |
| 15 | R$ 1.000,00 |
| 20 | R$ 2.000,00 |

O valor da faixa é o total devido no mês; paga-se só a diferença do que já
foi pago. Quem fecha 20 recebe **R$ 2.000**, não R$ 3.500. Faixas e valores
vivem em `meta_plus_faixas` e são configuráveis por INSERT/UPDATE — não
chumbe número em código.

Meta Plus depende só de **quantidade** de contratos. Por isso os 1.052
contratos históricos importados contam para a faixa mesmo com
`valor_premiacao` em `NULL`.

### Incentivo comercial

10% da soma das mensalidades (`valor_plano`) dos contratos **ativos** da
carteira, pago **todo mês enquanto seguirem ativos** — não é pagamento único
no mês da venda.

Ponto em aberto registrado pelo gestor: a base hoje é "carteira ativa"
(não cancelado). Se um dia a empresa quiser considerar inadimplência
— faturado efetivamente recebido — a regra muda e precisa de nova conversa.

## Débito e abatimento

O representante pode dever à empresa. `representante_debitos` guarda valor,
motivo e data; cada desconto aplicado num contrato vira um abatimento ligado
àquele contrato. `v_representante_saldo_devedor` diz quanto falta quitar.

Vale para premiação do representante **e** para comissão do líder.

## Ordem de pagamento

Documento interno, um por representante por competência (mês). Os itens são
discriminados: código do contrato do cliente, tipo de ganho, valor e desconto.

`apurar_ordem_pagamento` é a **fonte única do cálculo**. Nunca recalcule
premiação, Meta Plus ou incentivo no frontend ou numa segunda função — se o
número precisa mudar, muda ali.

Ciclo: `aberta` → `fechada` → `paga`, com `cancelada` a qualquer momento
mediante motivo. Reapurar uma ordem aberta recalcula sem duplicar e preserva
os itens do tipo `ajuste` (lançados à mão). Ordem fechada ou paga **recusa**
reapuração — é o que protege pagamento já feito.

## Relatório de pagamento — **ainda não construído**

Especificado, não implementado. Um relatório por representante. Quando ele é
líder, o relatório oferece escolha:

- **equipe inteira** — quantidades e valores que o líder recebeu por toda a equipe;
- **parcial** — só um ou alguns representantes selecionados.

## Contratos — o que o lançamento precisa

Obrigatório: data da venda, representante, código do contrato, nome fantasia,
valor do plano. CNPJ é opcional (a planilha histórica não traz).

`premiavel` = false exige motivo, vindo da lista configurável
`motivo_nao_premiavel`. Pendência exige tipo, vindo de `tipo_pendencia`.
Essas listas substituíram texto livre — a planilha original tinha a mesma
coisa escrita de seis jeitos, o que inviabilizava qualquer contagem. Opção
nova entra por INSERT em `opcoes_cadastro`, sem migration.

## Importação

O arquivo tem hash SHA-256; reimportar o mesmo arquivo confirmado é
bloqueado. Deduplicação por `código normalizado + representante + data`.

Linha que não passa **vira pendência**, com motivo e o payload original
preservado. O gestor foi explícito: nada se descarta, ele corrige depois.

Nunca inferir dado para salvar uma linha — não escolha representante por
aproximação de nome, não complete CNPJ, não chute data. Ambiguidade vai para
o gestor decidir.

## Estado da carga histórica de 2026

1.052 contratos importados, 78 linhas em pendência.

Duas coisas continuam abertas e valem checar antes de prometer número ao gestor:

- **`valor_plano` está vazio nos contratos importados** — enquanto estiver, o
  incentivo de 10% não fecha para eles.
- **`valor_premiacao` foi deixado `NULL` de propósito** nesses contratos, para
  não gerar obrigação retroativa de pagamento sobre vendas já pagas no regime
  antigo. Não preencha isso "para completar o dado".
- **17 pessoas da planilha aguardam classificação** representante × vendedor
  interno. Só BRENO RODRIGUES está confirmado como vendedor interno.

## Prefeituras

Funil de 9 etapas, com as regras dentro do banco: avança uma etapa por vez,
retrocede só com motivo, etapa `decisor` exige contato decisor cadastrado,
`contrato` só por ganho. Responsável operacional travado em Clênio.

## Backlog conhecido

`docs/backlog-regras-negocio.md` guarda a agenda de cobrança de contrato
físico da Mariucha: contrato só é "baixado" quando o físico assinado chega, e
contrato não baixado não deveria gerar incentivo. Está capturado com as
perguntas em aberto — **não implemente antes de perguntar**.
