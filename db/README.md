# Banco de dados — Painel de Gestão DS3

Projeto Supabase próprio da DS3. Toda alteração estrutural é rastreável por migration
numerada em `db/migrations/`, aplicada em ordem.

## Aplicar

- Supabase CLI: `supabase db execute --file db/migrations/0001_auth_foundation.sql`
- ou copiar o conteúdo no SQL Editor do painel Supabase.

## Migrations

| Arquivo | Conteúdo |
| --- | --- |
| `0001_auth_foundation.sql` | `profiles`, `user_roles` (enum `app_role`), `has_role()`, trigger de criação de perfil, RLS e grants. |

Nenhuma tabela comercial foi criada.

## Verificação

Depois de aplicar a migration, rodar `db/checks/0001_verify_auth_foundation.sql` no SQL Editor.
Ele retorna, em blocos:

1. existência de `public.profiles` e `public.user_roles`;
2. RLS ativa nas duas tabelas;
3. políticas (`profiles_select_own`, `profiles_update_own`, `user_roles_select_own`);
4. grants para `authenticated` / `service_role` (não deve haver `anon`);
5. enum `app_role`, funções `has_role` / `handle_new_user` e trigger `on_auth_user_created`;
6. usuários existentes com perfil e papel `admin`.

Esperado: `OK` em todas as linhas de resultado.


## Administrador inicial

1. Supabase > Authentication > Users > **Add user** com e-mail e senha reais (marcar e-mail confirmado).
2. Rodar o `insert` comentado ao final de `0001_auth_foundation.sql` com o e-mail do administrador.
3. Manter **Authentication > Providers > Email**: "Enable Sign Ups" **desativado** (sem cadastro público).

## Variáveis de ambiente (local e Vercel)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

A `service_role` key nunca é usada no frontend nem versionada.

## Migration 0002 — Fundação comercial (Fase 3)

Arquivo: `db/migrations/0002_comercial_representantes.sql` (incremental e idempotente).

Cria:
- `public.supervisores` (contextos Berg e Clênio — não são usuários de autenticação);
- `public.representantes` (nome único normalizado, vínculo atual ao supervisor, data de cadastro);
- `public.representante_vinculos` (histórico de supervisão, nunca sobrescrito);
- `public.representante_eventos` (`cadastro`, `mudanca_supervisor`, `reativacao`);
- `public.producoes` (contratos Serasa; correção por cancelamento rastreável, sem exclusão);
- `public.metas` (indicador + valor + vigência histórica);
- view `public.v_representantes_resumo` (`security_invoker = on`).

RLS ativa em todas as tabelas, com policies restritas a `public.has_role(auth.uid(), 'admin')`.
Nenhuma policy para `anon`. Nenhuma tabela de fases futuras foi criada.

Aplicar no SQL Editor do Supabase e, em seguida, recarregar o painel.
