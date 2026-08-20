-- Painel de Gestão DS3 — Fase 4
-- Frente Prefeituras (responsável operacional: Clênio).
-- Incremental e idempotente. NÃO altera 0001 nem 0002.
--
-- Princípios estruturais (mesmos já validados nas fases anteriores):
--   * Fato histórico nunca é apagado nem reescrito (contratos, movimentações, interações).
--   * Etapa atual é leitura rápida; a verdade cronológica é o histórico de movimentações.
--   * Reativação/retrocesso é rastreável, nunca silencioso.
--   * Ausência de dado é ausência (NULL), nunca zero.
--   * Escrita sensível só por função SECURITY DEFINER com verificação de ADMIN.
--   * Prefeituras NÃO compartilha metas, produção nem pipeline com Representantes.

create extension if not exists btree_gist;

-- =====================================================================
-- 0) Domínio do funil — ordem controlada no banco
--    PROSPECÇÃO → CONTATO → DIAGNÓSTICO → DECISOR → APRESENTAÇÃO →
--    INTERESSE → PROCESSO INSTITUCIONAL → NEGOCIAÇÃO → CONTRATO
--    "Proposta" NÃO é etapa: é interação comercial.
-- =====================================================================
create or replace function public.f_prefeitura_etapa_ordem(p_etapa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
    when 'prospeccao' then 1
    when 'contato' then 2
    when 'diagnostico' then 3
    when 'decisor' then 4
    when 'apresentacao' then 5
    when 'interesse' then 6
    when 'processo_institucional' then 7
    when 'negociacao' then 8
    when 'contrato' then 9
    else null
  end;
$$;

-- =====================================================================
-- 1) Prefeituras
-- =====================================================================
create table if not exists public.prefeituras (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Duplicidade evidente: mesma prefeitura na mesma UF. Mesmo nome em UF
-- diferente é permitido (municípios homônimos existem).
create unique index if not exists prefeituras_nome_uf_unico
  on public.prefeituras (lower(btrim(nome)), uf);

create index if not exists prefeituras_uf_idx on public.prefeituras (uf, nome);

grant select on public.prefeituras to authenticated;
grant all on public.prefeituras to service_role;

alter table public.prefeituras enable row level security;

drop policy if exists "prefeituras_select_admin" on public.prefeituras;
create policy "prefeituras_select_admin"
  on public.prefeituras for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 2) Contatos / decisores da prefeitura
-- =====================================================================
create table if not exists public.prefeitura_contatos (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references public.prefeituras(id) on delete restrict,
  nome text not null check (btrim(nome) <> ''),
  funcao text,
  decisor boolean not null default false,
  contato text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists prefeitura_contatos_prefeitura_idx
  on public.prefeitura_contatos (prefeitura_id, decisor desc, nome);

grant select, insert, update on public.prefeitura_contatos to authenticated;
grant all on public.prefeitura_contatos to service_role;

alter table public.prefeitura_contatos enable row level security;

drop policy if exists "prefeitura_contatos_select_admin" on public.prefeitura_contatos;
drop policy if exists "prefeitura_contatos_insert_admin" on public.prefeitura_contatos;
drop policy if exists "prefeitura_contatos_update_admin" on public.prefeitura_contatos;
create policy "prefeitura_contatos_select_admin"
  on public.prefeitura_contatos for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "prefeitura_contatos_insert_admin"
  on public.prefeitura_contatos for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());
create policy "prefeitura_contatos_update_admin"
  on public.prefeitura_contatos for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 3) Oportunidades (aquisição de nova prefeitura)
--    Etapa e status são conceitos distintos.
--    Aberta exige: próximo passo + responsável + prazo + tipo de espera.
-- =====================================================================
create table if not exists public.prefeitura_oportunidades (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references public.prefeituras(id) on delete restrict,
  etapa_atual text not null default 'prospeccao'
    check (public.f_prefeitura_etapa_ordem(etapa_atual) is not null),
  status text not null default 'aberta' check (status in ('aberta', 'ganha', 'perdida')),
  responsavel_supervisor_id uuid not null references public.supervisores(id) on delete restrict,
  data_entrada date not null default current_date,
  ultima_movimentacao date not null default current_date,
  etapa_desde date not null default current_date,
  proximo_passo text,
  prazo date,
  tipo_espera text check (tipo_espera in ('interna', 'externa')),
  dependencia_externa text,
  observacao text,
  motivo_perda text,
  encerrada_em date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  -- Oportunidade aberta sem próximo movimento válido é inválida no banco.
  constraint oportunidade_aberta_proximo_movimento check (
    status <> 'aberta'
    or (
      btrim(coalesce(proximo_passo, '')) <> ''
      and prazo is not null
      and tipo_espera is not null
    )
  ),
  -- Espera externa exige a dependência registrada (e ainda assim prazo/verificação).
  constraint oportunidade_dependencia_externa check (
    tipo_espera is distinct from 'externa'
    or btrim(coalesce(dependencia_externa, '')) <> ''
  ),
  constraint oportunidade_perda_com_motivo check (
    status <> 'perdida' or btrim(coalesce(motivo_perda, '')) <> ''
  ),
  -- Ganha corresponde ao fechamento em CONTRATO.
  constraint oportunidade_ganha_em_contrato check (
    status <> 'ganha' or etapa_atual = 'contrato'
  ),
  constraint oportunidade_encerramento_coerente check (
    (status = 'aberta' and encerrada_em is null)
    or (status <> 'aberta' and encerrada_em is not null)
  ),
  constraint oportunidade_datas_coerentes check (
    ultima_movimentacao >= data_entrada and etapa_desde >= data_entrada
  )
);

-- Uma única oportunidade ABERTA por prefeitura (novas no futuro são permitidas).
create unique index if not exists prefeitura_oportunidades_uma_aberta
  on public.prefeitura_oportunidades (prefeitura_id)
  where status = 'aberta';

create index if not exists prefeitura_oportunidades_status_idx
  on public.prefeitura_oportunidades (status, prazo);
create index if not exists prefeitura_oportunidades_etapa_idx
  on public.prefeitura_oportunidades (etapa_atual, status);
create index if not exists prefeitura_oportunidades_prefeitura_idx
  on public.prefeitura_oportunidades (prefeitura_id, data_entrada desc);

grant select on public.prefeitura_oportunidades to authenticated;
grant all on public.prefeitura_oportunidades to service_role;

alter table public.prefeitura_oportunidades enable row level security;

drop policy if exists "prefeitura_oportunidades_select_admin" on public.prefeitura_oportunidades;
create policy "prefeitura_oportunidades_select_admin"
  on public.prefeitura_oportunidades for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 4) Histórico de movimentações (append-only)
-- =====================================================================
create table if not exists public.prefeitura_movimentos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null
    references public.prefeitura_oportunidades(id) on delete restrict,
  tipo text not null check (
    tipo in ('abertura', 'avanco', 'retrocesso', 'ganho', 'perda', 'reabertura')
  ),
  etapa_anterior text check (
    etapa_anterior is null or public.f_prefeitura_etapa_ordem(etapa_anterior) is not null
  ),
  etapa_nova text not null check (public.f_prefeitura_etapa_ordem(etapa_nova) is not null),
  ocorrido_em date not null default current_date,
  motivo text,
  proximo_passo text,
  prazo date,
  tipo_espera text check (tipo_espera in ('interna', 'externa')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists prefeitura_movimentos_oportunidade_idx
  on public.prefeitura_movimentos (oportunidade_id, ocorrido_em desc, created_at desc);
create index if not exists prefeitura_movimentos_etapa_idx
  on public.prefeitura_movimentos (etapa_nova, ocorrido_em);

grant select on public.prefeitura_movimentos to authenticated;
grant all on public.prefeitura_movimentos to service_role;

alter table public.prefeitura_movimentos enable row level security;

drop policy if exists "prefeitura_movimentos_select_admin" on public.prefeitura_movimentos;
create policy "prefeitura_movimentos_select_admin"
  on public.prefeitura_movimentos for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Histórico nunca é reescrito nem apagado.
create or replace function public.f_prefeitura_movimentos_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Histórico de movimentação é imutável: não pode ser alterado nem excluído.';
end;
$$;

drop trigger if exists on_prefeitura_movimento_imutavel on public.prefeitura_movimentos;
create trigger on_prefeitura_movimento_imutavel
  before update or delete on public.prefeitura_movimentos
  for each row execute function public.f_prefeitura_movimentos_imutavel();

-- =====================================================================
-- 5) Interações relevantes (não duplicam o funil)
-- =====================================================================
create table if not exists public.prefeitura_interacoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null
    references public.prefeitura_oportunidades(id) on delete restrict,
  tipo text not null check (tipo in ('contato', 'reuniao', 'proposta', 'follow_up', 'observacao')),
  ocorrido_em date not null default current_date,
  descricao text not null check (btrim(descricao) <> ''),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists prefeitura_interacoes_oportunidade_idx
  on public.prefeitura_interacoes (oportunidade_id, ocorrido_em desc);
create index if not exists prefeitura_interacoes_tipo_idx
  on public.prefeitura_interacoes (tipo, ocorrido_em);

grant select, insert on public.prefeitura_interacoes to authenticated;
grant all on public.prefeitura_interacoes to service_role;

alter table public.prefeitura_interacoes enable row level security;

drop policy if exists "prefeitura_interacoes_select_admin" on public.prefeitura_interacoes;
drop policy if exists "prefeitura_interacoes_insert_admin" on public.prefeitura_interacoes;
create policy "prefeitura_interacoes_select_admin"
  on public.prefeitura_interacoes for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "prefeitura_interacoes_insert_admin"
  on public.prefeitura_interacoes for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());

create or replace function public.f_prefeitura_interacoes_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Interação registrada é fato histórico: não pode ser alterada nem excluída.';
end;
$$;

drop trigger if exists on_prefeitura_interacao_imutavel on public.prefeitura_interacoes;
create trigger on_prefeitura_interacao_imutavel
  before update or delete on public.prefeitura_interacoes
  for each row execute function public.f_prefeitura_interacoes_imutavel();

-- =====================================================================
-- 6) Contratos da frente Prefeituras (nova ou renovação)
--    Fato comercial: sem DELETE, sem edição livre; correção = cancelamento.
-- =====================================================================
create table if not exists public.prefeitura_contratos (
  id uuid primary key default gen_random_uuid(),
  prefeitura_id uuid not null references public.prefeituras(id) on delete restrict,
  oportunidade_id uuid references public.prefeitura_oportunidades(id) on delete restrict,
  tipo text not null check (tipo in ('nova', 'renovacao')),
  data_contrato date not null,
  contrato_anterior_id uuid references public.prefeitura_contratos(id) on delete restrict,
  origem text not null default 'registro_manual'
    check (origem in ('registro_manual', 'importacao_excel')),
  observacao text,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint contrato_anterior_apenas_renovacao check (
    contrato_anterior_id is null or tipo = 'renovacao'
  ),
  constraint contrato_nao_referencia_a_si check (
    contrato_anterior_id is null or contrato_anterior_id <> id
  ),
  constraint contrato_cancelamento_completo check (
    (cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
    or (cancelado_em is not null and btrim(coalesce(motivo_cancelamento, '')) <> '')
  )
);

create index if not exists prefeitura_contratos_prefeitura_idx
  on public.prefeitura_contratos (prefeitura_id, data_contrato desc);
create index if not exists prefeitura_contratos_tipo_data_idx
  on public.prefeitura_contratos (tipo, data_contrato);

grant select on public.prefeitura_contratos to authenticated;
grant all on public.prefeitura_contratos to service_role;

alter table public.prefeitura_contratos enable row level security;

drop policy if exists "prefeitura_contratos_select_admin" on public.prefeitura_contratos;
create policy "prefeitura_contratos_select_admin"
  on public.prefeitura_contratos for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.f_prefeitura_contratos_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contrato não pode ser excluído. Use o cancelamento rastreável.';
  end if;

  if new.id is distinct from old.id
     or new.prefeitura_id is distinct from old.prefeitura_id
     or new.oportunidade_id is distinct from old.oportunidade_id
     or new.tipo is distinct from old.tipo
     or new.data_contrato is distinct from old.data_contrato
     or new.contrato_anterior_id is distinct from old.contrato_anterior_id
     or new.origem is distinct from old.origem
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Contrato é fato histórico: prefeitura, tipo, data, origem e autoria não podem ser alterados.';
  end if;

  if old.cancelado_em is not null
     and (new.cancelado_em is distinct from old.cancelado_em
          or new.cancelado_por is distinct from old.cancelado_por
          or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Cancelamento já registrado não pode ser alterado nem estornado.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_prefeitura_contrato_imutavel on public.prefeitura_contratos;
create trigger on_prefeitura_contrato_imutavel
  before update or delete on public.prefeitura_contratos
  for each row execute function public.f_prefeitura_contratos_imutavel();

-- =====================================================================
-- 7) Metas próprias da frente Prefeituras (não tocam public.metas)
-- =====================================================================
create table if not exists public.prefeitura_metas (
  id uuid primary key default gen_random_uuid(),
  indicador text not null
    check (indicador in ('novas_prefeituras_mes', 'renovacoes_prefeituras_mes')),
  valor integer not null check (valor > 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint prefeitura_metas_vigencia_valida
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint prefeitura_metas_inicio_unico unique (indicador, vigencia_inicio)
);

create index if not exists prefeitura_metas_indicador_idx
  on public.prefeitura_metas (indicador, vigencia_inicio desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prefeitura_metas_sem_sobreposicao'
  ) then
    alter table public.prefeitura_metas
      add constraint prefeitura_metas_sem_sobreposicao
      exclude using gist (
        indicador with =,
        daterange(vigencia_inicio, coalesce(vigencia_fim + 1, 'infinity'::date), '[)') with &&
      );
  end if;
end;
$$;

grant select, insert on public.prefeitura_metas to authenticated;
grant all on public.prefeitura_metas to service_role;

alter table public.prefeitura_metas enable row level security;

drop policy if exists "prefeitura_metas_select_admin" on public.prefeitura_metas;
drop policy if exists "prefeitura_metas_insert_admin" on public.prefeitura_metas;
create policy "prefeitura_metas_select_admin"
  on public.prefeitura_metas for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "prefeitura_metas_insert_admin"
  on public.prefeitura_metas for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());

-- Encaixe cronológico (inclusive inserção retroativa), sem sobreposição.
create or replace function public.f_prefeitura_metas_encaixe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proxima date;
begin
  perform pg_advisory_xact_lock(hashtextextended('prefeitura_meta:' || new.indicador, 0));

  update public.prefeitura_metas m
     set vigencia_fim = new.vigencia_inicio - 1
   where m.indicador = new.indicador
     and m.id <> new.id
     and m.vigencia_inicio < new.vigencia_inicio
     and (m.vigencia_fim is null or m.vigencia_fim >= new.vigencia_inicio);

  select min(m.vigencia_inicio) into proxima
  from public.prefeitura_metas m
  where m.indicador = new.indicador
    and m.id <> new.id
    and m.vigencia_inicio > new.vigencia_inicio;

  if proxima is not null then
    new.vigencia_fim := least(coalesce(new.vigencia_fim, proxima - 1), proxima - 1);
    if new.vigencia_fim < new.vigencia_inicio then
      raise exception 'Já existe meta iniciando em % para este indicador.', proxima;
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
-- 8) Escrita controlada (RPCs)
-- =====================================================================
create or replace function public.f_prefeitura_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
end;
$$;

create or replace function public.criar_prefeitura(
  p_nome text,
  p_uf text,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.f_prefeitura_admin();
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome da prefeitura.';
  end if;
  if upper(btrim(coalesce(p_uf, ''))) !~ '^[A-Z]{2}$' then
    raise exception 'Informe a UF com duas letras.';
  end if;

  insert into public.prefeituras (nome, uf, observacao, created_by)
  values (btrim(p_nome), upper(btrim(p_uf)),
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.abrir_oportunidade_prefeitura(
  p_prefeitura_id uuid,
  p_responsavel_supervisor_id uuid,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text,
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
begin
  perform public.f_prefeitura_admin();

  if not exists (select 1 from public.prefeituras p where p.id = p_prefeitura_id) then
    raise exception 'Prefeitura inexistente.';
  end if;
  if not exists (select 1 from public.supervisores s where s.id = p_responsavel_supervisor_id) then
    raise exception 'Responsável operacional inexistente.';
  end if;
  if btrim(coalesce(p_proximo_passo, '')) = '' then
    raise exception 'Oportunidade aberta exige próximo passo.';
  end if;
  if p_prazo is null then
    raise exception 'Oportunidade aberta exige prazo.';
  end if;
  if p_tipo_espera not in ('interna', 'externa') then
    raise exception 'Informe se a espera é interna ou externa.';
  end if;
  if p_tipo_espera = 'externa' and btrim(coalesce(p_dependencia_externa, '')) = '' then
    raise exception 'Espera externa exige o registro da dependência.';
  end if;
  if exists (
    select 1 from public.prefeitura_oportunidades o
    where o.prefeitura_id = p_prefeitura_id and o.status = 'aberta'
  ) then
    raise exception 'Esta prefeitura já possui uma oportunidade aberta.';
  end if;

  insert into public.prefeitura_oportunidades (
    prefeitura_id, etapa_atual, status, responsavel_supervisor_id,
    data_entrada, ultima_movimentacao, etapa_desde,
    proximo_passo, prazo, tipo_espera, dependencia_externa, observacao, created_by
  )
  values (
    p_prefeitura_id, 'prospeccao', 'aberta', p_responsavel_supervisor_id,
    v_data, v_data, v_data,
    btrim(p_proximo_passo), p_prazo, p_tipo_espera,
    nullif(btrim(coalesce(p_dependencia_externa, '')), ''),
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid()
  )
  returning id into v_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    proximo_passo, prazo, tipo_espera, created_by
  )
  values (v_id, 'abertura', null, 'prospeccao', v_data,
          btrim(p_proximo_passo), p_prazo, p_tipo_espera, auth.uid());

  return v_id;
end;
$$;

-- Avanço/retrocesso de etapa. Avanço apenas para a etapa imediatamente
-- seguinte; retrocesso é permitido, rastreável e exige motivo.
-- A etapa CONTRATO só é atingida por ganhar_oportunidade_prefeitura.
create or replace function public.mover_etapa_prefeitura(
  p_oportunidade_id uuid,
  p_etapa_nova text,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text,
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
  if p_tipo_espera not in ('interna', 'externa') then
    raise exception 'Informe se a espera é interna ou externa.';
  end if;
  if p_tipo_espera = 'externa' and btrim(coalesce(p_dependencia_externa, '')) = '' then
    raise exception 'Espera externa exige o registro da dependência.';
  end if;

  -- Etapa DECISOR exige ao menos um decisor identificado na prefeitura.
  if p_etapa_nova = 'decisor' and not exists (
    select 1 from public.prefeitura_contatos c
    where c.prefeitura_id = v_op.prefeitura_id and c.decisor and c.ativo
  ) then
    raise exception 'Registre ao menos um decisor da prefeitura antes desta etapa.';
  end if;

  update public.prefeitura_oportunidades o
     set etapa_atual = p_etapa_nova,
         etapa_desde = v_data,
         ultima_movimentacao = greatest(v_data, o.ultima_movimentacao),
         proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = p_tipo_espera,
         dependencia_externa = nullif(btrim(coalesce(p_dependencia_externa, '')), '')
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    motivo, proximo_passo, prazo, tipo_espera, created_by
  )
  values (p_oportunidade_id, v_tipo, v_op.etapa_atual, p_etapa_nova, v_data,
          nullif(btrim(coalesce(p_motivo, '')), ''), btrim(p_proximo_passo),
          p_prazo, p_tipo_espera, auth.uid());
end;
$$;

-- Atualização do próximo movimento sem mudança de etapa (não gera movimentação).
create or replace function public.definir_proximo_passo_prefeitura(
  p_oportunidade_id uuid,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text,
  p_dependencia_externa text default null,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.prefeitura_oportunidades%rowtype;
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
  if p_tipo_espera not in ('interna', 'externa') then
    raise exception 'Informe se a espera é interna ou externa.';
  end if;
  if p_tipo_espera = 'externa' and btrim(coalesce(p_dependencia_externa, '')) = '' then
    raise exception 'Espera externa exige o registro da dependência.';
  end if;

  update public.prefeitura_oportunidades o
     set proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = p_tipo_espera,
         dependencia_externa = nullif(btrim(coalesce(p_dependencia_externa, '')), ''),
         observacao = coalesce(nullif(btrim(coalesce(p_observacao, '')), ''), o.observacao)
   where o.id = p_oportunidade_id;
end;
$$;

-- Fechamento: etapa CONTRATO + status ganha + contrato do tipo NOVA, atômico.
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
  if v_data < v_op.data_entrada then
    raise exception 'A data do contrato não pode ser anterior à entrada da oportunidade (%).', v_op.data_entrada;
  end if;

  update public.prefeitura_oportunidades o
     set etapa_atual = 'contrato',
         etapa_desde = v_data,
         status = 'ganha',
         ultima_movimentacao = greatest(v_data, o.ultima_movimentacao),
         encerrada_em = v_data,
         proximo_passo = null,
         prazo = null,
         tipo_espera = null,
         dependencia_externa = null
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em, motivo, created_by
  )
  values (p_oportunidade_id, 'ganho', v_op.etapa_atual, 'contrato', v_data,
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid());

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

  update public.prefeitura_oportunidades o
     set status = 'perdida',
         motivo_perda = btrim(p_motivo),
         encerrada_em = v_data,
         ultima_movimentacao = greatest(v_data, o.ultima_movimentacao),
         proximo_passo = null,
         prazo = null,
         tipo_espera = null,
         dependencia_externa = null
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em, motivo, created_by
  )
  values (p_oportunidade_id, 'perda', v_op.etapa_atual, v_op.etapa_atual, v_data,
          btrim(p_motivo), auth.uid());
end;
$$;

-- Reabertura rastreável: preserva todo o histórico anterior.
create or replace function public.reabrir_oportunidade_prefeitura(
  p_oportunidade_id uuid,
  p_motivo text,
  p_proximo_passo text,
  p_prazo date,
  p_tipo_espera text,
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
  if p_tipo_espera not in ('interna', 'externa') then
    raise exception 'Informe se a espera é interna ou externa.';
  end if;
  if p_tipo_espera = 'externa' and btrim(coalesce(p_dependencia_externa, '')) = '' then
    raise exception 'Espera externa exige o registro da dependência.';
  end if;
  if exists (
    select 1 from public.prefeitura_oportunidades o
    where o.prefeitura_id = v_op.prefeitura_id and o.status = 'aberta'
  ) then
    raise exception 'Esta prefeitura já possui uma oportunidade aberta.';
  end if;

  v_etapa := v_op.etapa_atual;

  update public.prefeitura_oportunidades o
     set status = 'aberta',
         encerrada_em = null,
         motivo_perda = null,
         etapa_desde = v_data,
         ultima_movimentacao = greatest(v_data, o.ultima_movimentacao),
         proximo_passo = btrim(p_proximo_passo),
         prazo = p_prazo,
         tipo_espera = p_tipo_espera,
         dependencia_externa = nullif(btrim(coalesce(p_dependencia_externa, '')), '')
   where o.id = p_oportunidade_id;

  insert into public.prefeitura_movimentos (
    oportunidade_id, tipo, etapa_anterior, etapa_nova, ocorrido_em,
    motivo, proximo_passo, prazo, tipo_espera, created_by
  )
  values (p_oportunidade_id, 'reabertura', v_etapa, v_etapa, v_data,
          btrim(p_motivo), btrim(p_proximo_passo), p_prazo, p_tipo_espera, auth.uid());
end;
$$;

-- Renovação: fato comercial registrado, sem funil próprio nesta fase.
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
begin
  perform public.f_prefeitura_admin();

  if not exists (select 1 from public.prefeituras p where p.id = p_prefeitura_id) then
    raise exception 'Prefeitura inexistente.';
  end if;
  if p_data_contrato is null then
    raise exception 'Informe a data do contrato.';
  end if;
  if p_contrato_anterior_id is not null and not exists (
    select 1 from public.prefeitura_contratos c
    where c.id = p_contrato_anterior_id and c.prefeitura_id = p_prefeitura_id
  ) then
    raise exception 'Contrato anterior não pertence a esta prefeitura.';
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

create or replace function public.cancelar_contrato_prefeitura(
  p_contrato_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.f_prefeitura_admin();
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  update public.prefeitura_contratos c
     set cancelado_em = now(),
         cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where c.id = p_contrato_id
     and c.cancelado_em is null;

  if not found then
    raise exception 'Contrato inexistente ou já cancelado.';
  end if;
end;
$$;

create or replace function public.registrar_contato_prefeitura(
  p_prefeitura_id uuid,
  p_nome text,
  p_funcao text default null,
  p_decisor boolean default false,
  p_contato text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.f_prefeitura_admin();
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do contato.';
  end if;
  if not exists (select 1 from public.prefeituras p where p.id = p_prefeitura_id) then
    raise exception 'Prefeitura inexistente.';
  end if;

  insert into public.prefeitura_contatos
    (prefeitura_id, nome, funcao, decisor, contato, observacao, created_by)
  values (p_prefeitura_id, btrim(p_nome),
          nullif(btrim(coalesce(p_funcao, '')), ''), coalesce(p_decisor, false),
          nullif(btrim(coalesce(p_contato, '')), ''),
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.registrar_interacao_prefeitura(
  p_oportunidade_id uuid,
  p_tipo text,
  p_descricao text,
  p_ocorrido_em date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_entrada date;
begin
  perform public.f_prefeitura_admin();
  if p_tipo not in ('contato', 'reuniao', 'proposta', 'follow_up', 'observacao') then
    raise exception 'Tipo de interação inválido.';
  end if;
  if btrim(coalesce(p_descricao, '')) = '' then
    raise exception 'Descreva a interação.';
  end if;

  select o.data_entrada into v_entrada
  from public.prefeitura_oportunidades o where o.id = p_oportunidade_id;
  if v_entrada is null then
    raise exception 'Oportunidade inexistente.';
  end if;
  if coalesce(p_ocorrido_em, current_date) < v_entrada then
    raise exception 'A interação não pode ser anterior à entrada da oportunidade (%).', v_entrada;
  end if;

  insert into public.prefeitura_interacoes
    (oportunidade_id, tipo, ocorrido_em, descricao, created_by)
  values (p_oportunidade_id, p_tipo, coalesce(p_ocorrido_em, current_date),
          btrim(p_descricao), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- =====================================================================
-- 9) Views de leitura (security_invoker) — evitam N+1 no frontend
-- =====================================================================
create or replace view public.v_prefeitura_oportunidades
with (security_invoker = on) as
select
  o.id,
  o.prefeitura_id,
  p.nome as prefeitura_nome,
  p.uf,
  o.etapa_atual,
  o.status,
  o.responsavel_supervisor_id,
  s.nome as responsavel_nome,
  o.data_entrada,
  o.ultima_movimentacao,
  o.etapa_desde,
  o.proximo_passo,
  o.prazo,
  o.tipo_espera,
  o.dependencia_externa,
  o.observacao,
  o.motivo_perda,
  o.encerrada_em,
  (select count(*) from public.prefeitura_contatos c
    where c.prefeitura_id = o.prefeitura_id and c.decisor and c.ativo) as decisores_identificados
from public.prefeitura_oportunidades o
join public.prefeituras p on p.id = o.prefeitura_id
join public.supervisores s on s.id = o.responsavel_supervisor_id;

-- Contratos válidos (não cancelados) da frente.
create or replace view public.v_prefeitura_contratos_validos
with (security_invoker = on) as
select
  c.id,
  c.prefeitura_id,
  p.nome as prefeitura_nome,
  p.uf,
  c.oportunidade_id,
  c.tipo,
  c.data_contrato,
  c.contrato_anterior_id,
  c.origem,
  c.observacao
from public.prefeitura_contratos c
join public.prefeituras p on p.id = c.prefeitura_id
where c.cancelado_em is null;

-- Movimentações com nome da prefeitura (base dos indicadores de funil).
create or replace view public.v_prefeitura_movimentos
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
  m.created_at
from public.prefeitura_movimentos m
join public.prefeitura_oportunidades o on o.id = m.oportunidade_id
join public.prefeituras p on p.id = o.prefeitura_id;

grant select on public.v_prefeitura_oportunidades to authenticated, service_role;
grant select on public.v_prefeitura_contratos_validos to authenticated, service_role;
grant select on public.v_prefeitura_movimentos to authenticated, service_role;

-- =====================================================================
-- 10) Permissões — menor privilégio explícito
-- =====================================================================
revoke all on public.prefeituras from anon;
revoke all on public.prefeitura_contatos from anon;
revoke all on public.prefeitura_oportunidades from anon;
revoke all on public.prefeitura_movimentos from anon;
revoke all on public.prefeitura_interacoes from anon;
revoke all on public.prefeitura_contratos from anon;
revoke all on public.prefeitura_metas from anon;
revoke all on public.v_prefeitura_oportunidades from anon;
revoke all on public.v_prefeitura_contratos_validos from anon;
revoke all on public.v_prefeitura_movimentos from anon;

revoke insert, update, delete, truncate on public.prefeituras from authenticated;
revoke delete, truncate on public.prefeitura_contatos from authenticated;
revoke insert, update, delete, truncate on public.prefeitura_oportunidades from authenticated;
revoke insert, update, delete, truncate on public.prefeitura_movimentos from authenticated;
revoke update, delete, truncate on public.prefeitura_interacoes from authenticated;
revoke insert, update, delete, truncate on public.prefeitura_contratos from authenticated;
revoke update, delete, truncate on public.prefeitura_metas from authenticated;

revoke all on function public.f_prefeitura_admin() from public, anon, authenticated;
revoke all on function public.f_prefeitura_movimentos_imutavel() from public, anon, authenticated;
revoke all on function public.f_prefeitura_interacoes_imutavel() from public, anon, authenticated;
revoke all on function public.f_prefeitura_contratos_imutavel() from public, anon, authenticated;
revoke all on function public.f_prefeitura_metas_encaixe() from public, anon, authenticated;
revoke all on function public.f_prefeitura_etapa_ordem(text) from public, anon;
revoke all on function public.criar_prefeitura(text, text, text) from public, anon;
revoke all on function public.abrir_oportunidade_prefeitura(uuid, uuid, text, date, text, text, date, text) from public, anon;
revoke all on function public.mover_etapa_prefeitura(uuid, text, text, date, text, text, text, date) from public, anon;
revoke all on function public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, text) from public, anon;
revoke all on function public.ganhar_oportunidade_prefeitura(uuid, date, text) from public, anon;
revoke all on function public.perder_oportunidade_prefeitura(uuid, text, date) from public, anon;
revoke all on function public.reabrir_oportunidade_prefeitura(uuid, text, text, date, text, text, date) from public, anon;
revoke all on function public.registrar_renovacao_prefeitura(uuid, date, uuid, text) from public, anon;
revoke all on function public.cancelar_contrato_prefeitura(uuid, text) from public, anon;
revoke all on function public.registrar_contato_prefeitura(uuid, text, text, boolean, text, text) from public, anon;
revoke all on function public.registrar_interacao_prefeitura(uuid, text, text, date) from public, anon;

grant execute on function public.f_prefeitura_etapa_ordem(text) to authenticated;
grant execute on function public.criar_prefeitura(text, text, text) to authenticated;
grant execute on function public.abrir_oportunidade_prefeitura(uuid, uuid, text, date, text, text, date, text) to authenticated;
grant execute on function public.mover_etapa_prefeitura(uuid, text, text, date, text, text, text, date) to authenticated;
grant execute on function public.definir_proximo_passo_prefeitura(uuid, text, date, text, text, text) to authenticated;
grant execute on function public.ganhar_oportunidade_prefeitura(uuid, date, text) to authenticated;
grant execute on function public.perder_oportunidade_prefeitura(uuid, text, date) to authenticated;
grant execute on function public.reabrir_oportunidade_prefeitura(uuid, text, text, date, text, text, date) to authenticated;
grant execute on function public.registrar_renovacao_prefeitura(uuid, date, uuid, text) to authenticated;
grant execute on function public.cancelar_contrato_prefeitura(uuid, text) to authenticated;
grant execute on function public.registrar_contato_prefeitura(uuid, text, text, boolean, text, text) to authenticated;
grant execute on function public.registrar_interacao_prefeitura(uuid, text, text, date) to authenticated;
