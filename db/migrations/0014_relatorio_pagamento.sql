-- =====================================================================
-- 0014 — Relatório de pagamento do representante
--
-- A ordem de pagamento é documento interno. O relatório é o documento
-- que vai para o representante: o que ele recebeu e por quê.
--
-- O que esta migration resolve: na comissão de liderança o valor é do
-- líder, mas o contrato é de quem vendeu. Sem saber quem vendeu, não dá
-- para quebrar o relatório do líder por membro da equipe — que é
-- justamente a opção "equipe inteira ou parcial" que o gestor pediu.
-- Hoje essa informação só existe dentro do texto da descrição, e ler
-- texto para calcular dinheiro não é opção.
-- =====================================================================

create or replace view public.v_relatorio_pagamento
with (security_invoker = on) as
select
  o.id                       as ordem_id,
  o.representante_id,
  r.codigo                   as representante_codigo,
  r.nome                     as representante_nome,
  o.competencia,
  o.status,
  sup.nome                   as supervisor_nome,
  coalesce(o.destinatario_nome, r.favorecido, r.nome) as favorecido,
  i.id                       as item_id,
  i.tipo                     as rubrica,
  ru.rotulo,
  ru.ordem                   as ordem_exibicao,
  ru.sinal,
  i.contrato_id,
  -- Só é código de contrato quando há contrato de verdade: a linha de
  -- incentivo guarda o valor da carteira nesse mesmo campo, e imprimir
  -- "contrato 200.00" no documento do representante seria confuso.
  case when i.contrato_id is null then null else i.referencia end
                             as codigo_contrato,
  c.nome_fantasia,
  c.data_venda,
  -- Quem originou o valor: na comissão de equipe é o representante que
  -- vendeu; nas demais rubricas é o próprio titular da ordem.
  coalesce(vendedor.id, r.id)         as origem_representante_id,
  coalesce(vendedor.codigo, r.codigo) as origem_codigo,
  coalesce(vendedor.nome, r.nome)     as origem_nome,
  (i.tipo = 'pagamento_equipe')       as e_da_equipe,
  i.data_referencia,
  i.valor_bruto,
  i.desconto,
  i.valor_liquido,
  i.descricao,
  i.observacao
from public.ordens_pagamento o
join public.representantes r        on r.id = o.representante_id
join public.ordem_pagamento_itens i on i.ordem_id = o.id
join public.rubricas_pagamento ru   on ru.codigo = i.tipo
left join public.supervisores sup   on sup.id = o.supervisor_id
left join public.representante_contratos c on c.id = i.contrato_id
left join public.representantes vendedor    on vendedor.id = c.representante_id
where o.cancelado_em is null;

comment on view public.v_relatorio_pagamento is
  'Linhas da ordem com a origem do valor identificada, para emitir o '
  'relatório do representante e quebrá-lo por membro da equipe quando '
  'ele for líder.';
