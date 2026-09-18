# Regra de premiação e pagamento de representantes

Definida em conversa com o gestor em 19/09/2026. É a fonte oficial da regra
— o código deve seguir isto, e mudanças aqui exigem nova conversa.

## 1. O que fica no cadastro do representante

- **Valor da premiação por contrato** — cada representante tem o seu valor.
- **Valor da comissão de liderança** — só para quem é líder: quanto ele ganha
  por cada contrato fechado por um representante da equipe dele. Editável.
- **Meta mínima de contratos no mês** — cada representante tem a sua, usada
  para acompanhar o desempenho diariamente.
- **Filiação** — a qual líder ele pertence (já existe desde a migration 0006,
  com histórico de início/fim).

## 2. O que é definido no cadastro de cada contrato

O valor do cadastro do representante é apenas o **padrão sugerido**. No momento
de cadastrar o contrato define-se:

- **Valor do plano (mensalidade)** — obrigatório. É a base do incentivo de 10%.
- **Quanto o representante recebe por este contrato** — o valor cheio do
  cadastro dele, ou reduzido (parcial ou integralmente) para abater débito.
- **Quanto o líder recebe por este contrato** — mesma lógica, também pode ser
  reduzido para abater débito do líder.

O valor efetivamente aplicado fica gravado no contrato. Mudar o valor no
cadastro do representante depois **não altera contratos já lançados**.

## 3. As quatro formas de ganho

| Ganho | Base de cálculo | Frequência |
| --- | --- | --- |
| Premiação por contrato | valor definido no contrato | a cada contrato |
| Comissão de liderança | valor definido no contrato do filiado | a cada contrato da equipe |
| Meta Plus | faixas por quantidade de contratos no mês | mensal |
| Incentivo comercial | 10% da soma das mensalidades da carteira ativa | mensal, recorrente |

### Meta Plus — faixas e mecânica

| Contratos no mês | Valor total da faixa |
| --- | --- |
| 10 | R$ 500,00 |
| 15 | R$ 1.000,00 |
| 20 | R$ 2.000,00 |

**A faixa maior absorve a menor — não soma.** O valor da faixa é o total devido,
e paga-se apenas a diferença do que já foi pago:

- bateu 10 → recebe R$ 500 (total pago: R$ 500)
- bateu 15 → total devido vira R$ 1.000, recebe mais R$ 500
- bateu 20 → total devido vira R$ 2.000, recebe mais R$ 1.000

Quem fecha 20 contratos recebe **R$ 2.000 no mês**, não R$ 3.500.
As faixas e valores são configuráveis.

### Incentivo comercial

10% da soma das mensalidades dos contratos **ativos** da carteira do
representante, pago **todo mês enquanto os contratos seguirem ativos** — não é
pagamento único no mês da venda.

> Ponto de atenção registrado: hoje a base é "carteira ativa" (contratos não
> cancelados). Se no futuro a empresa quiser considerar inadimplência
> (faturado efetivamente recebido), a regra muda e precisa ser revista.

## 4. Débito do representante

O sistema controla o **saldo devedor** de cada representante: registra o débito
(valor, motivo, data) e abate conforme os descontos vão sendo aplicados nos
contratos, mostrando quanto ainda falta quitar.

Vale tanto para a premiação do representante quanto para a comissão do líder.

## 5. Ordem de pagamento (documento interno)

- Nasce quando o contrato é cadastrado.
- Agrupa vários contratos do mesmo representante.
- Cada item discriminado: código do contrato do cliente, tipo de ganho, valor
  e desconto aplicado, quando houver.

## 6. Relatório de pagamento (documento do representante)

Um relatório por representante. Quando o representante é **líder**, o relatório
oferece a escolha:

- **Equipe inteira** — quantidades e valores recebidos pelo líder por toda a
  equipe;
- **Parcial** — apenas um ou alguns representantes selecionados da equipe.

## 7. Sequência de construção

1. Campos de valores no cadastro do representante *(em andamento)*
2. Campos e cálculo automático no cadastro do contrato
3. Controle de débito e saldo devedor
4. Apuração mensal de Meta Plus e incentivo comercial
5. Ordem de pagamento e relatórios
