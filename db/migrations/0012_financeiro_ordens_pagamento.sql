-- Painel de Gestão DS3 — Fase 12 (etapas 3, 4 e 5 da regra de premiação)
-- Fecha o ciclo financeiro dos representantes:
--   * saldo devedor, com abatimento rastreado até o contrato que descontou;
--   * Meta Plus por faixas, com teto (a faixa maior absorve a menor);
--   * incentivo comercial de 10% sobre a carteira ativa;
--   * ordem de pagamento com todos os itens discriminados.
--
-- Regra documentada em docs/regra-premiacao-representantes.md
-- Não altera migrations anteriores.

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='representante_contratos'
      and column_name='valor_premiacao'
  ) then
    raise exception 'Migration abortada: aplicar 0010 antes.';
  end if;
end
$preflight$;

-- =====================================================================
-- 1) Débito do representante e seus abatimentos
-- =====================================================================
create table if not exists public.representante_debitos (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete restrict,
  valor_original numeric(12,2) not null check (valor_original > 0),
  motivo text not null check (btrim(motivo) <> ''),
  data_origem date not null default current_date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  constraint debito_cancelamento_completo check (
    (cancelado_em is null and motivo_cancelamento is null)
    or (cancelado_em is not null and btrim(coalesce(motivo_cancelamento,'')) <> '')
  )
);

create index if not exists representante_debitos_rep_idx
  on public.representante_debitos (representante_id, data_origem desc);

-- Cada abatimento aponta para o contrato cujo desconto o originou.
create table if not exists public.representante_debito_abatimentos (
  id uuid primary key default gen_random_uuid(),
  debito_id uuid not null references public.representante_debitos(id) on delete restrict,
  contrato_id uuid references public.representante_contratos(id) on delete restrict,
  valor numeric(12,2) not null check (valor > 0),
  data date not null default current_date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null
);

create index if not exists debito_abatimentos_debito_idx
  on public.representante_debito_abatimentos (debito_id);

-- Saldo em aberto por débito e por representante
create or replace view public.v_representante_debitos
with (security_invoker = on) as
select
  d.id,
  d.representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  d.motivo,
  d.data_origem,
  d.valor_original,
  coalesce(a.abatido, 0) as valor_abatido,
  d.valor_original - coalesce(a.abatido, 0) as saldo,
  d.cancelado_em
from public.representante_debitos d
join public.representantes r on r.id = d.representante_id
left join lateral (
  select sum(valor) as abatido
    from public.representante_debito_abatimentos ab
   where ab.debito_id = d.id
) a on true
where d.cancelado_em is null;

create or replace view public.v_representante_saldo_devedor
with (security_invoker = on) as
select
  representante_id,
  representante_codigo,
  representante_nome,
  sum(saldo) as saldo_devedor,
  count(*) as debitos_em_aberto
from public.v_representante_debitos
where saldo > 0
group by representante_id, representante_codigo, representante_nome;

-- =====================================================================
-- 2) Faixas de Meta Plus (configuráveis)
-- =====================================================================
create table if not exists public.meta_plus_faixas (
  id uuid primary key default gen_random_uuid(),
  quantidade_contratos integer not null check (quantidade_contratos > 0),
  valor_total numeric(12,2) not null check (valor_total >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (quantidade_contratos)
);

comment on table public.meta_plus_faixas is
  'Faixas de Meta Plus. valor_total é o TOTAL devido ao atingir a faixa — a faixa maior absorve a menor, não soma.';

insert into public.meta_plus_faixas (quantidade_contratos, valor_total) values
  (10, 500.00), (15, 1000.00), (20, 2000.00)
on conflict (quantidade_contratos) do nothing;

-- =====================================================================
-- 3) Ordem de pagamento
-- =====================================================================
create table if not exists public.ordens_pagamento (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete restrict,
  competencia date not null,
  status text not null default 'aberta'
    check (status in ('aberta', 'fechada', 'paga', 'cancelada')),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  fechado_em timestamptz,
  fechado_por uuid references auth.users(id) on delete set null,
  pago_em timestamptz,
  pago_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  -- uma ordem por representante por competência
  unique (representante_id, competencia)
);

create index if not exists ordens_pagamento_comp_idx
  on public.ordens_pagamento (competencia desc, status);

create table if not exists public.ordem_pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_pagamento(id) on delete cascade,
  tipo text not null check (tipo in (
    'premiacao_contrato', 'comissao_lideranca', 'meta_plus',
    'incentivo_comercial', 'ajuste'
  )),
  contrato_id uuid references public.representante_contratos(id) on delete restrict,
  referencia text,
  descricao text not null,
  valor_bruto numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0 check (desconto >= 0),
  valor_liquido numeric(12,2) generated always as (greatest(valor_bruto - desconto, 0)) stored,
  criado_em timestamptz not null default now()
);

create index if not exists ordem_itens_ordem_idx on public.ordem_pagamento_itens (ordem_id, tipo);

create or replace view public.v_ordens_pagamento
with (security_invoker = on) as
select
  o.id,
  o.representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  o.competencia,
  o.status,
  coalesce(i.total_bruto, 0) as total_bruto,
  coalesce(i.total_desconto, 0) as total_desconto,
  coalesce(i.total_liquido, 0) as total_liquido,
  coalesce(i.qtd_itens, 0) as itens,
  coalesce(s.saldo_devedor, 0) as saldo_devedor_atual,
  o.criado_em,
  o.fechado_em,
  o.pago_em
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
left join lateral (
  select sum(valor_bruto) as total_bruto,
         sum(desconto) as total_desconto,
         sum(valor_liquido) as total_liquido,
         count(*) as qtd_itens
    from public.ordem_pagamento_itens it
   where it.ordem_id = o.id
) i on true
left join public.v_representante_saldo_devedor s on s.representante_id = o.representante_id
where o.cancelado_em is null;

-- =====================================================================
-- 4) Permissões
-- =====================================================================
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'representante_debitos', 'representante_debito_abatimentos',
    'meta_plus_faixas', 'ordens_pagamento', 'ordem_pagamento_itens'
  ] loop
    execute format('grant select on public.%I to authenticated', v_tabela);
    execute format('grant all on public.%I to service_role', v_tabela);
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('drop policy if exists %I on public.%I', v_tabela || '_select', v_tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pode_operar(auth.uid()))',
      v_tabela || '_select', v_tabela);
    execute format('revoke all on public.%I from anon', v_tabela);
    execute format('revoke delete, insert, update, truncate on public.%I from authenticated', v_tabela);
  end loop;
end
$$;

-- =====================================================================
-- 5) Registrar e abater débito
-- =====================================================================
create or replace function public.registrar_debito_representante(
  p_representante_id uuid,
  p_valor numeric,
  p_motivo text,
  p_data date default current_date,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe um valor de débito maior que zero.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do débito.';
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;

  insert into public.representante_debitos
    (representante_id, valor_original, motivo, data_origem, observacao, criado_por)
  values (p_representante_id, p_valor, btrim(p_motivo),
          coalesce(p_data, current_date),
          nullif(btrim(coalesce(p_observacao,'')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

-- Abate um valor do débito mais antigo em aberto do representante.
create or replace function public.abater_debito_representante(
  p_representante_id uuid,
  p_valor numeric,
  p_contrato_id uuid default null,
  p_observacao text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_restante numeric := coalesce(p_valor, 0);
  v_debito record;
  v_aplicar numeric;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if v_restante <= 0 then
    return 0;
  end if;

  for v_debito in
    select id, saldo from public.v_representante_debitos
     where representante_id = p_representante_id and saldo > 0
     order by data_origem, id
  loop
    exit when v_restante <= 0;
    v_aplicar := least(v_restante, v_debito.saldo);
    insert into public.representante_debito_abatimentos
      (debito_id, contrato_id, valor, observacao, criado_por)
    values (v_debito.id, p_contrato_id, v_aplicar,
            nullif(btrim(coalesce(p_observacao,'')),''), auth.uid());
    v_restante := v_restante - v_aplicar;
  end loop;

  -- devolve o que sobrou sem débito correspondente
  return v_restante;
end;
$fn$;

-- =====================================================================
-- 6) Apuração da ordem de pagamento (fonte única do cálculo)
-- =====================================================================
create or replace function public.apurar_ordem_pagamento(
  p_representante_id uuid,
  p_competencia date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ordem uuid;
  v_inicio date;
  v_fim date;
  v_status text;
  v_contratos int;
  v_faixa_valor numeric;
  v_carteira numeric;
  v_incentivo numeric;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_competencia is null then
    raise exception 'Informe a competência.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;

  select id, status into v_ordem, v_status
    from public.ordens_pagamento
   where representante_id = p_representante_id and competencia = v_inicio
     and cancelado_em is null;

  if v_ordem is null then
    insert into public.ordens_pagamento (representante_id, competencia, criado_por)
    values (p_representante_id, v_inicio, auth.uid())
    returning id into v_ordem;
  elsif v_status in ('paga', 'fechada') then
    raise exception 'Ordem de % já está % e não pode ser reapurada.',
      to_char(v_inicio, 'MM/YYYY'), v_status;
  else
    -- reapuração: limpa os itens calculados e refaz (mantém os ajustes manuais)
    delete from public.ordem_pagamento_itens
     where ordem_id = v_ordem and tipo <> 'ajuste';
  end if;

  -- 6.1 Premiação por contrato (um item por contrato, discriminado)
  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, desconto)
  select v_ordem, 'premiacao_contrato', c.id, c.codigo_contrato,
         'Contrato ' || c.codigo_contrato ||
           coalesce(' — ' || c.nome_fantasia, '') ||
           ' (' || to_char(c.data_venda, 'DD/MM') || ')',
         coalesce(c.valor_premiacao, 0), coalesce(c.desconto_premiacao, 0)
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_premiacao, 0) > 0;

  -- 6.2 Comissão de liderança (contratos da equipe cujo líder é este representante)
  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, desconto)
  select v_ordem, 'comissao_lideranca', c.id, c.codigo_contrato,
         'Equipe: ' || r.nome || ' — contrato ' || c.codigo_contrato ||
           ' (' || to_char(c.data_venda, 'DD/MM') || ')',
         coalesce(c.valor_comissao_lideranca, 0),
         coalesce(c.desconto_comissao_lideranca, 0)
    from public.representante_contratos c
    join public.representantes r on r.id = c.representante_id
   where c.lider_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_comissao_lideranca, 0) > 0;

  -- 6.3 Meta Plus — a faixa maior absorve a menor (paga o total da faixa atingida)
  select count(*) into v_contratos
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel;

  select f.valor_total into v_faixa_valor
    from public.meta_plus_faixas f
   where f.ativo and f.quantidade_contratos <= v_contratos
   order by f.quantidade_contratos desc
   limit 1;

  if v_faixa_valor is not null and v_faixa_valor > 0 then
    insert into public.ordem_pagamento_itens
      (ordem_id, tipo, referencia, descricao, valor_bruto)
    values (v_ordem, 'meta_plus', v_contratos::text,
            'Meta Plus — ' || v_contratos || ' contratos no mês',
            v_faixa_valor);
  end if;

  -- 6.4 Incentivo comercial: 10% da carteira ativa (mensalidades dos contratos vigentes)
  select sum(c.valor_plano) into v_carteira
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda <= v_fim
     and c.cancelado_em is null
     and c.valor_plano is not null;

  if coalesce(v_carteira, 0) > 0 then
    v_incentivo := round(v_carteira * 0.10, 2);
    insert into public.ordem_pagamento_itens
      (ordem_id, tipo, referencia, descricao, valor_bruto)
    values (v_ordem, 'incentivo_comercial', to_char(v_carteira, 'FM999999990.00'),
            'Incentivo comercial — 10% da carteira ativa (' ||
              to_char(v_carteira, 'FM999G999G990D00') || ')',
            v_incentivo);
  end if;

  return v_ordem;
end;
$fn$;

-- Apura todos os representantes com movimento na competência.
create or replace function public.apurar_competencia(p_competencia date)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_rep uuid;
  v_qtd int := 0;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  for v_rep in
    select distinct representante_id
      from public.representante_contratos
     where data_venda between v_inicio and v_fim and cancelado_em is null
    union
    select distinct lider_id
      from public.representante_contratos
     where data_venda between v_inicio and v_fim and cancelado_em is null
       and lider_id is not null
  loop
    begin
      perform public.apurar_ordem_pagamento(v_rep, v_inicio);
      v_qtd := v_qtd + 1;
    exception when others then
      -- ordem já fechada ou paga: não reapura, segue para o próximo
      null;
    end;
  end loop;

  return v_qtd;
end;
$fn$;

-- =====================================================================
-- 7) Ciclo de vida da ordem
-- =====================================================================
create or replace function public.fechar_ordem_pagamento(p_ordem_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta pode ser fechada (atual: %).', v_status;
  end if;

  update public.ordens_pagamento
     set status = 'fechada', fechado_em = now(), fechado_por = auth.uid()
   where id = p_ordem_id;
end;
$fn$;

create or replace function public.pagar_ordem_pagamento(p_ordem_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status not in ('aberta', 'fechada') then
    raise exception 'Ordem já está % .', v_status;
  end if;

  update public.ordens_pagamento
     set status = 'paga', pago_em = now(), pago_por = auth.uid(),
         fechado_em = coalesce(fechado_em, now()),
         fechado_por = coalesce(fechado_por, auth.uid())
   where id = p_ordem_id;
end;
$fn$;

create or replace function public.cancelar_ordem_pagamento(
  p_ordem_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_motivo,'')) = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  if not exists (select 1 from public.ordens_pagamento
                  where id = p_ordem_id and cancelado_em is null) then
    raise exception 'Ordem inexistente ou já cancelada.';
  end if;

  update public.ordens_pagamento
     set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where id = p_ordem_id;
end;
$fn$;

-- Ajuste manual (crédito ou desconto) numa ordem aberta
create or replace function public.adicionar_ajuste_ordem(
  p_ordem_id uuid,
  p_descricao text,
  p_valor numeric,
  p_desconto numeric default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_descricao,'')) = '' then
    raise exception 'Descreva o ajuste.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta aceita ajuste (atual: %).', v_status;
  end if;

  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, descricao, valor_bruto, desconto)
  values (p_ordem_id, 'ajuste', btrim(p_descricao),
          coalesce(p_valor, 0), coalesce(p_desconto, 0));
end;
$fn$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.registrar_debito_representante(uuid, numeric, text, date, text)',
    'public.abater_debito_representante(uuid, numeric, uuid, text)',
    'public.apurar_ordem_pagamento(uuid, date)',
    'public.apurar_competencia(date)',
    'public.fechar_ordem_pagamento(uuid)',
    'public.pagar_ordem_pagamento(uuid)',
    'public.cancelar_ordem_pagamento(uuid, text)',
    'public.adicionar_ajuste_ordem(uuid, text, numeric, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end
$$;
