-- =====================================================================
-- 0015 — Ordens diárias e liberação por forma de pagamento
--
-- Correção de um erro de modelagem meu. O sistema assumia uma ordem por
-- representante por mês, apurada de uma vez com tudo dentro. A operação
-- real é outra:
--
--   · as ordens são DIÁRIAS, conforme a demanda dos representantes;
--   · cada ordem paga só o que o gestor indicar;
--   · o incentivo é uma vez no mês (até o décimo dia útil, ou antes se
--     sinalizado), não em toda ordem de contrato;
--   · o Meta Plus é por FAIXA ATINGIDA: quem bate 10 no dia 05 já tem
--     direito naquele dia, e vai recebendo conforme fecha mais.
--
-- Então a apuração automática sai de cena e entra a escolha: o sistema
-- mostra o que está disponível para pagar e o gestor marca o que entra.
-- =====================================================================

-- =====================================================================
-- 1) A ordem passa a ter dia próprio e deixa de ser única no mês
-- =====================================================================
alter table public.ordens_pagamento
  add column if not exists data_ordem date;

-- Preenchimento retroativo: o dia da ordem tem de cair dentro da própria
-- competência. A data de pagamento NÃO serve — pagar dia 05/10 uma ordem
-- de 09/2026 é normal, e usá-la jogaria a ordem para o mês errado.
update public.ordens_pagamento
   set data_ordem = case
         when criado_em::date between competencia
              and (competencia + interval '1 month - 1 day')::date
           then criado_em::date
         else (competencia + interval '1 month - 1 day')::date
       end
 where data_ordem is null;

alter table public.ordens_pagamento
  alter column data_ordem set not null,
  alter column data_ordem set default current_date;

do $$
declare
  v_nome text;
begin
  -- a trava de "uma por mês" é justamente o que impede a ordem diária
  select conname into v_nome
    from pg_constraint
   where conrelid = 'public.ordens_pagamento'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%representante_id%competencia%';
  if v_nome is not null then
    execute format('alter table public.ordens_pagamento drop constraint %I', v_nome);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ordem_competencia_do_dia') then
    alter table public.ordens_pagamento
      add constraint ordem_competencia_do_dia
      check (competencia = date_trunc('month', data_ordem)::date);
  end if;
end
$$;

create index if not exists idx_ordens_representante_data
  on public.ordens_pagamento (representante_id, data_ordem desc);

-- =====================================================================
-- 2) Rubricas que só podem sair uma vez por mês
-- Incentivo e ajuda de custo fixa são mensais por natureza. O Meta Plus
-- não entra aqui: ele sai várias vezes no mês, uma por faixa.
-- =====================================================================
alter table public.rubricas_pagamento
  add column if not exists unica_por_competencia boolean not null default false;

update public.rubricas_pagamento
   set unica_por_competencia = true
 where codigo in ('pagamento_incentivo', 'ajuda_custo_fixa');

-- "Ajuste" era rubrica técnica da primeira versão do financeiro e não
-- existe no formulário da DS3 — sai de cena sem apagar o que já usou ela.
update public.rubricas_pagamento set ativo = false where codigo = 'ajuste';

create or replace function public.f_rubrica_unica_no_mes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_unica boolean;
  v_rotulo text;
  v_representante uuid;
  v_competencia date;
begin
  select unica_por_competencia, rotulo into v_unica, v_rotulo
    from public.rubricas_pagamento where codigo = new.tipo;
  if not coalesce(v_unica, false) then
    return new;
  end if;

  select representante_id, competencia into v_representante, v_competencia
    from public.ordens_pagamento where id = new.ordem_id;

  if exists (
    select 1
      from public.ordem_pagamento_itens i
      join public.ordens_pagamento o on o.id = i.ordem_id
     where i.tipo = new.tipo
       and i.id <> new.id
       and o.representante_id = v_representante
       and o.competencia = v_competencia
       and o.cancelado_em is null
  ) then
    raise exception '"%" já foi pago a este representante em %. É uma vez por mês.',
      v_rotulo, to_char(v_competencia, 'MM/YYYY');
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_rubrica_unica_no_mes on public.ordem_pagamento_itens;
create trigger trg_rubrica_unica_no_mes
  before insert or update of tipo on public.ordem_pagamento_itens
  for each row execute function public.f_rubrica_unica_no_mes();

-- =====================================================================
-- 3) O que está disponível para pagar agora
-- Substitui a apuração automática: em vez de despejar tudo na ordem, o
-- sistema mostra o que cabe e o gestor escolhe.
-- =====================================================================
create or replace function public.pagamentos_disponiveis(
  p_representante_id uuid,
  p_data date default current_date
)
returns table (
  rubrica text,
  rotulo text,
  contrato_id uuid,
  codigo_contrato text,
  descricao text,
  data_referencia date,
  valor numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_inicio date := date_trunc('month', p_data)::date;
  v_fim date := (date_trunc('month', p_data) + interval '1 month - 1 day')::date;
  v_contratos int;
  v_devido numeric;
  v_pago numeric;
  v_carteira numeric;
  v_ajuda numeric;
begin
  if not public.pode_ver_financeiro(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  -- 3.1 contratos do próprio representante ainda não pagos
  return query
  select 'ajuda_custo_contrato'::text,
         'Ajuda de custo por contrato'::text,
         c.id,
         c.codigo_contrato,
         'Contrato ' || c.codigo_contrato || coalesce(' — ' || c.nome_fantasia, ''),
         c.data_venda,
         greatest(coalesce(c.valor_premiacao, 0) - coalesce(c.desconto_premiacao, 0), 0)
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_premiacao, 0) > 0
     and not exists (
       select 1 from public.ordem_pagamento_itens i
        join public.ordens_pagamento o on o.id = i.ordem_id
       where i.contrato_id = c.id
         and i.tipo = 'ajuda_custo_contrato'
         and o.cancelado_em is null)
   order by c.data_venda;

  -- 3.2 contratos da equipe, quando ele é líder
  return query
  select 'pagamento_equipe'::text,
         'Pagamento por equipe'::text,
         c.id,
         c.codigo_contrato,
         'Equipe: ' || rep.nome || ' — contrato ' || c.codigo_contrato,
         c.data_venda,
         greatest(coalesce(c.valor_comissao_lideranca, 0)
                  - coalesce(c.desconto_comissao_lideranca, 0), 0)
    from public.representante_contratos c
    join public.representantes rep on rep.id = c.representante_id
   where c.lider_id = p_representante_id
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_comissao_lideranca, 0) > 0
     and not exists (
       select 1 from public.ordem_pagamento_itens i
        join public.ordens_pagamento o on o.id = i.ordem_id
       where i.contrato_id = c.id
         and i.tipo = 'pagamento_equipe'
         and o.cancelado_em is null)
   order by c.data_venda;

  -- 3.3 Meta Plus — por faixa atingida, não no fim do mês.
  -- Bateu 10 no dia 05, tem direito no dia 05. Fechou 15 depois, recebe
  -- a diferença: a faixa maior absorve a menor.
  select count(*) into v_contratos
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel;

  select f.valor_total into v_devido
    from public.meta_plus_faixas f
   where f.ativo and f.quantidade_contratos <= v_contratos
   order by f.quantidade_contratos desc
   limit 1;

  select coalesce(sum(i.valor_liquido), 0) into v_pago
    from public.ordem_pagamento_itens i
    join public.ordens_pagamento o on o.id = i.ordem_id
   where i.tipo = 'meta_plus'
     and o.representante_id = p_representante_id
     and o.competencia = v_inicio
     and o.cancelado_em is null;

  if coalesce(v_devido, 0) - v_pago > 0 then
    return query select
      'meta_plus'::text,
      'Meta Plus'::text,
      null::uuid,
      null::text,
      'Meta Plus — ' || v_contratos || ' contratos no mês'
        || case when v_pago > 0
                then ' (diferença da faixa; já pago '
                     || to_char(v_pago, 'FM999G999G990D00') || ')'
                else '' end,
      p_data,
      coalesce(v_devido, 0) - v_pago;
  end if;

  -- 3.4 Incentivo — uma vez no mês
  if not exists (
    select 1 from public.ordem_pagamento_itens i
     join public.ordens_pagamento o on o.id = i.ordem_id
    where i.tipo = 'pagamento_incentivo'
      and o.representante_id = p_representante_id
      and o.competencia = v_inicio
      and o.cancelado_em is null
  ) then
    select sum(c.valor_plano) into v_carteira
      from public.representante_contratos c
     where c.representante_id = p_representante_id
       and c.data_venda <= v_fim
       and c.cancelado_em is null
       and c.valor_plano is not null;

    if coalesce(v_carteira, 0) > 0 then
      return query select
        'pagamento_incentivo'::text,
        'Pagamento incentivo'::text,
        null::uuid,
        null::text,
        'Incentivo comercial — 10% da carteira ativa ('
          || to_char(v_carteira, 'FM999G999G990D00') || ')',
        p_data,
        round(v_carteira * 0.10, 2);
    end if;
  end if;

  -- 3.5 Ajuda de custo fixa — uma vez no mês
  if not exists (
    select 1 from public.ordem_pagamento_itens i
     join public.ordens_pagamento o on o.id = i.ordem_id
    where i.tipo = 'ajuda_custo_fixa'
      and o.representante_id = p_representante_id
      and o.competencia = v_inicio
      and o.cancelado_em is null
  ) then
    select valor_ajuda_custo_fixa into v_ajuda
      from public.representantes where id = p_representante_id;
    if coalesce(v_ajuda, 0) > 0 then
      return query select
        'ajuda_custo_fixa'::text,
        'Ajuda de custo fixa'::text,
        null::uuid,
        null::text,
        'Ajuda de custo fixa do mês'::text,
        p_data,
        v_ajuda;
    end if;
  end if;
end;
$fn$;

-- =====================================================================
-- 4) Abrir ordem e incluir o que foi escolhido
-- =====================================================================
create or replace function public.criar_ordem_pagamento(
  p_representante_id uuid,
  p_data date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ordem uuid;
  v_supervisor uuid;
  v_competencia date := date_trunc('month', p_data)::date;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;

  select v.supervisor_id into v_supervisor
    from public.representante_vinculos v
   where v.representante_id = p_representante_id
     and v.inicio <= p_data
     and (v.fim is null or v.fim >= p_data)
   order by v.inicio desc
   limit 1;

  insert into public.ordens_pagamento
    (representante_id, competencia, data_ordem, criado_por, supervisor_id)
  values (p_representante_id, v_competencia, p_data, auth.uid(), v_supervisor)
  returning id into v_ordem;

  return v_ordem;
end;
$fn$;

/** Inclui contratos escolhidos, na rubrica escolhida. */
create or replace function public.incluir_contratos_na_ordem(
  p_ordem_id uuid,
  p_rubrica text,
  p_contrato_ids uuid[]
)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_representante uuid;
  v_incluidos int := 0;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_rubrica not in ('ajuda_custo_contrato', 'pagamento_equipe') then
    raise exception 'Rubrica % não é de contrato.', p_rubrica;
  end if;

  select status, representante_id into v_status, v_representante
    from public.ordens_pagamento where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta aceita inclusão (atual: %).', v_status;
  end if;

  with escolhidos as (
    select d.* from public.pagamentos_disponiveis(v_representante) d
     where d.rubrica = p_rubrica
       and d.contrato_id = any(p_contrato_ids)
  )
  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, sinal, data_referencia)
  select p_ordem_id, p_rubrica, e.contrato_id, e.codigo_contrato, e.descricao,
         e.valor, 1, e.data_referencia
    from escolhidos e;

  get diagnostics v_incluidos = row_count;
  return v_incluidos;
end;
$fn$;

/** Inclui uma rubrica mensal (Meta Plus, incentivo, ajuda fixa). */
create or replace function public.incluir_rubrica_mensal_na_ordem(
  p_ordem_id uuid,
  p_rubrica text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_representante uuid;
  v_data date;
  v_disponivel record;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_rubrica not in ('meta_plus', 'pagamento_incentivo', 'ajuda_custo_fixa') then
    raise exception 'Rubrica % não é mensal.', p_rubrica;
  end if;

  select status, representante_id, data_ordem
    into v_status, v_representante, v_data
    from public.ordens_pagamento where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta aceita inclusão (atual: %).', v_status;
  end if;

  select * into v_disponivel
    from public.pagamentos_disponiveis(v_representante, v_data) d
   where d.rubrica = p_rubrica;

  if v_disponivel is null then
    raise exception 'Nada disponível nesta rubrica para este representante agora.';
  end if;

  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, referencia, descricao, valor_bruto, sinal, data_referencia)
  values (p_ordem_id, p_rubrica, null, v_disponivel.descricao,
          v_disponivel.valor, 1, v_data);

  return v_disponivel.valor;
end;
$fn$;

-- =====================================================================
-- 5) A apuração automática sai de cena
-- Ela despejava tudo numa ordem só, que é exatamente o comportamento
-- que o gestor apontou como errado.
-- =====================================================================
drop function if exists public.apurar_competencia(date);
drop function if exists public.apurar_ordem_pagamento(uuid, date);

-- =====================================================================
-- 6) A ordem na lista precisa mostrar o dia
-- =====================================================================
-- `create or replace view` só aceita colunas acrescentadas no fim, e
-- `data_ordem` entra no meio. Derruba e recria — junto com a view do
-- cruzamento financeiro, que depende desta.
drop view if exists public.v_financeiro_representante;
drop view if exists public.v_ordens_pagamento;

create view public.v_ordens_pagamento
with (security_invoker = on) as
select
  o.id,
  o.representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  o.supervisor_id,
  sup.nome as supervisor_nome,
  o.competencia,
  o.data_ordem,
  o.status,
  coalesce(i.total_bruto, 0) as total_bruto,
  coalesce(i.total_desconto, 0) as total_desconto,
  coalesce(i.total_liquido, 0) as total_liquido,
  coalesce(i.qtd_itens, 0) as itens,
  coalesce(s.saldo_devedor, 0) as saldo_devedor_atual,
  coalesce(a.exigidas, 0) as autorizacoes_exigidas,
  coalesce(a.concedidas, 0) as autorizacoes_concedidas,
  coalesce(a.recusadas, 0) as autorizacoes_recusadas,
  (o.status = 'fechada'
   and coalesce(a.recusadas, 0) = 0
   and coalesce(a.exigidas, 0) = coalesce(a.concedidas, 0)) as liberada_para_pagamento,
  o.destinatario_nome,
  o.destinatario_motivo,
  coalesce(o.destinatario_nome, r.favorecido, r.nome) as favorecido_efetivo,
  coalesce(o.destinatario_banco, r.banco) as banco_efetivo,
  coalesce(o.destinatario_agencia, r.agencia) as agencia_efetiva,
  coalesce(o.destinatario_conta, r.conta) as conta_efetiva,
  o.forma_pagamento,
  o.data_pagamento,
  o.valor_pago,
  o.comprovante,
  o.criado_em,
  o.fechado_em,
  o.pago_em
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
left join public.supervisores sup on sup.id = o.supervisor_id
left join lateral (
  select sum(it.sinal * it.valor_bruto) as total_bruto,
         sum(it.desconto) as total_desconto,
         sum(it.valor_liquido) as total_liquido,
         count(*) as qtd_itens
    from public.ordem_pagamento_itens it
   where it.ordem_id = o.id
) i on true
left join lateral (
  select count(*) as exigidas,
         count(*) filter (where au.decisao = 'autorizada') as concedidas,
         count(*) filter (where au.decisao = 'recusada') as recusadas
    from public.ordem_pagamento_autorizacoes au
   where au.ordem_id = o.id
) a on true
left join public.v_representante_saldo_devedor s on s.representante_id = o.representante_id
where o.cancelado_em is null;

create view public.v_financeiro_representante
with (security_invoker = on) as
select
  r.id as representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  o.competencia,
  o.status,
  coalesce(v.total_liquido, 0) as total_apurado,
  coalesce(o.valor_pago, 0) as total_pago,
  coalesce(v.total_liquido, 0) - coalesce(o.valor_pago, 0) as diferenca,
  coalesce(s.saldo_devedor, 0) as saldo_devedor,
  (select count(*) from public.representante_contratos c
    where c.representante_id = r.id
      and c.cancelado_em is null
      and c.data_venda between o.competencia
        and (o.competencia + interval '1 month - 1 day')::date) as contratos_no_mes
from public.representantes r
join public.ordens_pagamento o on o.representante_id = r.id and o.cancelado_em is null
join public.v_ordens_pagamento v on v.id = o.id
left join public.v_representante_saldo_devedor s on s.representante_id = r.id;

grant execute on function
  public.pagamentos_disponiveis(uuid, date),
  public.criar_ordem_pagamento(uuid, date),
  public.incluir_contratos_na_ordem(uuid, text, uuid[]),
  public.incluir_rubrica_mensal_na_ordem(uuid, text)
to authenticated;
