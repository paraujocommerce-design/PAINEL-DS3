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

## Migration 0003 — Funil de Prefeituras

Arquivo: `db/migrations/0003_prefeituras.sql`.

Define a ordem oficial do funil (`f_prefeitura_etapa_ordem`): prospecção → contato → diagnóstico →
decisor → apresentação → interesse → processo institucional → negociação → contrato.

Cria:
- `public.prefeituras`, `public.prefeitura_contatos` (decisor);
- `public.prefeitura_oportunidades` (etapa/status; próximo passo e prazo obrigatórios enquanto
  `status = 'aberta'`; motivo de perda obrigatório se perdida; só chega a `ganha` na etapa `contrato`);
- `public.prefeitura_movimentos` (append-only, imutável), `public.prefeitura_interacoes`,
  `public.prefeitura_contratos` (nova/renovação, cancelamento rastreável), `public.prefeitura_metas`;
- RPCs transacionais: `criar_prefeitura`, `abrir_oportunidade_prefeitura`, `mover_etapa_prefeitura`,
  `definir_proximo_passo_prefeitura`, `ganhar_oportunidade_prefeitura`, `perder_oportunidade_prefeitura`,
  `reabrir_oportunidade_prefeitura`, `registrar_renovacao_prefeitura`, `cancelar_contrato_prefeitura`,
  `registrar_contato_prefeitura`, `registrar_interacao_prefeitura`.

RLS ativa em todas as tabelas; escrita direta de tabela sensível não é permitida — sempre via RPC.

## Migration 0004 — Integridade de Prefeituras

Arquivo: `db/migrations/0004_prefeituras_integridade.sql`.

Correção estrutural sobre a 0003, com preflight que aborta se os dados existentes forem
inconsistentes. Trava o responsável operacional da frente em **Clênio** no próprio banco
(`f_prefeitura_supervisor()` + trigger, bloqueando qualquer outro valor mesmo via SQL direto).
Redefine `tipo_espera IS NULL` como "em andamento"; adiciona o tipo de movimento
`atualizacao_proximo_passo` (histórico append-only, antes era sobrescrito); reforça constraints
de coerência entre contrato novo/renovação e cronologia estrita de movimentações; revoga INSERT
direto em `prefeitura_interacoes`/`prefeitura_contatos` (escrita só via RPC).

## Migration 0005 — Fundação de importação + contratos individuais de Representantes

Arquivo: `db/migrations/0005_importacao_representantes.sql`.

Adiciona `representantes.codigo` (sequência `REP-000001`, imutável após gerado) e cria a
**infraestrutura de importação compartilhada entre frentes**:
- `public.importacao_frentes` (catálogo: `representantes` implementada; `prefeituras`,
  `vendas_internas`, `certificado_digital` seedadas como não implementadas ainda);
- `public.importacao_lotes` (arquivo, hash SHA-256, contadores, status; idempotência de nível 1 —
  o mesmo hash não pode ser confirmado duas vezes na mesma frente);
- `public.importacao_linhas` (por lote, status, chave de negócio, motivo de rejeição, payload).

Cria `public.representante_contratos` (contrato individual — data da venda, código do contrato,
CNPJ, premiável + motivo, pendência + tipo, status informado pela origem, cancelamento rastreável).
Deduplicação por chave composta `(código do contrato, representante, data da venda)`, pois o
código do contrato isoladamente não é comprovadamente único na fonte. `producao_corte` +
`v_producao_representantes_unificada` fazem a transição entre a produção legada agregada
(migration 0002) e os contratos individuais, sem dupla contagem.

RPC central: `confirmar_importacao_representantes(...)` — transacional, revalida cada linha no
servidor (nunca confia no cliente) e grava lote + linhas + contratos em uma única transação.
`cancelar_contrato_representante` e `definir_corte_producao` são RPCs administrativas.
