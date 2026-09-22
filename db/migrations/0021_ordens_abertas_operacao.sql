-- =====================================================================
-- 0021 — Ordens abertas para Operação (Mariucha)
-- =====================================================================

create or replace view public.v_ordens_abertas_operacao
with (security_invoker = on) as
select
  o.id,
  o.data_ordem,
  o.status,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  (select count(*) from public.ordem_pagamento_itens i where i.ordem_id = o.id) as total_itens,
  (select sum(valor_liquido) from public.ordem_pagamento_itens i where i.ordem_id = o.id) as total_valor,
  (
    select count(*)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id
  ) as autorizacoes_exigidas,
  (
    select count(*)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id and a.decisao = 'pendente'
  ) as autorizacoes_pendentes
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
where o.status = 'aberta'
  and o.cancelado_em is null
order by o.data_ordem desc;

grant select on public.v_ordens_abertas_operacao to authenticated, service_role;
