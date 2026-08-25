-- Verificação da migration 0001_auth_foundation.sql
-- Rodar no SQL Editor do Supabase APÓS aplicar a migration.
-- Resultado esperado: coluna "resultado" = OK em todas as linhas.

-- 1) Tabelas criadas
select
  'tabela ' || t.nome as verificacao,
  case when c.relname is not null then 'OK' else 'FALTANDO' end as resultado,
  coalesce(c.relrowsecurity::text, '-') as rls_ativa
from (values ('profiles'), ('user_roles')) as t(nome)
left join pg_class c
  on c.relname = t.nome
 and c.relnamespace = 'public'::regnamespace;

-- 2) RLS habilitada
select
  'rls ' || relname as verificacao,
  case when relrowsecurity then 'OK' else 'DESATIVADA' end as resultado
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('profiles', 'user_roles');

-- 3) Políticas existentes
select
  'policy ' || tablename || '.' || policyname as verificacao,
  cmd as comando,
  roles::text as papeis
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'user_roles')
order by tablename, policyname;

-- 4) Grants por papel
select
  'grant ' || table_name || ' -> ' || grantee as verificacao,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'user_roles')
  and grantee in ('authenticated', 'anon', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 5) Enum app_role, função has_role e trigger de criação de perfil
select 'enum app_role' as verificacao,
       case when exists (select 1 from pg_type where typname = 'app_role') then 'OK' else 'FALTANDO' end as resultado
union all
select 'função has_role',
       case when exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'has_role'
       ) then 'OK' else 'FALTANDO' end
union all
select 'função handle_new_user',
       case when exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'handle_new_user'
       ) then 'OK' else 'FALTANDO' end
union all
select 'trigger on_auth_user_created',
       case when exists (
         select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
       ) then 'OK' else 'FALTANDO' end;

-- 6) Administrador inicial (opcional — só após criar o usuário no painel)
select
  u.email,
  case when r.role is not null then 'admin' else 'sem papel' end as papel,
  case when p.id is not null then 'perfil criado' else 'perfil ausente' end as perfil
from auth.users u
left join public.user_roles r on r.user_id = u.id and r.role = 'admin'
left join public.profiles p on p.id = u.id
order by u.created_at;
