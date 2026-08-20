-- Painel de Gestão DS3 — Fase 2
-- Fundação mínima de autenticação/perfil. Nenhuma tabela comercial.
-- Executar no projeto Supabase próprio da DS3 (SQL Editor ou Supabase CLI).

-- 1) Perfil da aplicação (identidade autenticada != perfil de negócio)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2) Papéis em tabela separada (nunca no perfil) — apenas 'admin' nesta fase
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin');
  end if;
end
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

-- Concessão/revogação de papéis é operação administrativa (service_role / SQL).
-- Não há política de INSERT/UPDATE/DELETE para o papel 'authenticated'.

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 3) Criação automática do perfil no signup (sem dados fictícios)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Administrador inicial (executar manualmente após criar o usuário no painel)
-- Authentication > Users > Add user (marcar e-mail como confirmado).
-- Em seguida, substituindo pelo e-mail real do administrador:
--
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'admin@dominio.real'
-- on conflict do nothing;
