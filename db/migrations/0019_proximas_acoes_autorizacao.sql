-- =====================================================================
-- 0019 — View de próximas ações de autorização
--
-- O que Berg precisa fazer: autorizar quais ordens?
-- O que Paulo precisa fazer: quais ordens estão prontas pra pagar?
--
-- =====================================================================

-- =====================================================================
-- Para Berg: ordens fechadas esperando supervisão
-- =====================================================================
create or replace view public.v_autorizacoes_pendentes_supervisao
with (security_invoker = on) as
select
  o.id as ordem_id,
  o.data_ordem,
  o.status,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  (select count(*) from public.ordem_pagamento_itens i where i.ordem_id = o.id) as total_itens,
  (select sum(valor_liquido) from public.ordem_pagamento_itens i where i.ordem_id = o.id) as total_valor,
  a.decisao,
  a.criado_em,
  a.decidido_em
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
left join public.ordem_pagamento_autorizacoes a on a.ordem_id = o.id and a.instancia = 'supervisao'
where o.status = 'fechada'
  and o.cancelado_em is null
  and a.decisao = 'pendente'
order by o.data_ordem desc;

-- =====================================================================
-- Para Paulo: ordens prontas pra pagar (todas as autorizações concedidas)
-- =====================================================================
create or replace view public.v_ordens_prontas_para_pagar
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
    select string_agg(instancia || ': ' || decisao, ', ' order by instancia)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id
  ) as autorizacoes,
  (
    select count(*)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id
  ) as total_autorizacoes_exigidas,
  (
    select count(*)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id and a.decisao = 'autorizada'
  ) as autorizacoes_concedidas,
  (
    select count(*)
    from public.ordem_pagamento_autorizacoes a
    where a.ordem_id = o.id and a.decisao = 'recusada'
  ) as autorizacoes_recusadas,
  case
    when o.status <> 'fechada' then 'Ordem ainda está aberta'
    when (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id and a.decisao = 'recusada') > 0
      then 'Recusada por supervisão'
    when (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id and a.decisao = 'pendente') > 0
      then 'Aguardando autorização de supervisão'
    else 'Pronta para pagar'
  end as situacao,
  case
    when o.status = 'fechada'
      and (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id) > 0
      and (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id and a.decisao in ('autorizada', 'recusada')) 
        = (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id)
      and (select count(*) from public.ordem_pagamento_autorizacoes a where a.ordem_id = o.id and a.decisao = 'recusada') = 0
      then true
    else false
  end as pode_pagar
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
where o.cancelado_em is null
order by o.data_ordem desc;

-- =====================================================================
-- Dashboard unificado: tudo que os dois precisam fazer
-- =====================================================================
create or replace view public.v_proximas_acoes_financeiras
with (security_invoker = on) as
select
  auth.uid() as usuario_id,
  public.f_papel_do_usuario(auth.uid()) as papel,
  'autorizar_supervisao' as tipo_acao,
  (select count(*) from public.v_autorizacoes_pendentes_supervisao) as quantidade,
  'Berg' as quem_atua,
  'Autorizar ordens fechadas' as descricao
where public.f_tem_papel(auth.uid(), 'supervisao')
union all
select
  auth.uid(),
  public.f_papel_do_usuario(auth.uid()),
  'pagar_ordem' as tipo_acao,
  (select count(*) from public.v_ordens_prontas_para_pagar where pode_pagar = true),
  'Paulo' as quem_atua,
  'Pagar ordens autorizadas'
where public.f_tem_papel(auth.uid(), 'admin');

-- =====================================================================
-- Permissões
-- =====================================================================
grant select on public.v_autorizacoes_pendentes_supervisao to authenticated, service_role;
grant select on public.v_ordens_prontas_para_pagar to authenticated, service_role;
grant select on public.v_proximas_acoes_financeiras to authenticated, service_role;
