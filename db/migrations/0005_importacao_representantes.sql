-- Painel de Gestão DS3 — Fase 5
-- Fundação de IMPORTAÇÃO (infraestrutura reutilizável) + contratos individuais
-- de Representantes.
--
-- Incremental e idempotente. NÃO altera Prefeituras (0003/0004), autenticação
-- (0001) nem a produção histórica agregada (public.producoes, 0002).
--
-- Princípios:
--   * Fato importado é individual, imutável e cancelável (nunca apagado).
--   * Ausência nunca vira zero: campo não informado é NULL ou linha rejeitada.
--   * Idempotência em duas camadas: hash do arquivo E chave de negócio.
--   * "Pago?" e "Tipo de pagamento" importados são STATUS INFORMADO PELA ORIGEM;
--     não são lançamento financeiro. Pagamentos serão fase posterior.
--   * Escrita sensível somente por função SECURITY DEFINER com verificação admin.
--
-- Rollback lógico (documentado, não automático):
--   * Um lote problemático é identificável por public.importacao_lotes.id;
--     seus contratos são cancelados individualmente por
--     public.cancelar_contrato_representante(id, motivo). Nunca DELETE em massa.

-- =====================================================================
-- 0) PREFLIGHT — aborta se o banco real divergir das premissas
-- =====================================================================
do $preflight$
declare
  v_erros text[] := '{}';
  v_faltando text;
begin
  -- 0.1 Tabelas exigidas pelas migrations 0001 e 0002
  for v_faltando in
    select nome
    from unnest(array[
      'profiles', 'user_roles', 'supervisores', 'representantes',
      'representante_vinculos', 'representante_eventos', 'producoes', 'metas'
    ]) as nome
    where to_regclass('public.' || nome) is null
  loop
    v_erros := v_erros || ('tabela ausente: public.' || v_faltando);
  end loop;

  -- 0.2 Funções/views exigidas
  for v_faltando in
    select nome
    from unnest(array['has_role', 'criar_representante', 'f_carteira_referencia']) as nome
    where not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = nome
    )
  loop
    v_erros := v_erros || ('função ausente: public.' || v_faltando || '()');
  end loop;

  for v_faltando in
    select nome
    from unnest(array[
      'v_representantes_carteira', 'v_producoes_atribuidas', 'v_captacao_atribuida'
    ]) as nome
    where to_regclass('public.' || nome) is null
  loop
    v_erros := v_erros || ('view ausente: public.' || v_faltando);
  end loop;

  if array_length(v_erros, 1) is not null then
    raise exception E'PREFLIGHT ABORTADO — pré-condições não atendidas:\n%',
      array_to_string(v_erros, E'\n');
  end if;

  -- 0.3 Estrutura mínima de public.representantes
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'representantes' and column_name = 'nome'
  ) then
    v_erros := v_erros || 'public.representantes.nome ausente';
  end if;

  -- 0.4 RLS ativa nas tabelas base
  for v_faltando in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('representantes', 'producoes', 'representante_vinculos', 'metas')
      and not c.relrowsecurity
  loop
    v_erros := v_erros || ('RLS desativada em public.' || v_faltando);
  end loop;

  -- 0.5 Inconsistências de dados que impedem backfill seguro
  if exists (
    select 1 from public.representantes
    group by lower(btrim(nome)) having count(*) > 1
  ) then
    v_erros := v_erros || 'nomes de representantes duplicados (normalizados) — resolver antes';
  end if;

  if exists (
    select 1 from public.representantes r
    where not exists (
      select 1 from public.representante_vinculos v where v.representante_id = r.id
    )
  ) then
    v_erros := v_erros || 'existe representante sem nenhum vínculo de supervisor';
  end if;

  -- 0.6 Se a coluna de código já existir, deve estar consistente
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'representantes' and column_name = 'codigo'
  ) then
    if exists (select 1 from public.representantes where codigo is null) then
      v_erros := v_erros || 'public.representantes.codigo existe com valores nulos';
    end if;
  end if;

  if array_length(v_erros, 1) is not null then
    raise exception E'PREFLIGHT ABORTADO — estado do banco incompatível:\n%',
      array_to_string(v_erros, E'\n');
  end if;

  raise notice 'PREFLIGHT OK — representantes: %, producoes: % (canceladas: %), vínculos abertos: %',
    (select count(*) from public.representantes),
    (select count(*) from public.producoes),
    (select count(*) from public.producoes where cancelada_em is not null),
    (select count(*) from public.representante_vinculos where fim is null);
end;
$preflight$;

-- =====================================================================
-- 1) Identificador estável do representante (não depende do nome)
--    A restrição de nome único da 0002 é PRESERVADA (não avaliada aqui).
-- =====================================================================
create sequence if not exists public.representantes_codigo_seq;

alter table public.representantes
  add column if not exists codigo text;

-- Backfill determinístico por ordem de cadastro (idempotente).
do $backfill$
declare
  v_rec record;
begin
  for v_rec in
    select id from public.representantes where codigo is null
    order by created_at, id
  loop
    update public.representantes
       set codigo = 'REP-' || lpad(nextval('public.representantes_codigo_seq')::text, 6, '0')
     where id = v_rec.id;
  end loop;
end;
$backfill$;

alter table public.representantes
  alter column codigo set default
    ('REP-' || lpad(nextval('public.representantes_codigo_seq')::text, 6, '0'));

do $$
begin
  if exists (select 1 from public.representantes where codigo is null) then
    raise exception 'Backfill de public.representantes.codigo incompleto — migration abortada.';
  end if;
end;
$$;

alter table public.representantes alter column codigo set not null;

create unique index if not exists representantes_codigo_unico
  on public.representantes (upper(btrim(codigo)));

-- Imutabilidade do código (alteração só por procedimento administrativo em SQL).
create or replace function public.f_representante_codigo_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'O código do representante é imutável.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_representante_codigo_imutavel on public.representantes;
create trigger on_representante_codigo_imutavel
  before update on public.representantes
  for each row execute function public.f_representante_codigo_imutavel();

-- =====================================================================
-- 2) Infraestrutura de importação — reutilizável por outras frentes
--    Frentes/tipos ficam em tabela de referência: adicionar uma nova frente
--    no futuro é INSERT, não refatoração estrutural.
-- =====================================================================
create table if not exists public.importacao_frentes (
  codigo text primary key,
  nome text not null,
  implementada boolean not null default false
);

insert into public.importacao_frentes (codigo, nome, implementada) values
  ('representantes', 'Representantes', true),
  ('prefeituras', 'Prefeituras', false),
  ('vendas_internas', 'Vendas Internas', false),
  ('certificado_digital', 'Certificado Digital', false)
on conflict (codigo) do nothing;

create table if not exists public.importacao_lotes (
  id uuid primary key default gen_random_uuid(),
  frente text not null references public.importacao_frentes(codigo) on delete restrict,
  tipo_importacao text not null check (btrim(tipo_importacao) <> ''),
  nome_arquivo text not null check (btrim(nome_arquivo) <> ''),
  hash_arquivo text not null check (hash_arquivo ~ '^[0-9a-f]{64}$'),
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  status text not null check (status in ('confirmado', 'falha')),
  iniciado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  total_linhas integer not null check (total_linhas >= 0),
  linhas_validas integer not null default 0 check (linhas_validas >= 0),
  linhas_importadas integer not null default 0 check (linhas_importadas >= 0),
  linhas_duplicadas integer not null default 0 check (linhas_duplicadas >= 0),
  linhas_rejeitadas integer not null default 0 check (linhas_rejeitadas >= 0),
  observacao text
);

-- Idempotência camada 1: o mesmo arquivo não é confirmado duas vezes na frente.
create unique index if not exists importacao_lotes_arquivo_confirmado
  on public.importacao_lotes (frente, hash_arquivo)
  where status = 'confirmado';

create index if not exists importacao_lotes_frente_idx
  on public.importacao_lotes (frente, iniciado_em desc);

create table if not exists public.importacao_linhas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.importacao_lotes(id) on delete cascade,
  numero_linha integer not null check (numero_linha > 0),
  hash_linha text,
  status text not null check (status in ('importada', 'duplicada', 'rejeitada')),
  chave_negocio text,
  motivo_rejeicao text,
  payload jsonb,
  constraint importacao_linhas_motivo_coerente
    check (status <> 'rejeitada' or btrim(coalesce(motivo_rejeicao, '')) <> '')
);

create unique index if not exists importacao_linhas_lote_numero
  on public.importacao_linhas (lote_id, numero_linha);
create index if not exists importacao_linhas_status_idx
  on public.importacao_linhas (lote_id, status);

-- =====================================================================
-- 3) Contratos individuais de Representantes (fato importado)
--
--    Chave de negócio: NÃO foi possível comprovar que "Código do contrato" é
--    globalmente único na fonte. Por isso a unicidade aplicada é COMPOSTA e
--    tecnicamente segura: (código normalizado + representante + data da venda),
--    restrita a contratos não cancelados. Reimportar o mesmo contrato sempre
--    reproduz a mesma tripla, então a dupla contagem é impedida; dois
--    representantes distintos com o mesmo código não são rejeitados por engano.
-- =====================================================================
create table if not exists public.representante_contratos (
  id uuid primary key default gen_random_uuid(),
  data_venda date not null,
  representante_id uuid not null references public.representantes(id) on delete restrict,
  codigo_cliente text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  codigo_contrato text not null check (btrim(codigo_contrato) <> ''),
  codigo_contrato_norm text generated always as (upper(btrim(codigo_contrato))) stored,
  -- Tipo de contrato: valor textual da origem, provisório e migrável.
  -- tipo_contrato_id fica preparado para a futura FK de cadastro de tipos.
  tipo_contrato_origem text,
  tipo_contrato_id uuid,
  premiavel boolean not null,
  motivo_nao_premiavel_origem text,
  possui_pendencia boolean not null,
  tipo_pendencia_origem text,
  -- Status informado pela ORIGEM. Não é lançamento financeiro.
  pago_informado_origem boolean not null,
  tipo_pagamento_informado_origem text
    check (tipo_pagamento_informado_origem is null
           or tipo_pagamento_informado_origem in ('normal', 'adiantamento')),
  importacao_lote_id uuid not null references public.importacao_lotes(id) on delete restrict,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelamento text,
  constraint contratos_premiavel_motivo
    check (premiavel or btrim(coalesce(motivo_nao_premiavel_origem, '')) <> ''),
  constraint contratos_pendencia_tipo
    check (not possui_pendencia or btrim(coalesce(tipo_pendencia_origem, '')) <> ''),
  constraint contratos_cancelamento_completo
    check (
      (cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
      or (cancelado_em is not null and btrim(coalesce(motivo_cancelamento, '')) <> '')
    )
);

create unique index if not exists representante_contratos_chave_negocio
  on public.representante_contratos (codigo_contrato_norm, representante_id, data_venda)
  where cancelado_em is null;

create index if not exists representante_contratos_codigo_idx
  on public.representante_contratos (codigo_contrato_norm);
create index if not exists representante_contratos_rep_data_idx
  on public.representante_contratos (representante_id, data_venda desc);
create index if not exists representante_contratos_data_idx
  on public.representante_contratos (data_venda);
create index if not exists representante_contratos_lote_idx
  on public.representante_contratos (importacao_lote_id);

-- Imutabilidade do fato: sem DELETE; UPDATE apenas para registrar cancelamento.
create or replace function public.f_contratos_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contrato é fato histórico: use o cancelamento rastreável.';
  end if;

  if new.id is distinct from old.id
     or new.data_venda is distinct from old.data_venda
     or new.representante_id is distinct from old.representante_id
     or new.codigo_contrato is distinct from old.codigo_contrato
     or new.codigo_cliente is distinct from old.codigo_cliente
     or new.cnpj is distinct from old.cnpj
     or new.premiavel is distinct from old.premiavel
     or new.possui_pendencia is distinct from old.possui_pendencia
     or new.pago_informado_origem is distinct from old.pago_informado_origem
     or new.tipo_pagamento_informado_origem is distinct from old.tipo_pagamento_informado_origem
     or new.importacao_lote_id is distinct from old.importacao_lote_id
     or new.criado_em is distinct from old.criado_em
     or new.criado_por is distinct from old.criado_por then
    raise exception 'Contrato importado não pode ser reescrito.';
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

drop trigger if exists on_contrato_imutavel on public.representante_contratos;
create trigger on_contrato_imutavel
  before update or delete on public.representante_contratos
  for each row execute function public.f_contratos_imutavel();

-- =====================================================================
-- 4) Transição produção legada (agregada) × contratos individuais
--    Nenhuma data é inventada: data_corte nasce NULL e será definida quando
--    a nova importação passar a ser a fonte oficial.
-- =====================================================================
create table if not exists public.producao_corte (
  frente text primary key references public.importacao_frentes(codigo) on delete restrict,
  data_corte date,
  definido_em timestamptz,
  definido_por uuid references auth.users(id) on delete set null
);

insert into public.producao_corte (frente, data_corte)
values ('representantes', null)
on conflict (frente) do nothing;

-- Fonte única sem dupla contagem:
--   * sem corte definido => somente a produção agregada legada é considerada;
--   * com corte definido => legada antes do corte + contratos a partir do corte.
create or replace view public.v_producao_representantes_unificada
with (security_invoker = on) as
with corte as (
  select data_corte from public.producao_corte where frente = 'representantes'
)
select
  'legado'::text as fonte,
  p.representante_id,
  p.data_producao as data_fato,
  p.quantidade::bigint as quantidade,
  null::uuid as contrato_id
from public.producoes p
cross join corte c
where p.cancelada_em is null
  and (c.data_corte is null or p.data_producao < c.data_corte)
union all
select
  'contrato'::text as fonte,
  k.representante_id,
  k.data_venda as data_fato,
  1::bigint as quantidade,
  k.id as contrato_id
from public.representante_contratos k
cross join corte c
where k.cancelado_em is null
  and c.data_corte is not null
  and k.data_venda >= c.data_corte;

-- =====================================================================
-- 5) RLS e permissões (padrão da casa: anon sem acesso, admin verificado)
-- =====================================================================
alter table public.importacao_frentes enable row level security;
alter table public.importacao_lotes enable row level security;
alter table public.importacao_linhas enable row level security;
alter table public.representante_contratos enable row level security;
alter table public.producao_corte enable row level security;

grant select on public.importacao_frentes to authenticated;
grant select on public.importacao_lotes to authenticated;
grant select on public.importacao_linhas to authenticated;
grant select on public.representante_contratos to authenticated;
grant select on public.producao_corte to authenticated;
grant select on public.v_producao_representantes_unificada to authenticated;

grant all on public.importacao_frentes to service_role;
grant all on public.importacao_lotes to service_role;
grant all on public.importacao_linhas to service_role;
grant all on public.representante_contratos to service_role;
grant all on public.producao_corte to service_role;
grant select on public.v_producao_representantes_unificada to service_role;

revoke all on public.importacao_frentes from anon;
revoke all on public.importacao_lotes from anon;
revoke all on public.importacao_linhas from anon;
revoke all on public.representante_contratos from anon;
revoke all on public.producao_corte from anon;
revoke all on public.v_producao_representantes_unificada from anon;

-- Escrita só por RPC transacional.
revoke insert, update, delete, truncate on public.importacao_frentes from authenticated;
revoke insert, update, delete, truncate on public.importacao_lotes from authenticated;
revoke insert, update, delete, truncate on public.importacao_linhas from authenticated;
revoke insert, update, delete, truncate on public.representante_contratos from authenticated;
revoke insert, update, delete, truncate on public.producao_corte from authenticated;

do $policies$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'importacao_frentes', 'importacao_lotes', 'importacao_linhas',
    'representante_contratos', 'producao_corte'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_tabela || '_select_admin', v_tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_role(auth.uid(), ''admin''))',
      v_tabela || '_select_admin', v_tabela
    );
  end loop;
end;
$policies$;

-- =====================================================================
-- 6) Confirmação transacional da importação de Representantes
--    Preview não grava nada: esta função é chamada só na confirmação.
--    Tudo ocorre em uma única transação: falha técnica não deixa lote válido.
-- =====================================================================
create or replace function public.confirmar_importacao_representantes(
  p_nome_arquivo text,
  p_hash_arquivo text,
  p_tamanho_bytes bigint,
  p_total_linhas integer,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote uuid;
  v_linha jsonb;
  v_payload jsonb;
  v_numero integer;
  v_motivo text;
  v_status text;
  v_chave text;
  v_codigo text;
  v_rep uuid;
  v_data date;
  v_importadas integer := 0;
  v_duplicadas integer := 0;
  v_rejeitadas integer := 0;
  v_existe boolean;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado.';
  end if;
  if p_hash_arquivo !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash do arquivo inválido.';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Conteúdo da importação inválido.';
  end if;

  if exists (
    select 1 from public.importacao_lotes l
    where l.frente = 'representantes'
      and l.hash_arquivo = p_hash_arquivo
      and l.status = 'confirmado'
  ) then
    raise exception 'Este arquivo já foi importado e confirmado anteriormente.';
  end if;

  insert into public.importacao_lotes (
    frente, tipo_importacao, nome_arquivo, hash_arquivo, tamanho_bytes,
    status, confirmado_em, criado_por, total_linhas
  ) values (
    'representantes', 'contratos_representantes', btrim(p_nome_arquivo), p_hash_arquivo,
    p_tamanho_bytes, 'confirmado', now(), auth.uid(), greatest(coalesce(p_total_linhas, 0), 0)
  )
  returning id into v_lote;

  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    v_payload := v_linha -> 'payload';
    v_numero := coalesce((v_linha ->> 'numero_linha')::integer, 0);
    v_motivo := nullif(btrim(coalesce(v_linha ->> 'motivo_rejeicao', '')), '');
    v_status := null;
    v_chave := null;

    if v_numero <= 0 then
      raise exception 'Número de linha inválido na importação.';
    end if;

    if v_motivo is null and v_payload is not null then
      -- Revalidação no servidor (o cliente nunca é a autoridade).
      v_codigo := upper(btrim(coalesce(v_payload ->> 'codigo_contrato', '')));
      v_rep := nullif(v_payload ->> 'representante_id', '')::uuid;
      begin
        v_data := nullif(v_payload ->> 'data_venda', '')::date;
      exception when others then
        v_data := null;
      end;

      if v_codigo = '' then
        v_motivo := 'Código do contrato ausente.';
      elsif v_rep is null then
        v_motivo := 'Representante não resolvido.';
      elsif v_data is null then
        v_motivo := 'Data da venda ausente ou inválida.';
      elsif not exists (select 1 from public.representantes r where r.id = v_rep) then
        v_motivo := 'Representante inexistente.';
      elsif (v_payload ->> 'premiavel') is null then
        v_motivo := 'Campo "Premiável?" ausente.';
      elsif (v_payload ->> 'premiavel')::boolean is false
            and btrim(coalesce(v_payload ->> 'motivo_nao_premiavel_origem', '')) = '' then
        v_motivo := 'Motivo obrigatório quando não premiável.';
      elsif (v_payload ->> 'possui_pendencia') is null then
        v_motivo := 'Campo "Pendência?" ausente.';
      elsif (v_payload ->> 'possui_pendencia')::boolean is true
            and btrim(coalesce(v_payload ->> 'tipo_pendencia_origem', '')) = '' then
        v_motivo := 'Tipo de pendência obrigatório.';
      elsif (v_payload ->> 'pago_informado_origem') is null then
        v_motivo := 'Campo "Pago?" ausente.';
      end if;
    elsif v_motivo is null then
      v_motivo := 'Linha sem conteúdo processável.';
    end if;

    if v_motivo is not null then
      v_status := 'rejeitada';
      v_rejeitadas := v_rejeitadas + 1;
    else
      v_chave := v_codigo || '|' || v_rep::text || '|' || v_data::text;

      select exists (
        select 1 from public.representante_contratos k
        where k.codigo_contrato_norm = v_codigo
          and k.representante_id = v_rep
          and k.data_venda = v_data
          and k.cancelado_em is null
      ) into v_existe;

      if v_existe then
        v_status := 'duplicada';
        v_duplicadas := v_duplicadas + 1;
      else
        insert into public.representante_contratos (
          data_venda, representante_id, codigo_cliente, cnpj, codigo_contrato,
          tipo_contrato_origem, premiavel, motivo_nao_premiavel_origem,
          possui_pendencia, tipo_pendencia_origem,
          pago_informado_origem, tipo_pagamento_informado_origem,
          importacao_lote_id, criado_por
        ) values (
          v_data,
          v_rep,
          nullif(btrim(coalesce(v_payload ->> 'codigo_cliente', '')), ''),
          nullif(btrim(coalesce(v_payload ->> 'cnpj', '')), ''),
          btrim(v_payload ->> 'codigo_contrato'),
          nullif(btrim(coalesce(v_payload ->> 'tipo_contrato_origem', '')), ''),
          (v_payload ->> 'premiavel')::boolean,
          nullif(btrim(coalesce(v_payload ->> 'motivo_nao_premiavel_origem', '')), ''),
          (v_payload ->> 'possui_pendencia')::boolean,
          nullif(btrim(coalesce(v_payload ->> 'tipo_pendencia_origem', '')), ''),
          (v_payload ->> 'pago_informado_origem')::boolean,
          nullif(btrim(coalesce(v_payload ->> 'tipo_pagamento_informado_origem', '')), ''),
          v_lote,
          auth.uid()
        );
        v_status := 'importada';
        v_importadas := v_importadas + 1;
      end if;
    end if;

    insert into public.importacao_linhas (
      lote_id, numero_linha, hash_linha, status, chave_negocio, motivo_rejeicao, payload
    ) values (
      v_lote, v_numero, nullif(btrim(coalesce(v_linha ->> 'hash_linha', '')), ''),
      v_status, v_chave, v_motivo, v_payload
    );
  end loop;

  update public.importacao_lotes
     set linhas_importadas = v_importadas,
         linhas_duplicadas = v_duplicadas,
         linhas_rejeitadas = v_rejeitadas,
         linhas_validas = v_importadas + v_duplicadas
   where id = v_lote;

  return jsonb_build_object(
    'lote_id', v_lote,
    'importadas', v_importadas,
    'duplicadas', v_duplicadas,
    'rejeitadas', v_rejeitadas
  );
end;
$$;

-- Cancelamento rastreável de contrato (correção sem perda de histórico).
create or replace function public.cancelar_contrato_representante(
  p_contrato_id uuid,
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

  update public.representante_contratos k
     set cancelado_em = now(),
         cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where k.id = p_contrato_id
     and k.cancelado_em is null;

  if not found then
    raise exception 'Contrato inexistente ou já cancelado.';
  end if;
end;
$$;

-- Definição administrativa da data de corte (nunca automática).
create or replace function public.definir_corte_producao(
  p_frente text,
  p_data_corte date
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
  if not exists (select 1 from public.importacao_frentes f where f.codigo = p_frente) then
    raise exception 'Frente inexistente.';
  end if;

  insert into public.producao_corte (frente, data_corte, definido_em, definido_por)
  values (p_frente, p_data_corte, now(), auth.uid())
  on conflict (frente) do update
    set data_corte = excluded.data_corte,
        definido_em = now(),
        definido_por = auth.uid();
end;
$$;

revoke all on function public.confirmar_importacao_representantes(text, text, bigint, integer, jsonb)
  from public, anon;
revoke all on function public.cancelar_contrato_representante(uuid, text) from public, anon;
revoke all on function public.definir_corte_producao(text, date) from public, anon;
revoke all on function public.f_contratos_imutavel() from public, anon, authenticated;
revoke all on function public.f_representante_codigo_imutavel() from public, anon, authenticated;

grant execute on function public.confirmar_importacao_representantes(text, text, bigint, integer, jsonb)
  to authenticated;
grant execute on function public.cancelar_contrato_representante(uuid, text) to authenticated;
grant execute on function public.definir_corte_producao(text, date) to authenticated;
