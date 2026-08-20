-- Painel de Gestão DS3 — Fase 3
-- Fundação comercial da frente Representantes (Berg e Clênio).
-- Incremental: não altera public.profiles nem public.user_roles (migration 0001).
-- Executar no projeto Supabase próprio da DS3 (SQL Editor ou Supabase CLI).
--
-- Princípios estruturais desta migration:
--   * Fato histórico nunca é apagado nem reescrito.
--   * Supervisor de uma produção é o supervisor VIGENTE NA DATA DO FATO
--     (fonte: public.representante_vinculos). Trocar supervisor não reescreve passado.
--   * Reativação é REGRA DERIVADA (view com LAG), não evento armazenado.
--   * Status de atividade nunca é persistido: é calculado com data de referência.
--   * Ausência de produção é ausência (NULL), nunca zero.
--   * Escrita sensível só por função SECURITY DEFINER com verificação de ADMIN.

create extension if not exists btree_gist;

-- =====================================================================
-- 1) Supervisores / contextos operacionais
-- =====================================================================
create table if not exists public.supervisores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  created_at timestamptz not null default now()
);

grant select on public.supervisores to authenticated;
grant all on public.supervisores to service_role;

alter table public.supervisores enable row level security;

drop policy if exists "supervisores_select_admin" on public.supervisores;
create policy "supervisores_select_admin"
  on public.supervisores for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Contextos operacionais definidos pelo negócio (não são usuários de autenticação).
insert into public.supervisores (slug, nome)
values ('berg', 'Berg'), ('clenio', 'Clênio')
on conflict (slug) do nothing;

-- =====================================================================
-- 2) Representantes
--    NÃO possui coluna de supervisor: o vínculo vigente é a única verdade.
--    NÃO possui situacao_cadastral: não há regra de negócio aprovada para
--    "desligado" e um segundo conceito de ativo/inativo seria concorrente
--    com o status operacional derivado (ATIVO/ATENÇÃO/INATIVO/SEM PRODUÇÃO).
-- =====================================================================
create table if not exists public.representantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  data_cadastro date not null default current_date,
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Duplicidade evidente: mesmo nome (normalizado) cadastrado duas vezes.
create unique index if not exists representantes_nome_unico
  on public.representantes (lower(btrim(nome)));

grant select on public.representantes to authenticated;
grant all on public.representantes to service_role;

alter table public.representantes enable row level security;

drop policy if exists "representantes_admin_all" on public.representantes;
drop policy if exists "representantes_select_admin" on public.representantes;
create policy "representantes_select_admin"
  on public.representantes for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 3) Histórico de vínculo representante ↔ supervisor
--    Escrita exclusivamente por função (frontend não escreve aqui).
-- =====================================================================
create table if not exists public.representante_vinculos (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete cascade,
  supervisor_id uuid not null references public.supervisores(id) on delete restrict,
  inicio date not null default current_date,
  fim date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint representante_vinculos_periodo_valido
    check (fim is null or fim >= inicio)
);

create index if not exists representante_vinculos_rep_idx
  on public.representante_vinculos (representante_id, inicio desc);

-- Um representante só pode ter UM vínculo aberto por vez.
create unique index if not exists representante_vinculos_um_aberto
  on public.representante_vinculos (representante_id)
  where fim is null;

-- Períodos de vínculo do mesmo representante nunca se sobrepõem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'representante_vinculos_sem_sobreposicao'
  ) then
    alter table public.representante_vinculos
      add constraint representante_vinculos_sem_sobreposicao
      exclude using gist (
        representante_id with =,
        daterange(inicio, coalesce(fim + 1, 'infinity'::date), '[)') with &&
      );
  end if;
end;
$$;

grant select on public.representante_vinculos to authenticated;
grant all on public.representante_vinculos to service_role;

alter table public.representante_vinculos enable row level security;

drop policy if exists "representante_vinculos_select_admin" on public.representante_vinculos;
create policy "representante_vinculos_select_admin"
  on public.representante_vinculos for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 4) Eventos persistidos do representante
--    Somente fatos que NÃO são deriváveis: cadastro e mudança de supervisor.
--    Reativação foi removida daqui (passou a ser derivada — seção 9).
-- =====================================================================
create table if not exists public.representante_eventos (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete cascade,
  tipo text not null check (tipo in ('cadastro', 'mudanca_supervisor')),
  ocorrido_em date not null default current_date,
  detalhe text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists representante_eventos_rep_idx
  on public.representante_eventos (representante_id, ocorrido_em desc);

grant select on public.representante_eventos to authenticated;
grant all on public.representante_eventos to service_role;

alter table public.representante_eventos enable row level security;

drop policy if exists "representante_eventos_select_admin" on public.representante_eventos;
create policy "representante_eventos_select_admin"
  on public.representante_eventos for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 5) Produção (contratos Serasa)
--    Fato comercial: nunca apagado, nunca reescrito.
--    Correção = cancelamento rastreável (função da seção 8).
-- =====================================================================
create table if not exists public.producoes (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete restrict,
  data_producao date not null,
  quantidade integer not null check (quantidade > 0),
  origem text not null default 'registro_manual'
    check (origem in ('registro_manual', 'importacao_excel')),
  observacao text,
  cancelada_em timestamptz,
  cancelada_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint producoes_cancelamento_completo
    check (
      (cancelada_em is null and motivo_cancelamento is null and cancelada_por is null)
      or (cancelada_em is not null and btrim(coalesce(motivo_cancelamento, '')) <> '')
    )
);

create index if not exists producoes_rep_data_idx
  on public.producoes (representante_id, data_producao desc);
create index if not exists producoes_data_idx
  on public.producoes (data_producao);

grant select, insert on public.producoes to authenticated;
grant all on public.producoes to service_role;

alter table public.producoes enable row level security;

drop policy if exists "producoes_admin_all" on public.producoes;
drop policy if exists "producoes_select_admin" on public.producoes;
drop policy if exists "producoes_insert_admin" on public.producoes;
create policy "producoes_select_admin"
  on public.producoes for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "producoes_insert_admin"
  on public.producoes for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());

-- Imutabilidade do fato: sem DELETE e sem UPDATE fora do cancelamento.
create or replace function public.f_producoes_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Produção não pode ser excluída. Use o cancelamento rastreável.';
  end if;

  if new.representante_id is distinct from old.representante_id
     or new.data_producao is distinct from old.data_producao
     or new.quantidade is distinct from old.quantidade
     or new.origem is distinct from old.origem
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.id is distinct from old.id then
    raise exception 'Produção é fato histórico: representante, data, quantidade, origem e autoria não podem ser alterados.';
  end if;

  if old.cancelada_em is not null
     and (new.cancelada_em is distinct from old.cancelada_em
          or new.cancelada_por is distinct from old.cancelada_por
          or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Cancelamento já registrado não pode ser alterado nem estornado.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_producao_imutavel on public.producoes;
create trigger on_producao_imutavel
  before update or delete on public.producoes
  for each row execute function public.f_producoes_imutavel();

-- =====================================================================
-- 6) Metas com vigência histórica (independentes por supervisor + indicador)
-- =====================================================================
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.supervisores(id) on delete restrict,
  indicador text not null check (indicador in ('contratos_mes', 'representantes_ativos')),
  valor integer not null check (valor > 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint metas_vigencia_valida
    check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint metas_inicio_unico
    unique (supervisor_id, indicador, vigencia_inicio)
);

create index if not exists metas_contexto_idx
  on public.metas (supervisor_id, indicador, vigencia_inicio desc);

-- Sobreposição de vigência é impossível no banco (garantia estrutural).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'metas_sem_sobreposicao'
  ) then
    alter table public.metas
      add constraint metas_sem_sobreposicao
      exclude using gist (
        supervisor_id with =,
        indicador with =,
        daterange(vigencia_inicio, coalesce(vigencia_fim + 1, 'infinity'::date), '[)') with &&
      );
  end if;
end;
$$;

grant select, insert on public.metas to authenticated;
grant all on public.metas to service_role;

alter table public.metas enable row level security;

drop policy if exists "metas_admin_all" on public.metas;
drop policy if exists "metas_select_admin" on public.metas;
drop policy if exists "metas_insert_admin" on public.metas;
create policy "metas_select_admin"
  on public.metas for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "metas_insert_admin"
  on public.metas for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());

-- Encaixe automático na linha do tempo (inclusive inserção retroativa).
create or replace function public.f_metas_encaixe_vigencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proxima date;
begin
  -- Serializa inserções concorrentes do mesmo supervisor + indicador.
  perform pg_advisory_xact_lock(
    hashtextextended(new.supervisor_id::text || ':' || new.indicador, 0)
  );

  -- A meta imediatamente anterior é encerrada no dia anterior ao novo início.
  update public.metas m
     set vigencia_fim = new.vigencia_inicio - 1
   where m.supervisor_id = new.supervisor_id
     and m.indicador = new.indicador
     and m.id <> new.id
     and m.vigencia_inicio < new.vigencia_inicio
     and (m.vigencia_fim is null or m.vigencia_fim >= new.vigencia_inicio);

  -- Se já existir meta futura, a nova termina no dia anterior a ela.
  select min(m.vigencia_inicio) into proxima
  from public.metas m
  where m.supervisor_id = new.supervisor_id
    and m.indicador = new.indicador
    and m.id <> new.id
    and m.vigencia_inicio > new.vigencia_inicio;

  if proxima is not null then
    new.vigencia_fim := least(coalesce(new.vigencia_fim, proxima - 1), proxima - 1);
    if new.vigencia_fim < new.vigencia_inicio then
      raise exception 'Já existe meta iniciando em % para este supervisor e indicador.', proxima;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_meta_created on public.metas;
create trigger on_meta_created
  before insert on public.metas
  for each row execute function public.f_metas_encaixe_vigencia();

-- =====================================================================
-- 7) Escrita controlada: cadastro e mudança de supervisor
-- =====================================================================
create or replace function public.criar_representante(
  p_nome text,
  p_supervisor_id uuid,
  p_data_cadastro date default current_date,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_supervisor text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do representante.';
  end if;

  select s.nome into v_supervisor from public.supervisores s where s.id = p_supervisor_id;
  if v_supervisor is null then
    raise exception 'Supervisor inexistente.';
  end if;

  insert into public.representantes (nome, data_cadastro, observacao, created_by)
  values (btrim(p_nome), coalesce(p_data_cadastro, current_date),
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.representante_vinculos
    (representante_id, supervisor_id, inicio, created_by)
  values (v_id, p_supervisor_id, coalesce(p_data_cadastro, current_date), auth.uid());

  insert into public.representante_eventos
    (representante_id, tipo, ocorrido_em, detalhe, created_by)
  values (v_id, 'cadastro', coalesce(p_data_cadastro, current_date),
          'Captado sob supervisão de ' || v_supervisor, auth.uid());

  return v_id;
end;
$$;

create or replace function public.mudar_supervisor(
  p_representante_id uuid,
  p_supervisor_id uuid,
  p_data_mudanca date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.representante_vinculos%rowtype;
  v_nome_novo text;
  v_nome_antigo text;
  v_data date := coalesce(p_data_mudanca, current_date);
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;

  select s.nome into v_nome_novo from public.supervisores s where s.id = p_supervisor_id;
  if v_nome_novo is null then
    raise exception 'Supervisor inexistente.';
  end if;

  select * into v_atual
  from public.representante_vinculos v
  where v.representante_id = p_representante_id and v.fim is null
  for update;

  if v_atual.id is null then
    raise exception 'Representante sem vínculo aberto.';
  end if;
  if v_atual.supervisor_id = p_supervisor_id then
    return;
  end if;
  if v_data < v_atual.inicio then
    raise exception 'A mudança não pode ser anterior ao início do vínculo atual (%).', v_atual.inicio;
  end if;

  select s.nome into v_nome_antigo
  from public.supervisores s where s.id = v_atual.supervisor_id;

  if v_data = v_atual.inicio then
    -- Troca no mesmo dia do início: corrige o vínculo aberto, sem intervalo inválido.
    update public.representante_vinculos
       set supervisor_id = p_supervisor_id
     where id = v_atual.id;
  else
    update public.representante_vinculos
       set fim = v_data - 1
     where id = v_atual.id;

    insert into public.representante_vinculos
      (representante_id, supervisor_id, inicio, created_by)
    values (p_representante_id, p_supervisor_id, v_data, auth.uid());
  end if;

  insert into public.representante_eventos
    (representante_id, tipo, ocorrido_em, detalhe, created_by)
  values (p_representante_id, 'mudanca_supervisor', v_data,
          coalesce(v_nome_antigo, '—') || ' -> ' || v_nome_novo, auth.uid());
end;
$$;

-- =====================================================================
-- 8) Cancelamento rastreável de produção (sem estorno nesta fase)
-- =====================================================================
create or replace function public.cancelar_producao(
  p_producao_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  update public.producoes p
     set cancelada_em = now(),
         cancelada_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where p.id = p_producao_id
     and p.cancelada_em is null;

  if not found then
    raise exception 'Produção inexistente ou já cancelada.';
  end if;
end;
$$;

-- =====================================================================
-- 9) Views — única verdade matemática, sem N+1
-- =====================================================================

-- 9.1 Produção válida atribuída ao supervisor VIGENTE NA DATA DO FATO.
create or replace view public.v_producoes_atribuidas
with (security_invoker = on) as
select
  p.id,
  p.representante_id,
  r.nome as representante_nome,
  p.data_producao,
  p.quantidade,
  p.origem,
  p.observacao,
  v.supervisor_id,
  s.slug as supervisor_slug,
  s.nome as supervisor_nome
from public.producoes p
join public.representantes r on r.id = p.representante_id
join lateral (
  select vin.supervisor_id
  from public.representante_vinculos vin
  where vin.representante_id = p.representante_id
  order by (vin.inicio <= p.data_producao) desc,
           case when vin.inicio <= p.data_producao then vin.inicio end desc nulls last,
           vin.inicio asc
  limit 1
) v on true
join public.supervisores s on s.id = v.supervisor_id
where p.cancelada_em is null;

-- 9.2 Captação atribuída ao supervisor vigente na DATA DE CADASTRO.
create or replace view public.v_captacao_atribuida
with (security_invoker = on) as
select
  r.id as representante_id,
  r.nome,
  r.data_cadastro,
  v.supervisor_id,
  s.slug as supervisor_slug
from public.representantes r
join lateral (
  select vin.supervisor_id
  from public.representante_vinculos vin
  where vin.representante_id = r.id
  order by (vin.inicio <= r.data_cadastro) desc,
           case when vin.inicio <= r.data_cadastro then vin.inicio end desc nulls last,
           vin.inicio asc
  limit 1
) v on true
join public.supervisores s on s.id = v.supervisor_id;

-- 9.3 Reativação DERIVADA: data válida cujo intervalo para a data válida
--     imediatamente anterior (datas distintas) é de 30 dias ou mais.
create or replace view public.v_reativacoes
with (security_invoker = on) as
with datas as (
  select distinct p.representante_id, p.data_producao
  from public.producoes p
  where p.cancelada_em is null
),
sequencia as (
  select
    d.representante_id,
    d.data_producao,
    lag(d.data_producao) over (
      partition by d.representante_id order by d.data_producao
    ) as anterior
  from datas d
)
select
  q.representante_id,
  q.data_producao as ocorrido_em,
  q.anterior as producao_anterior,
  (q.data_producao - q.anterior) as dias_sem_producao,
  v.supervisor_id,
  s.slug as supervisor_slug
from sequencia q
join lateral (
  select vin.supervisor_id
  from public.representante_vinculos vin
  where vin.representante_id = q.representante_id
  order by (vin.inicio <= q.data_producao) desc,
           case when vin.inicio <= q.data_producao then vin.inicio end desc nulls last,
           vin.inicio asc
  limit 1
) v on true
join public.supervisores s on s.id = v.supervisor_id
where q.anterior is not null
  and (q.data_producao - q.anterior) >= 30;

-- 9.4 Carteira ATUAL por supervisor (vínculo aberto).
create or replace view public.v_representantes_carteira
with (security_invoker = on) as
select
  r.id,
  r.nome,
  r.data_cadastro,
  r.observacao,
  v.supervisor_id,
  s.slug as supervisor_slug,
  s.nome as supervisor_nome,
  (select max(p.data_producao) from public.producoes p
    where p.representante_id = r.id and p.cancelada_em is null) as ultima_producao,
  (select sum(p.quantidade) from public.producoes p
    where p.representante_id = r.id and p.cancelada_em is null) as contratos_total
from public.representantes r
join public.representante_vinculos v
  on v.representante_id = r.id and v.fim is null
join public.supervisores s on s.id = v.supervisor_id;

-- 9.5 Carteira NA DATA DE REFERÊNCIA + última produção válida até a referência.
--     Produção posterior à referência nunca altera o status histórico.
--     Ausência de produção retorna NULL (nunca zero).
create or replace function public.f_carteira_referencia(
  p_supervisor_id uuid,
  p_referencia date
)
returns table (
  id uuid,
  nome text,
  data_cadastro date,
  observacao text,
  supervisor_id uuid,
  supervisor_slug text,
  supervisor_nome text,
  ultima_producao date,
  contratos_ate_referencia bigint
)
language sql
stable
set search_path = ''
as $$
  select
    r.id,
    r.nome,
    r.data_cadastro,
    r.observacao,
    v.supervisor_id,
    s.slug,
    s.nome,
    (select max(p.data_producao) from public.producoes p
      where p.representante_id = r.id
        and p.cancelada_em is null
        and p.data_producao <= p_referencia),
    (select sum(p.quantidade)::bigint from public.producoes p
      where p.representante_id = r.id
        and p.cancelada_em is null
        and p.data_producao <= p_referencia)
  from public.representante_vinculos v
  join public.representantes r on r.id = v.representante_id
  join public.supervisores s on s.id = v.supervisor_id
  where v.supervisor_id = p_supervisor_id
    and v.inicio <= p_referencia
    and (v.fim is null or v.fim >= p_referencia)
  order by r.nome;
$$;

grant select on public.v_producoes_atribuidas to authenticated, service_role;
grant select on public.v_captacao_atribuida to authenticated, service_role;
grant select on public.v_reativacoes to authenticated, service_role;
grant select on public.v_representantes_carteira to authenticated, service_role;

-- =====================================================================
-- 10) Permissões — menor privilégio explícito
--     anon sem qualquer privilégio. RLS ativa em todas as tabelas.
-- =====================================================================
revoke all on public.supervisores from anon;
revoke all on public.representantes from anon;
revoke all on public.representante_vinculos from anon;
revoke all on public.representante_eventos from anon;
revoke all on public.producoes from anon;
revoke all on public.metas from anon;
revoke all on public.v_producoes_atribuidas from anon;
revoke all on public.v_captacao_atribuida from anon;
revoke all on public.v_reativacoes from anon;
revoke all on public.v_representantes_carteira from anon;

-- Produção nunca é apagada nem editada diretamente.
revoke delete, update, truncate on public.producoes from authenticated;
revoke delete, insert, update, truncate on public.representantes from authenticated;
revoke delete, insert, update, truncate on public.supervisores from authenticated;
revoke delete, insert, update, truncate on public.representante_vinculos from authenticated;
revoke delete, insert, update, truncate on public.representante_eventos from authenticated;
revoke delete, update, truncate on public.metas from authenticated;

-- Funções: EXECUTE só para quem precisa.
revoke all on function public.criar_representante(text, uuid, date, text) from public, anon;
revoke all on function public.mudar_supervisor(uuid, uuid, date) from public, anon;
revoke all on function public.cancelar_producao(uuid, text) from public, anon;
revoke all on function public.f_carteira_referencia(uuid, date) from public, anon;
revoke all on function public.f_producoes_imutavel() from public, anon, authenticated;
revoke all on function public.f_metas_encaixe_vigencia() from public, anon, authenticated;

grant execute on function public.criar_representante(text, uuid, date, text) to authenticated;
grant execute on function public.mudar_supervisor(uuid, uuid, date) to authenticated;
grant execute on function public.cancelar_producao(uuid, text) to authenticated;
grant execute on function public.f_carteira_referencia(uuid, date) to authenticated;
