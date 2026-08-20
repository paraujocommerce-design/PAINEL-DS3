-- Painel de Gestão DS3 — Fase 4.1
-- Correção estrutural da frente Prefeituras.
-- INCREMENTAL: assume 0001, 0002 e 0003 já aplicadas. NÃO altera migrations anteriores.
-- Preserva todos os fatos existentes: nenhuma linha é apagada.
--
-- Causas estruturais corrigidas:
--   1) Frente Prefeituras pertence a Clênio (resolvido no banco, não pela aplicação).
--   2) "Em andamento" (sem espera) deixa de ser confundido com "aguardando".
--   3) Movimentação de estado nunca retrocede cronologicamente.
--   4) Próximo passo passa a ter histórico append-only.
--   5) Dependência externa passa a ser preservada no histórico.
--   6/7) Coerência estrutural de contratos e unicidade oportunidade → contrato.
--   8/9) Renovação válida e sem duplicidade do mesmo contrato anterior.
--   10) Prefeitura com contrato válido não volta como nova aquisição.
--   11) Escrita com regra de negócio somente por RPC.
--   14) Menor privilégio revalidado.

-- =====================================================================
-- 0) PREFLIGHT DE INTEGRIDADE (dados existentes da Fase 4)
--    Não corrige dados. Aborta a migration se houver inconsistência.
-- =====================================================================
do $$
declare
  v_clenio uuid;
  v_qtd bigint;
  v_erros text := '';
begin
  select s.id into v_clenio from public.supervisores s where s.slug = 'clenio';
  if v_clenio is null then
    raise exception 'PREFLIGHT: responsável operacional da frente Prefeituras (slug "clenio") não está cadastrado em public.supervisores.';
  end if;

  -- 1) Oportunidade atribuída a supervisor diferente de Clênio
  select count(*) into v_qtd
  from public.prefeitura_oportunidades o
  where o.responsavel_supervisor_id is distinct from v_clenio;
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s oportunidade(s) com responsável diferente de Clênio (prefeitura_oportunidades.responsavel_supervisor_id).', v_qtd);
  end if;

  -- 2) Dependência externa incompatível com tipo_espera
  select count(*) into v_qtd
  from public.prefeitura_oportunidades o
  where not (
    (o.tipo_espera = 'externa' and btrim(coalesce(o.dependencia_externa, '')) <> '')
    or (o.tipo_espera is distinct from 'externa' and o.dependencia_externa is null)
  );
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s oportunidade(s) com dependencia_externa incompatível com tipo_espera (externa exige dependência; demais exigem dependência nula).', v_qtd);
  end if;

  -- 3) Contrato tipo "nova" sem oportunidade ou com contrato anterior
  select count(*) into v_qtd
  from public.prefeitura_contratos c
  where c.tipo = 'nova'
    and (c.oportunidade_id is null or c.contrato_anterior_id is not null);
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s contrato(s) tipo "nova" sem oportunidade_id ou com contrato_anterior_id preenchido.', v_qtd);
  end if;

  -- 4) Renovação sem contrato anterior ou com oportunidade
  select count(*) into v_qtd
  from public.prefeitura_contratos c
  where c.tipo = 'renovacao'
    and (c.contrato_anterior_id is null or c.oportunidade_id is not null);
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s contrato(s) tipo "renovacao" sem contrato_anterior_id ou com oportunidade_id preenchido.', v_qtd);
  end if;

  -- 5) Oportunidade originando contratos duplicados
  select count(*) into v_qtd
  from (
    select c.oportunidade_id
    from public.prefeitura_contratos c
    where c.oportunidade_id is not null
    group by c.oportunidade_id
    having count(*) > 1
  ) d;
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s oportunidade(s) originando mais de um contrato.', v_qtd);
  end if;

  -- 6) Duas renovações válidas (não canceladas) para o mesmo contrato anterior
  select count(*) into v_qtd
  from (
    select c.contrato_anterior_id
    from public.prefeitura_contratos c
    where c.contrato_anterior_id is not null
      and c.cancelado_em is null
    group by c.contrato_anterior_id
    having count(*) > 1
  ) d;
  if v_qtd > 0 then
    v_erros := v_erros || format(
      E'\n - %s contrato(s) anterior(es) com mais de uma renovação não cancelada.', v_qtd);
  end if;

  if v_erros <> '' then
    raise exception E'PREFLIGHT 0004 ABORTADO — dados existentes inconsistentes:%\nNenhum dado foi alterado. Corrija manualmente os registros acima e reaplique a migration.', v_erros;
  end if;
end;
$$;



-- =====================================================================
-- 1) Responsável operacional da frente: Clênio (resolvido no banco)
-- =====================================================================
create or replace function public.f_prefeitura_supervisor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select s.id into v_id from public.supervisores s where s.slug = 'clenio';
  if v_id is null then
    raise exception 'Responsável operacional da frente Prefeituras (slug "clenio") não está cadastrado em public.supervisores.';
  end if;
  return v_id;
end;
$$;

-- Proteção: nenhuma oportunidade de Prefeituras pode ser atribuída a outro
-- supervisor, mesmo por caminho não autorizado (import, service_role, SQL direto).
create or replace function public.f_prefeitura_oportunidade_responsavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clenio uuid := public.f_prefeitura_supervisor();
begin
  if new.responsavel_supervisor_id is distinct from v_clenio then
    raise exception 'A frente Prefeituras é operada por Clênio: outro responsável não é permitido.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_prefeitura_oportunidade_responsavel on public.prefeitura_oportunidades;
create trigger on_prefeitura_oportunidade_responsavel
  before insert or update of responsavel_supervisor_id on public.prefeitura_oportunidades
  for each row execute function public.f_prefeitura_oportunidade_responsavel();

-- =====================================================================
-- 2) Em andamento ≠ aguardando
--    tipo_espera NULL  = em andamento (sem estado de espera)
--    tipo_espera interna/externa = aguardando
--    Dependência externa existe apenas na espera externa.
-- =====================================================================
alter table public.prefeitura_oportunidades
  drop constraint if exists oportunidade_aberta_proximo_movimento;

alter table public.prefeitura_oportunidades
  add constraint oportunidade_aberta_proximo_movimento check (
    status <> 'aberta'
    or (
      btrim(coalesce(proximo_passo, '')) <> ''
      and prazo is not null
      and responsavel_supervisor_id is not null
    )
  );

alter table public.prefeitura_oportunidades
  drop constraint if exists oportunidade_dependencia_somente_externa;

-- NOT VALID: linhas anteriores à 0004 permanecem intactas; novas escritas obedecem.
alter table public.prefeitura_oportunidades
  add constraint oportunidade_dependencia_somente_externa check (
    (tipo_espera = 'externa' and btrim(coalesce(dependencia_externa, '')) <> '')
    or (tipo_espera is distinct from 'externa' and dependencia_externa is null)
  ) not valid;

-- =====================================================================
-- 5) Dependência externa preservada no histórico de movimentações
-- =====================================================================
alter table public.prefeitura_movimentos
  add column if not exists dependencia_externa text;

-- =====================================================================
-- 4) Histórico do próximo passo — novo tipo de movimento
-- =====================================================================
do $$
declare
  v_con text;
begin
  select conname into v_con
  from pg_constraint
  where conrelid = 'public.prefeitura_movimentos'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%abertura%'
    and pg_get_constraintdef(oid) like '%reabertura%';
  if v_con is not null then
    execute format('alter table public.prefeitura_movimentos drop constraint %I', v_con);
  end if;
end;
$$;

alter table public.prefeitura_movimentos
  drop constraint if exists prefeitura_movimentos_tipo_valido;

alter table public.prefeitura_movimentos
  add constraint prefeitura_movimentos_tipo_valido check (
    tipo in ('abertura', 'avanco', 'retrocesso', 'ganho', 'perda', 'reabertura',
             'atualizacao_proximo_passo')
  );

-- =====================================================================
-- 6/7) Coerência estrutural dos contratos
--      nova       → exige oportunidade_id, sem contrato_anterior_id
--      renovacao  → exige contrato_anterior_id, sem oportunidade_id
--      Constraints NOT VALID: contratos já registrados são preservados.
-- =====================================================================
alter table public.prefeitura_contratos
  drop constraint if exists contrato_nova_coerente;
alter table public.prefeitura_contratos
  add constraint contrato_nova_coerente check (
    tipo <> 'nova' or (oportunidade_id is not null and contrato_anterior_id is null)
  ) not valid;

alter table public.prefeitura_contratos
  drop constraint if exists contrato_renovacao_coerente;
alter table public.prefeitura_contratos
  add constraint contrato_renovacao_coerente check (
    tipo <> 'renovacao' or (contrato_anterior_id is not null and oportunidade_id is null)
  ) not valid;

-- Uma oportunidade ganha origina no máximo um contrato.
create unique index if not exists prefeitura_contratos_oportunidade_unica
  on public.prefeitura_contratos (oportunidade_id)
  where oportunidade_id is not null;

-- 9) No máximo uma renovação NÃO CANCELADA por contrato anterior.
create unique index if not exists prefeitura_contratos_renovacao_unica
  on public.prefeitura_contratos (contrato_anterior_id)
  where contrato_anterior_id is not null and cancelado_em is null;

-- =====================================================================
-- 3/4/5) RPCs de estado — cronologia, histórico e dependência externa
-- =====================================================================

-- Validação central da espera (usada por todas as RPCs de estado).
create or replace function public.f_prefeitura_espera(
  p_tipo_espera text,
  p_dependencia_externa text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_tipo_espera is null or btrim(p_tipo_espera) = '' then
    if btrim(coalesce(p_dependencia_externa, '')) <> '' then
      raise exception 'Dependência externa só se aplica a oportunidade aguardando processo externo.';
    end if;
    return null;
  end if;
  if p_tipo_espera not in ('interna', 'externa') then
    raise exception 'Estado de espera inválido: use em andamento, interna ou externa.';
  end if;
  if p_tipo_espera = 'interna' and btrim(coalesce(p_dependencia_externa, '')) <> '' then
    raise exception 'Dependência externa só se aplica a oportunidade aguardando processo externo.';
  end if;
  if p_tipo_espera = 'externa' and btrim(coalesce(p_dependencia_externa, '')) = '' then
    raise exception 'Aguardando processo externo exige o registro da dependência.';
  end if;
  return p_tipo_espera;
end;
$$;

-- Abertura: responsável resolvido internamente; bloqueio de nova aquisição
-- para prefeitura que já possui contrato válido.
drop function if exists public.abrir_oportunidade_prefeitura(uuid, uuid, text, date, text, text, date, text);
drop function if exists public.abrir_oportunidade_prefeitura(uuid, text, date, text, text, date, text);

create function public.abrir_oportunidade_prefeitura(
  p_prefeitura_id uuid,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text default null,
  p_dependencia_externa text default null,
  p_data_entrada date default current_date,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_data date := coalesce(p_data_entrada, current_date);
  v_espera text;
  v_dependencia text;
  v_responsavel uuid;
begin
  perform public.f_prefeitura_admin();
  v_responsavel := public.f_prefeitura_supervisor();

  if not exists (select 1 from public.prefeituras p where p.id = p_prefeitura_id) then
    raise exception 'Prefeitura inexistente.';
  end if;
  if btrim(coalesce(p_proximo_passo, '')) = '' then
    raise exception 'Oportunidade aberta exige próximo passo.';
  end if;
  if p_prazo is null then
    raise exception 'Oportunidade aberta exige prazo.';
  end if;

  v_espera := public.f_prefeitura_espera(p_tipo_espera, p_dependencia_externa);
  v_dependencia := case when v_espera = 'externa'
                        then btrim(p_dependencia_externa) else null end;

  if exists (
    select 1 from public.prefeitura_oportunidades o
    where o.prefeitura_id = p_prefeitura_id and o.status = 'aberta'
  ) then
    raise exception 'Esta prefeitura já possui uma oportunidade aberta.';
  end if;

  -- Nova aquisição ≠ cliente existente.
  if exists (
    select 1 from public.prefeitura_contratos c
    where c.prefeitura_id = p_prefeitura_id and c.cancelado_em is null
  ) then
    raise exception 'Esta prefeitura já possui contrato válido: não pode ser contabilizada como nova aquisição. Utilize o fluxo de renovação quando aplicável.';
  end if;

  insert into public.prefeitura_oportunidades (
    prefeitura_id, etapa_atual, status, responsavel_supervisor_id,
    data_entrada, ultima_movimentacao, etapa_desde,
    proximo_passo, prazo, tipo_espera, dependencia_externa, observacao, created_by
  )
  values (
    p_prefeitura_id, 'prospeccao', 'aberta', v_responsavel,
    v_data, v_data, v_data,
    btrim(p_proximo_passo), p_prazo, v_espera, v_dependencia,
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  )
  returning id into v_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    proximo_passo, prazo, tipo_espera, dependencia_externa, created_by
  )
  values (v_id, 'abertura', null, 'prospeccao', v_data,
          btrim(p_proximo_passo), p_prazo, v_espera, v_dependencia, auth.uid());

  return v_id;
end;
$$;

-- Movimentação de etapa: cronologia estrita (>= última movimentação).
create or replace function public.mover_etapa_prefeitura(
  p_oportunidade_id uuid,
  p_etapa_nova text,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text default null,
  p_dependencia_externa text default null,
  p_motivo text default null,
  p_ocorrido_em date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
  v_data date := coalesce(p_ocorrido_em, current_date);
  v_ordem_atual integer;
  v_ordem_nova integer;
  v_tipo text;
  v_espera text;
  v_dependencia text;
begin
  perform public.f_prefeitura_admin();

  select * into v_op from public.prefeitura_oportunidades o
  where o.id = p_oportunidade_id for update;
  if v_op.id is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if v_op.status <> 'aberta' then
    raise exception 'Oportunidade encerrada. Reabra antes de movimentar.';
  end if;

  v_ordem_atual := public.f_prefeitura_etapa_ordem(v_op.etapa_atual);
  v_ordem_nova := public.f_prefeitura_etapa_ordem(p_etapa_nova);
  if v_ordem_nova is null then
    raise exception 'Etapa inexistente no funil.';
  end if;
  if p_etapa_nova = 'contrato' then
    raise exception 'A etapa CONTRATO é atingida pelo fechamento da oportunidade (ganho).';
  end if;
  if v_ordem_nova = v_ordem_atual then
    raise exception 'A oportunidade já está nesta etapa.';
  end if;
  if v_ordem_nova > v_ordem_atual + 1 then
    raise exception 'Avanço inválido: o funil avança uma etapa por vez.';
  end if;
  if v_data < v_op.data_entrada then
    raise exception 'A movimentação não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;
  if v_data < v_op.ultima_movimentacao then
    raise exception 'A movimentação não pode ser anterior à última movimentação registrada (%).', v_op.ultima_movimentacao;
  end if;

  if v_ordem_nova < v_ordem_atual then
    v_tipo := 'retrocesso';
    if btrim(coalesce(p_motivo, '')) = '' then
      raise exception 'Retroceder etapa exige motivo registrado.';
    end if;
  else
    v_tipo := 'avanco';
  end if;

  if btrim(coalesce(p_proximo_passo, '')) = '' then
    raise exception 'Oportunidade aberta exige próximo passo.';
  end if;
  if p_prazo is null then
    raise exception 'Oportunidade aberta exige prazo.';
  end if;

  v_espera := public.f_prefeitura_espera(p_tipo_espera, p_dependencia_externa);
  v_dependencia := case when v_espera = 'externa'
                        then btrim(p_dependencia_externa) else null end;

  if p_etapa_nova = 'decisor' and not exists (
    select 1 from public.prefeitura_contatos c
    where c.prefeitura_id = v_op.prefeitura_id and c.decisor and c.ativo
  ) then
    raise exception 'Registre ao menos um decisor da prefeitura antes desta etapa.';
  end if;

  update public.prefeitura_oportunidades o
     set etapa_atual = p_etapa_nova,
         etapa_desde = v_data,
         ultima_movimentacao = v_data,
         proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = v_espera,
         dependencia_externa = v_dependencia
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    motivo, proximo_passo, prazo, tipo_espera, dependencia_externa, created_by
  )
  values (p_oportunidade_id, v_tipo, v_op.etapa_atual, p_etapa_nova, v_data,
          nullif(btrim(coalesce(p_motivo, '')), ''), btrim(p_proximo_passo),
          p_prazo, v_espera, v_dependencia, auth.uid());
end;
$$;

-- Próximo passo: append-only. O valor anterior permanece recuperável no histórico.
drop function if exists public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, text);
drop function if exists public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, date, text);

create function public.definir_proximo_passo_prefeitura(
  p_oportunidade_id uuid,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text default null,
  p_dependencia_externa text default null,
  p_ocorrido_em date default current_date,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
  v_data date := coalesce(p_ocorrido_em, current_date);
  v_espera text;
  v_dependencia text;
begin
  perform public.f_prefeitura_admin();

  select * into v_op from public.prefeitura_oportunidades o
  where o.id = p_oportunidade_id for update;
  if v_op.id is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if v_op.status <> 'aberta' then
    raise exception 'Oportunidade encerrada não possui próximo passo.';
  end if;
  if btrim(coalesce(p_proximo_passo, '')) = '' then
    raise exception 'Informe o próximo passo.';
  end if;
  if p_prazo is null then
    raise exception 'Informe o prazo.';
  end if;
  if v_data < v_op.data_entrada then
    raise exception 'A atualização não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;
  if v_data < v_op.ultima_movimentacao then
    raise exception 'A atualização não pode ser anterior à última movimentação registrada (%).', v_op.ultima_movimentacao;
  end if;

  v_espera := public.f_prefeitura_espera(p_tipo_espera, p_dependencia_externa);
  v_dependencia := case when v_espera = 'externa'
                        then btrim(p_dependencia_externa) else null end;

  update public.prefeitura_oportunidades o
     set proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = v_espera,
         dependencia_externa = v_dependencia,
         ultima_movimentacao = v_data,
         observacao = coalesce(nullif(btrim(coalesce(p_observacao, '')), ''), o.observacao)
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    motivo, proximo_passo, prazo, tipo_espera, dependencia_externa, created_by
  )
  values (p_oportunidade_id, 'atualizacao_proximo_passo', v_op.etapa_atual, v_op.etapa_atual,
          v_data, nullif(btrim(coalesce(p_observacao, '')), ''), btrim(p_proximo_passo),
          p_prazo, v_espera, v_dependencia, auth.uid());
end;
$$;

-- Ganho: cronologia estrita e contrato NOVA vinculado à oportunidade.
create or replace function public.ganhar_oportunidade_prefeitura(
  p_oportunidade_id uuid,
  p_data_contrato date default current_date,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
  v_data date := coalesce(p_data_contrato, current_date);
  v_contrato uuid;
begin
  perform public.f_prefeitura_admin();

  select * into v_op from public.prefeitura_oportunidades o
  where o.id = p_oportunidade_id for update;
  if v_op.id is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if v_op.status <> 'aberta' then
    raise exception 'Oportunidade já encerrada.';
  end if;
  if v_op.etapa_atual <> 'negociacao' then
    raise exception 'O fechamento ocorre a partir da etapa NEGOCIAÇÃO.';
  end if;

  -- Serializa fechamentos da mesma prefeitura, inclusive quando partem de
  -- oportunidades diferentes, e revalida a aquisição no momento efetivo.
  perform 1
  from public.prefeituras p
  where p.id = v_op.prefeitura_id
  for update;

  if exists (
    select 1
    from public.prefeitura_contratos c
    where c.prefeitura_id = v_op.prefeitura_id
      and c.cancelado_em is null
  ) then
    raise exception 'A prefeitura já possui contrato válido e não pode ser contabilizada como nova aquisição.';
  end if;

  if v_data < v_op.data_entrada then
    raise exception 'A data do contrato não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;
  if v_data < v_op.ultima_movimentacao then
    raise exception 'O fechamento não pode ser anterior à última movimentação registrada (%).', v_op.ultima_movimentacao;
  end if;
  if exists (
    select 1 from public.prefeitura_contratos c
    where c.oportunidade_id = p_oportunidade_id
  ) then
    raise exception 'Esta oportunidade já originou um contrato.';
  end if;

  update public.prefeitura_oportunidades o
     set etapa_atual = 'contrato',
         etapa_desde = v_data,
         status = 'ganha',
         ultima_movimentacao = v_data,
         encerrada_em = v_data,
         proximo_passo = null,
         prazo = null,
         tipo_espera = null,
         dependencia_externa = null
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em, motivo,
    dependencia_externa, created_by
  )
  values (p_oportunidade_id, 'ganho', v_op.etapa_atual, 'contrato', v_data,
          nullif(btrim(coalesce(p_observacao, '')), ''), v_op.dependencia_externa, auth.uid());

  insert into public.prefeitura_contratos (
    prefeitura_id, oportunidade_id, tipo, data_contrato, origem, observacao, created_by
  )
  values (v_op.prefeitura_id, p_oportunidade_id, 'nova', v_data, 'registro_manual',
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_contrato;

  return v_contrato;
end;
$$;

create or replace function public.perder_oportunidade_prefeitura(
  p_oportunidade_id uuid,
  p_motivo text,
  p_ocorrido_em date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
  v_data date := coalesce(p_ocorrido_em, current_date);
begin
  perform public.f_prefeitura_admin();

  select * into v_op from public.prefeitura_oportunidades o
  where o.id = p_oportunidade_id for update;
  if v_op.id is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if v_op.status <> 'aberta' then
    raise exception 'Oportunidade já encerrada.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Perda exige motivo registrado.';
  end if;
  if v_data < v_op.data_entrada then
    raise exception 'A perda não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;
  if v_data < v_op.ultima_movimentacao then
    raise exception 'A perda não pode ser anterior à última movimentação registrada (%).', v_op.ultima_movimentacao;
  end if;

  update public.prefeitura_oportunidades o
     set status = 'perdida',
         motivo_perda = btrim(p_motivo),
         encerrada_em = v_data,
         ultima_movimentacao = v_data,
         proximo_passo = null,
         prazo = null,
         tipo_espera = null,
         dependencia_externa = null
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em, motivo,
    dependencia_externa, created_by
  )
  values (p_oportunidade_id, 'perda', v_op.etapa_atual, v_op.etapa_atual, v_data,
          btrim(p_motivo), v_op.dependencia_externa, auth.uid());
end;
$$;

drop function if exists public.reabrir_oportunidade_prefeitura(uuid, text, text, date, text, text, date);

create function public.reabrir_oportunidade_prefeitura(
  p_oportunidade_id uuid,
  p_motivo text,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text default null,
  p_dependencia_externa text default null,
  p_ocorrido_em date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
  v_data date := coalesce(p_ocorrido_em, current_date);
  v_etapa text;
  v_espera text;
  v_dependencia text;
begin
  perform public.f_prefeitura_admin();

  select * into v_op from public.prefeitura_oportunidades o
  where o.id = p_oportunidade_id for update;
  if v_op.id is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if v_op.status = 'aberta' then
    raise exception 'Oportunidade já está aberta.';
  end if;
  if v_op.status = 'ganha' then
    raise exception 'Oportunidade ganha gerou contrato e não é reaberta. Abra uma nova oportunidade.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Reabertura exige motivo registrado.';
  end if;
  if btrim(coalesce(p_proximo_passo, '')) = '' or p_prazo is null then
    raise exception 'Reabertura exige próximo passo e prazo.';
  end if;
  if v_data < v_op.data_entrada then
    raise exception 'A reabertura não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;
  if v_data < v_op.ultima_movimentacao then
    raise exception 'A reabertura não pode ser anterior à última movimentação registrada (%).', v_op.ultima_movimentacao;
  end if;

  v_espera := public.f_prefeitura_espera(p_tipo_espera, p_dependencia_externa);
  v_dependencia := case when v_espera = 'externa'
                        then btrim(p_dependencia_externa) else null end;

  if exists (
    select 1 from public.prefeitura_oportunidades o
    where o.prefeitura_id = v_op.prefeitura_id and o.status = 'aberta'
  ) then
    raise exception 'Esta prefeitura já possui uma oportunidade aberta.';
  end if;
  if exists (
    select 1 from public.prefeitura_contratos c
    where c.prefeitura_id = v_op.prefeitura_id and c.cancelado_em is null
  ) then
    raise exception 'Esta prefeitura já possui contrato válido: não pode voltar ao funil de nova aquisição.';
  end if;

  v_etapa := v_op.etapa_atual;

  update public.prefeitura_oportunidades o
     set status = 'aberta',
         encerrada_em = null,
         motivo_perda = null,
         etapa_desde = v_data,
         ultima_movimentacao = v_data,
         proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = v_espera,
         dependencia_externa = v_dependencia
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    motivo, proximo_passo, prazo, tipo_espera, dependencia_externa, created_by
  )
  values (p_oportunidade_id, 'reabertura', v_etapa, v_etapa, v_data,
          btrim(p_motivo), btrim(p_proximo_passo), p_prazo, v_espera, v_dependencia, auth.uid());
end;
$$;

-- =====================================================================
-- 8/9) Renovação válida
-- =====================================================================
create or replace function public.registrar_renovacao_prefeitura(
  p_prefeitura_id uuid,
  p_data_contrato date,
  p_contrato_anterior_id uuid default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_anterior public.prefeitura_contratos%rowtype;
begin
  perform public.f_prefeitura_admin();

  if not exists (select 1 from public.prefeituras p where p.id = p_prefeitura_id) then
    raise exception 'Prefeitura inexistente.';
  end if;
  if p_data_contrato is null then
    raise exception 'Informe a data do contrato.';
  end if;
  if p_contrato_anterior_id is null then
    raise exception 'A renovação exige o contrato anterior que está sendo renovado.';
  end if;

  select * into v_anterior from public.prefeitura_contratos c
  where c.id = p_contrato_anterior_id for update;
  if v_anterior.id is null then
    raise exception 'Contrato anterior inexistente.';
  end if;
  if v_anterior.prefeitura_id <> p_prefeitura_id then
    raise exception 'Contrato anterior não pertence a esta prefeitura.';
  end if;
  if v_anterior.cancelado_em is not null then
    raise exception 'Contrato anterior está cancelado e não pode ser renovado.';
  end if;
  if p_data_contrato <= v_anterior.data_contrato then
    raise exception 'A renovação deve ser posterior ao contrato anterior (%).', v_anterior.data_contrato;
  end if;
  if exists (
    select 1 from public.prefeitura_contratos c
    where c.contrato_anterior_id = p_contrato_anterior_id and c.cancelado_em is null
  ) then
    raise exception 'Este contrato já possui uma renovação válida registrada.';
  end if;

  insert into public.prefeitura_contratos (
    prefeitura_id, tipo, data_contrato, contrato_anterior_id, origem, observacao, created_by
  )
  values (p_prefeitura_id, 'renovacao', p_data_contrato, p_contrato_anterior_id,
          'registro_manual', nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- =====================================================================
-- 5) View de movimentos com dependência externa histórica
-- =====================================================================
-- Nova coluna no meio da lista: recriação exige drop (create or replace não renomeia colunas).
drop view if exists public.v_prefeitura_movimentos;
create view public.v_prefeitura_movimentos
with (security_invoker = on) as
select
  m.id,
  m.oportunidade_id,
  o.prefeitura_id,
  p.nome as prefeitura_nome,
  m.tipo,
  m.etapa_anterior,
  m.etapa_nova,
  m.ocorrido_em,
  m.motivo,
  m.proximo_passo,
  m.prazo,
  m.tipo_espera,
  m.dependencia_externa,
  m.created_at
from public.prefeitura_movimentos m
join public.prefeitura_oportunidades o on o.id = m.oportunidade_id
join public.prefeituras p on p.id = o.prefeitura_id;

grant select on public.v_prefeitura_movimentos to authenticated, service_role;
revoke all on public.v_prefeitura_movimentos from anon;

-- =====================================================================
-- 11/14) Escrita direta × RPC — menor privilégio
--   Interações: só por registrar_interacao_prefeitura().
--   Contatos: a interface atual apenas cadastra (RPC); UPDATE direto é revogado.
-- =====================================================================
revoke insert on public.prefeitura_interacoes from authenticated;
drop policy if exists "prefeitura_interacoes_insert_admin" on public.prefeitura_interacoes;

-- Contatos: criação somente por registrar_contato_prefeitura();
-- escrita direta (INSERT/UPDATE) revogada. SELECT permanece.
revoke insert, update on public.prefeitura_contatos from authenticated;
drop policy if exists "prefeitura_contatos_insert_admin" on public.prefeitura_contatos;
drop policy if exists "prefeitura_contatos_update_admin" on public.prefeitura_contatos;

revoke all on public.prefeituras from anon;
revoke all on public.prefeitura_contatos from anon;
revoke all on public.prefeitura_oportunidades from anon;
revoke all on public.prefeitura_movimentos from anon;
revoke all on public.prefeitura_interacoes from anon;
revoke all on public.prefeitura_contratos from anon;
revoke all on public.prefeitura_metas from anon;

revoke all on function public.f_prefeitura_supervisor() from public, anon, authenticated;
revoke all on function public.f_prefeitura_oportunidade_responsavel() from public, anon, authenticated;
revoke all on function public.f_prefeitura_espera(text, text) from public, anon, authenticated;

revoke all on function public.abrir_oportunidade_prefeitura(uuid, text, date, text, text, date, text) from public, anon;
revoke all on function public.mover_etapa_prefeitura(uuid, text, text, date, text, text, text, date) from public, anon;
revoke all on function public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, date, text) from public, anon;
revoke all on function public.ganhar_oportunidade_prefeitura(uuid, date, text) from public, anon;
revoke all on function public.perder_oportunidade_prefeitura(uuid, text, date) from public, anon;
revoke all on function public.reabrir_oportunidade_prefeitura(uuid, text, text, date, text, text, date) from public, anon;
revoke all on function public.registrar_renovacao_prefeitura(uuid, date, uuid, text) from public, anon;

grant execute on function public.abrir_oportunidade_prefeitura(uuid, text, date, text, text, date, text) to authenticated;
grant execute on function public.mover_etapa_prefeitura(uuid, text, text, date, text, text, text, date) to authenticated;
grant execute on function public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, date, text) to authenticated;
grant execute on function public.ganhar_oportunidade_prefeitura(uuid, date, text) to authenticated;
grant execute on function public.perder_oportunidade_prefeitura(uuid, text, date) to authenticated;
grant execute on function public.reabrir_oportunidade_prefeitura(uuid, text, text, date, text, text, date) to authenticated;
grant execute on function public.registrar_renovacao_prefeitura(uuid, date, uuid, text) to authenticated;

-- =====================================================================
-- 12) Metas da frente Prefeituras — encaixe cronológico exato
--   * meta anterior termina em nova.vigencia_inicio - 1;
--   * havendo meta posterior, a nova termina em proxima.vigencia_inicio - 1;
--   * sem meta posterior, a nova fica vigente (vigencia_fim nulo);
--   * inserção retroativa/intermediária não cria lacuna nem sobreposição;
--   * histórico preservado (nenhuma linha apagada);
--   * mesmo indicador + mesma data inicial continua proibido;
--   * advisory lock por indicador mantido.
-- Não altera public.metas (Representantes).
-- =====================================================================
create or replace function public.f_prefeitura_metas_encaixe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proxima date;
begin
  perform pg_advisory_xact_lock(hashtextextended('prefeitura_meta:' || new.indicador, 0));

  if exists (
    select 1 from public.prefeitura_metas m
    where m.indicador = new.indicador
      and m.id <> new.id
      and m.vigencia_inicio = new.vigencia_inicio
  ) then
    raise exception 'Já existe meta deste indicador iniciando em %.', new.vigencia_inicio;
  end if;

  -- Meta imediatamente anterior encerra na véspera da nova (sem lacuna, sem sobreposição).
  update public.prefeitura_metas m
     set vigencia_fim = new.vigencia_inicio - 1
   where m.indicador = new.indicador
     and m.id <> new.id
     and m.vigencia_inicio < new.vigencia_inicio
     and m.vigencia_inicio = (
       select max(a.vigencia_inicio)
       from public.prefeitura_metas a
       where a.indicador = new.indicador
         and a.id <> new.id
         and a.vigencia_inicio < new.vigencia_inicio
     );

  -- Metas anteriores mais antigas nunca podem invadir a nova vigência.
  update public.prefeitura_metas m
     set vigencia_fim = new.vigencia_inicio - 1
   where m.indicador = new.indicador
     and m.id <> new.id
     and m.vigencia_inicio < new.vigencia_inicio
     and (m.vigencia_fim is null or m.vigencia_fim >= new.vigencia_inicio);

  select min(m.vigencia_inicio) into v_proxima
  from public.prefeitura_metas m
  where m.indicador = new.indicador
    and m.id <> new.id
    and m.vigencia_inicio > new.vigencia_inicio;

  if v_proxima is null then
    new.vigencia_fim := null;
  else
    new.vigencia_fim := v_proxima - 1;
    if new.vigencia_fim < new.vigencia_inicio then
      raise exception 'Já existe meta iniciando em % para este indicador.', v_proxima;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_prefeitura_meta_created on public.prefeitura_metas;
create trigger on_prefeitura_meta_created
  before insert on public.prefeitura_metas
  for each row execute function public.f_prefeitura_metas_encaixe();

-- =====================================================================
-- 13) Validação das CHECK constraints criadas como NOT VALID.
--     O preflight já certificou os dados existentes: validar é seguro.
-- =====================================================================
alter table public.prefeitura_oportunidades
  validate constraint oportunidade_dependencia_somente_externa;
alter table public.prefeitura_contratos
  validate constraint contrato_nova_coerente;
alter table public.prefeitura_contratos
  validate constraint contrato_renovacao_coerente;
