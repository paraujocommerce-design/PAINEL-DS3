-- Painel de Gestão DS3 — Fase 6
-- 1) Código do representante passa a ser MANUAL (4 dígitos), não mais gerado por sequence.
-- 2) Nova hierarquia de LIDERANÇA para premiação (distinta de supervisor):
--    um representante pode ter um representante líder, que recebe premiação pela
--    produção da equipe abaixo dele. Venda continua pertencendo só ao vendedor.
-- Nunca reescreve migrations 0001-0005 já aplicadas.

-- =====================================================================
-- 0) Preflight — aborta se já existir código fora do novo formato
-- =====================================================================
do $$
declare
  v_invalidos int;
begin
  select count(*) into v_invalidos
  from public.representantes
  where codigo !~ '^[0-9]{4}$';

  if v_invalidos > 0 then
    raise exception
      'Migration abortada: % representante(s) com código fora do formato de 4 dígitos. '
      'Corrija manualmente antes de reaplicar.', v_invalidos;
  end if;
end
$$;

-- =====================================================================
-- 1) Código manual de 4 dígitos
-- =====================================================================
alter table public.representantes alter column codigo drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'representantes_codigo_formato'
  ) then
    alter table public.representantes
      add constraint representantes_codigo_formato
      check (codigo ~ '^[0-9]{4}$');
  end if;
end
$$;

-- A sequence antiga não é mais usada para gerar código (mantida apenas
-- por segurança/histórico, sem alterar seu valor).

-- =====================================================================
-- 2) criar_representante passa a exigir o código manualmente
-- =====================================================================
drop function if exists public.criar_representante(text, uuid, date, text);

create or replace function public.criar_representante(
  p_codigo text,
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
  v_codigo text := btrim(coalesce(p_codigo, ''));
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do representante.';
  end if;
  if v_codigo !~ '^[0-9]{4}$' then
    raise exception 'Código do representante deve ter exatamente 4 dígitos numéricos.';
  end if;
  if exists (select 1 from public.representantes where codigo = v_codigo) then
    raise exception 'Já existe um representante com o código %.', v_codigo;
  end if;

  select s.nome into v_supervisor from public.supervisores s where s.id = p_supervisor_id;
  if v_supervisor is null then
    raise exception 'Supervisor inexistente.';
  end if;

  insert into public.representantes (codigo, nome, data_cadastro, observacao, created_by)
  values (v_codigo, btrim(p_nome), coalesce(p_data_cadastro, current_date),
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

revoke all on function public.criar_representante(text, text, uuid, date, text) from public, anon;
grant execute on function public.criar_representante(text, text, uuid, date, text) to authenticated;

-- =====================================================================
-- 3) Hierarquia de liderança (premiação) — distinta de supervisor
-- =====================================================================
create table if not exists public.representante_liderancas (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references public.representantes(id) on delete cascade,
  lider_id uuid not null references public.representantes(id) on delete restrict,
  inicio date not null default current_date,
  fim date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint representante_liderancas_nao_e_proprio_lider
    check (representante_id <> lider_id),
  constraint representante_liderancas_periodo_valido
    check (fim is null or fim >= inicio)
);

create index if not exists representante_liderancas_rep_idx
  on public.representante_liderancas (representante_id, inicio desc);

create index if not exists representante_liderancas_lider_idx
  on public.representante_liderancas (lider_id);

-- Um representante só pode ter UM líder aberto por vez.
create unique index if not exists representante_liderancas_um_aberto
  on public.representante_liderancas (representante_id)
  where fim is null;

-- Períodos de liderança do mesmo representante nunca se sobrepõem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'representante_liderancas_sem_sobreposicao'
  ) then
    alter table public.representante_liderancas
      add constraint representante_liderancas_sem_sobreposicao
      exclude using gist (
        representante_id with =,
        daterange(inicio, coalesce(fim + 1, 'infinity'::date), '[)') with &&
      );
  end if;
end
$$;

grant select on public.representante_liderancas to authenticated;
grant all on public.representante_liderancas to service_role;

alter table public.representante_liderancas enable row level security;

drop policy if exists "representante_liderancas_select_admin" on public.representante_liderancas;
create policy "representante_liderancas_select_admin"
  on public.representante_liderancas for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

revoke all on public.representante_liderancas from anon;
revoke delete, insert, update, truncate on public.representante_liderancas from authenticated;

-- View de leitura fácil: líder vigente de cada representante.
create or replace view public.v_representantes_lideranca_atual
with (security_invoker = on) as
select
  l.representante_id,
  l.lider_id,
  r_lider.codigo as lider_codigo,
  r_lider.nome as lider_nome,
  l.inicio
from public.representante_liderancas l
join public.representantes r_lider on r_lider.id = l.lider_id
where l.fim is null;

-- =====================================================================
-- 4) RPCs de manutenção da liderança
-- =====================================================================
create or replace function public.definir_lider_representante(
  p_representante_id uuid,
  p_lider_id uuid,
  p_data date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.representante_liderancas%rowtype;
  v_data date := coalesce(p_data, current_date);
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
  if p_representante_id = p_lider_id then
    raise exception 'Um representante não pode ser líder de si mesmo.';
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;
  if not exists (select 1 from public.representantes where id = p_lider_id) then
    raise exception 'Líder inexistente.';
  end if;

  select * into v_atual
  from public.representante_liderancas l
  where l.representante_id = p_representante_id and l.fim is null
  for update;

  if v_atual.id is not null then
    if v_atual.lider_id = p_lider_id then
      return;
    end if;
    if v_data < v_atual.inicio then
      raise exception 'A mudança não pode ser anterior ao início da liderança atual (%).', v_atual.inicio;
    end if;
    update public.representante_liderancas
       set fim = v_data
     where id = v_atual.id;
  end if;

  insert into public.representante_liderancas
    (representante_id, lider_id, inicio, created_by)
  values (p_representante_id, p_lider_id, v_data, auth.uid());
end;
$$;

create or replace function public.encerrar_lideranca_representante(
  p_representante_id uuid,
  p_data date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.representante_liderancas%rowtype;
  v_data date := coalesce(p_data, current_date);
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;

  select * into v_atual
  from public.representante_liderancas l
  where l.representante_id = p_representante_id and l.fim is null
  for update;

  if v_atual.id is null then
    raise exception 'Representante sem liderança aberta.';
  end if;
  if v_data < v_atual.inicio then
    raise exception 'O encerramento não pode ser anterior ao início da liderança (%).', v_atual.inicio;
  end if;

  update public.representante_liderancas
     set fim = v_data
   where id = v_atual.id;
end;
$$;

revoke all on function public.definir_lider_representante(uuid, uuid, date) from public, anon;
revoke all on function public.encerrar_lideranca_representante(uuid, date) from public, anon;
grant execute on function public.definir_lider_representante(uuid, uuid, date) to authenticated;
grant execute on function public.encerrar_lideranca_representante(uuid, date) to authenticated;
