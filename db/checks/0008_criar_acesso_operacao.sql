-- Concessão do perfil de OPERAÇÃO a um usuário já criado no Supabase Auth.
--
-- Rodar SOMENTE depois de:
--   1. aplicar a migration 0008_perfil_operacao.sql;
--   2. criar o usuário em Authentication > Users > Add user
--      (com e-mail real e "Auto Confirm User" marcado).
--
-- Troque o e-mail abaixo pelo e-mail real da pessoa antes de executar.

insert into public.user_roles (user_id, role)
select id, 'operacao'::public.app_role
  from auth.users
 where email = 'EMAIL_DA_MARIUCHA@EXEMPLO.COM'
on conflict (user_id, role) do nothing;

-- Conferência: deve retornar a linha da pessoa com o papel 'operacao'.
select u.email, r.role, r.created_at
  from public.user_roles r
  join auth.users u on u.id = r.user_id
 order by r.created_at desc;
