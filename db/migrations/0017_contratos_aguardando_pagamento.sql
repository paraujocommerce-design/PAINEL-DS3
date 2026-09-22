-- =====================================================================
-- 0017 — Contratos aguardando pagamento e saldo devedor integrado
--
-- Refatoração do fluxo de pagamento: em vez de ordens diárias simples,
-- o gestor abre um wizard que mostra:
--   1. Contratos do representante ainda não lançados em nenhuma ordem
--   2. Para cada um, se pós-venda está OK ou pendente
--   3. Se pendente, só permite adiantamento (marca como débito)
--   4. Campos de entrada pra todas as 20 rubricas com saldo calculado
--      em tempo real (contratos + histórico de pagamentos + débitos)
--
-- Esta migration:
-- - Cria v_contratos_aguardando_pagamento
-- - Melhora v_representante_saldo_devedor com débitos por pós-venda
-- - Adiciona função para calcular o que cada representante deve/recebe
-- =====================================================================

-- =====================================================================
-- Contratos ainda não lançados em nenhuma ordem (aguardando pagamento)
-- =====================================================================
create view public.v_contratos_aguardando_pagamento
with (security_invoker = on) as
select
  c.id,
  c.representante_id,
  c.data_venda,
  c.codigo_contrato,
  c.nome_fantasia,
  c.status_pos_venda,
  case when c.status_pos_venda <> 'ok' then true else false end as pos_venda_pendente,
  c.premiavel,
  c.valor_plano,
  case
    when c.status_pos_venda = 'ok' and c.premiavel
      then coalesce(c.valor_premiacao, 0) - coalesce(c.desconto_premiacao, 0)
    else 0
  end as valor_disponivel_premiacao,
  case
    when c.status_pos_venda <> 'ok'
      then coalesce(c.valor_premiacao, 0)
    else 0
  end as valor_débito_pós_venda,
  c.lider_id,
  case when c.lider_id is not null then true else false end as tem_lideranca,
  case
    when c.lider_id is not null and c.status_pos_venda = 'ok'
      then coalesce(c.valor_comissao_lideranca, 0)
           - coalesce(c.desconto_comissao_lideranca, 0)
    else 0
  end as valor_comissao_lideranca
from public.representante_contratos c
where c.cancelado_em is null
  and not exists (
    select 1 from public.ordem_pagamento_itens i
     join public.ordens_pagamento o on o.id = i.ordem_id
    where i.contrato_id = c.id
      and i.tipo in ('ajuda_custo_contrato', 'pagamento_equipe')
      and o.cancelado_em is null
  );

-- =====================================================================
-- Saldo do representante: o que deve vs o que pode receber
-- Integra contratos aguardando + débitos por pós-venda + histórico
-- =====================================================================
create or replace view public.v_saldo_representante_detalhado
with (security_invoker = on) as
select
  r.id,
  r.codigo,
  r.nome,
  coalesce(sum(case when cag.pos_venda_pendente then cag.valor_débito_pós_venda else 0 end), 0)
    as débito_pós_venda_pendente,
  coalesce(sum(case when not cag.pos_venda_pendente and cag.premiavel then cag.valor_disponível_premiacao else 0 end), 0)
    as crédito_contratos_aguardando,
  coalesce(sd.saldo_devedor, 0) as saldo_devedor_existente,
  coalesce(sum(case when not cag.pos_venda_pendente and cag.premiavel then cag.valor_disponível_premiacao else 0 end), 0)
    - coalesce(sd.saldo_devedor, 0) as saldo_a_receber
from public.representantes r
left join public.v_contratos_aguardando_pagamento cag on cag.representante_id = r.id
left join public.v_representante_saldo_devedor sd on sd.representante_id = r.id
where r.cancelado_em is null
group by r.id, r.codigo, r.nome, sd.saldo_devedor;

-- =====================================================================
-- Função para registrar débito por pós-venda pendente
-- Chamada quando um contrato com pós-venda pendente entra em ordem
-- =====================================================================
create or replace function public.registrar_débito_pós_venda(
  p_contrato_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_representante uuid;
  v_valor numeric;
  v_status text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  select representante_id, status_pos_venda, coalesce(valor_premiacao, 0)
    into v_representante, v_status, v_valor
    from public.representante_contratos
   where id = p_contrato_id and cancelado_em is null;

  if v_representante is null then
    raise exception 'Contrato inexistente.';
  end if;

  if v_status = 'ok' then
    raise exception 'Contrato com pós-venda OK não gera débito.';
  end if;

  if v_valor > 0 then
    insert into public.representante_debitos
      (representante_id, origem_item_id, motivo, valor)
    values (v_representante, p_contrato_id, 
            coalesce(p_motivo, 'Contrato ' || p_contrato_id || ' com pós-venda pendente'),
            v_valor);
  end if;
end;
$fn$;

-- =====================================================================
-- Permissões nas views novas
-- =====================================================================
grant select on
  public.v_contratos_aguardando_pagamento,
  public.v_saldo_representante_detalhado
to authenticated, service_role;

grant execute on function
  public.registrar_débito_pós_venda(uuid, text)
to authenticated;
