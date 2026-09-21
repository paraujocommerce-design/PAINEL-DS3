-- Painel de Gestão DS3 — Fase 10 (etapa 2 da regra de premiação)
-- Cadastro MANUAL de contrato, com valor do plano e cálculo da premiação.
--
-- O que muda:
--   * contrato deixa de exigir um lote de importação (passa a ter origem
--     'manual' ou 'importacao');
--   * nome fantasia do cliente;
--   * valor do plano (mensalidade) — base do incentivo comercial de 10%;
--   * premiação do representante e comissão do líder gravadas NO contrato,
--     com o desconto aplicado, se houver;
--   * listas configuráveis para status do pós-venda, tipo de pendência e
--     motivo de não premiável (hoje texto livre na planilha, o que impede
--     contagem confiável).
--
-- Regra preservada: o valor efetivo fica gravado no contrato. Alterar depois
-- o valor padrão do representante NÃO altera contratos já lançados.
-- Regra documentada em docs/regra-premiacao-representantes.md
-- Não altera migrations anteriores.

-- =====================================================================
-- 0) Preflight
-- =====================================================================
do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'representantes'
      and column_name = 'valor_premiacao_contrato'
  ) then
    raise exception 'Migration abortada: aplicar 0007 antes.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pode_operar'
  ) then
    raise exception 'Migration abortada: aplicar 0008 antes.';
  end if;
end
$preflight$;

-- =====================================================================
-- 1) Listas configuráveis (o gestor edita sem precisar de migration)
-- =====================================================================
create table if not exists public.opcoes_cadastro (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in (
    'status_pos_venda', 'tipo_pendencia', 'motivo_nao_premiavel'
  )),
  codigo text not null check (btrim(codigo) <> ''),
  rotulo text not null check (btrim(rotulo) <> ''),
  ordem integer not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (categoria, codigo)
);

grant select on public.opcoes_cadastro to authenticated;
grant all on public.opcoes_cadastro to service_role;
alter table public.opcoes_cadastro enable row level security;

drop policy if exists "opcoes_cadastro_select" on public.opcoes_cadastro;
create policy "opcoes_cadastro_select"
  on public.opcoes_cadastro for select
  to authenticated
  using (public.pode_operar(auth.uid()));

revoke all on public.opcoes_cadastro from anon;
revoke delete, insert, update, truncate on public.opcoes_cadastro from authenticated;

-- Valores iniciais extraídos da planilha real de vendas da operação.
insert into public.opcoes_cadastro (categoria, codigo, rotulo, ordem) values
  ('status_pos_venda', 'ok', 'Pós-venda OK', 10),
  ('status_pos_venda', 'nao_ok', 'Pós-venda não OK', 20),
  ('status_pos_venda', 'aguardando_feedback', 'Aguardando feedback', 30),
  ('status_pos_venda', 'documentacao_reprovada', 'Documentação reprovada', 40),
  ('status_pos_venda', 'nao_realizado', 'Não realizado', 50),

  ('tipo_pendencia', 'documento_contrato', 'Documento do contrato', 10),
  ('tipo_pendencia', 'documento_titular', 'Documento do titular', 20),
  ('tipo_pendencia', 'assinatura', 'Assinatura divergente / falta assinatura', 30),
  ('tipo_pendencia', 'protocolo', 'Protocolo', 40),
  ('tipo_pendencia', 'sem_contato', 'Sem contato com o cliente', 50),
  ('tipo_pendencia', 'preenchimento', 'Preenchimento incompleto', 60),
  ('tipo_pendencia', 'multiplas', 'Múltiplas pendências', 70),

  ('motivo_nao_premiavel', 'cancelamento', 'Cancelamento', 10),
  ('motivo_nao_premiavel', 'nao_comercializavel', 'Não comercializável', 20),
  ('motivo_nao_premiavel', 'documentacao_reprovada', 'Documentação reprovada', 30),
  ('motivo_nao_premiavel', 'debito_anterior', 'Débito anterior do cliente', 40),
  ('motivo_nao_premiavel', 'outro', 'Outro (descrever)', 90)
on conflict (categoria, codigo) do nothing;

-- =====================================================================
-- 2) Contrato: origem manual, cliente, valor do plano e premiação
-- =====================================================================
alter table public.representante_contratos
  alter column importacao_lote_id drop not null;

alter table public.representante_contratos
  add column if not exists origem text not null default 'importacao'
    check (origem in ('importacao', 'manual')),
  add column if not exists nome_fantasia text,
  add column if not exists valor_plano numeric(12,2)
    check (valor_plano is null or valor_plano >= 0),
  add column if not exists status_pos_venda text,
  add column if not exists observacao text,
  -- Premiação do representante NESTE contrato (fato imutável após gravado)
  add column if not exists valor_premiacao numeric(12,2)
    check (valor_premiacao is null or valor_premiacao >= 0),
  add column if not exists desconto_premiacao numeric(12,2) not null default 0
    check (desconto_premiacao >= 0),
  add column if not exists motivo_desconto_premiacao text,
  -- Comissão do líder vigente na data do contrato
  add column if not exists lider_id uuid references public.representantes(id) on delete restrict,
  add column if not exists valor_comissao_lideranca numeric(12,2)
    check (valor_comissao_lideranca is null or valor_comissao_lideranca >= 0),
  add column if not exists desconto_comissao_lideranca numeric(12,2) not null default 0
    check (desconto_comissao_lideranca >= 0),
  add column if not exists motivo_desconto_comissao text;

-- Contrato importado exige lote; contrato manual nunca tem lote.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contratos_origem_lote') then
    alter table public.representante_contratos
      add constraint contratos_origem_lote
      check (
        (origem = 'importacao' and importacao_lote_id is not null)
        or (origem = 'manual' and importacao_lote_id is null)
      );
  end if;

  -- Desconto nunca pode superar o valor a que se refere.
  if not exists (select 1 from pg_constraint where conname = 'contratos_desconto_premiacao_limite') then
    alter table public.representante_contratos
      add constraint contratos_desconto_premiacao_limite
      check (desconto_premiacao = 0 or desconto_premiacao <= coalesce(valor_premiacao, 0));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contratos_desconto_comissao_limite') then
    alter table public.representante_contratos
      add constraint contratos_desconto_comissao_limite
      check (desconto_comissao_lideranca = 0
             or desconto_comissao_lideranca <= coalesce(valor_comissao_lideranca, 0));
  end if;

  -- Desconto exige justificativa: dinheiro retido sem motivo é dado sem rastro.
  if not exists (select 1 from pg_constraint where conname = 'contratos_desconto_premiacao_motivo') then
    alter table public.representante_contratos
      add constraint contratos_desconto_premiacao_motivo
      check (desconto_premiacao = 0 or btrim(coalesce(motivo_desconto_premiacao, '')) <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contratos_desconto_comissao_motivo') then
    alter table public.representante_contratos
      add constraint contratos_desconto_comissao_motivo
      check (desconto_comissao_lideranca = 0
             or btrim(coalesce(motivo_desconto_comissao, '')) <> '');
  end if;
end
$$;

comment on column public.representante_contratos.valor_plano is
  'Mensalidade do plano vendido. Base do incentivo comercial de 10% sobre a carteira ativa.';
comment on column public.representante_contratos.valor_premiacao is
  'Valor que o representante recebe por ESTE contrato, já decidido no lançamento. Independente de mudanças futuras no cadastro dele.';
comment on column public.representante_contratos.lider_id is
  'Líder vigente na data do contrato. Gravado no lançamento — trocar a equipe depois não altera contratos passados.';

-- O trigger de imutabilidade (0005) protege os campos de origem. Os valores
-- financeiros acima são gravados no lançamento e seguem a mesma regra:
-- correção se faz por cancelamento + novo lançamento, nunca por edição.

-- =====================================================================
-- 3) Valor líquido a pagar (view de apoio — fonte única de cálculo)
-- =====================================================================
create or replace view public.v_contratos_premiacao
with (security_invoker = on) as
select
  c.id,
  c.data_venda,
  c.codigo_contrato,
  c.nome_fantasia,
  c.cnpj,
  c.valor_plano,
  c.representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  c.premiavel,
  c.valor_premiacao,
  c.desconto_premiacao,
  case when c.premiavel
    then greatest(coalesce(c.valor_premiacao, 0) - c.desconto_premiacao, 0)
    else 0
  end as premiacao_liquida,
  c.lider_id,
  l.codigo as lider_codigo,
  l.nome as lider_nome,
  c.valor_comissao_lideranca,
  c.desconto_comissao_lideranca,
  case when c.premiavel and c.lider_id is not null
    then greatest(coalesce(c.valor_comissao_lideranca, 0) - c.desconto_comissao_lideranca, 0)
    else 0
  end as comissao_lideranca_liquida,
  c.possui_pendencia,
  c.tipo_pendencia_origem,
  c.status_pos_venda,
  c.origem,
  c.cancelado_em
from public.representante_contratos c
join public.representantes r on r.id = c.representante_id
left join public.representantes l on l.id = c.lider_id
where c.cancelado_em is null;

-- =====================================================================
-- 4) RPC de cadastro manual de contrato
-- =====================================================================
create or replace function public.cadastrar_contrato_representante(
  p_representante_id uuid,
  p_data_venda date,
  p_codigo_contrato text,
  p_nome_fantasia text default null,
  p_cnpj text default null,
  p_codigo_cliente text default null,
  p_valor_plano numeric default null,
  p_premiavel boolean default true,
  p_motivo_nao_premiavel text default null,
  p_possui_pendencia boolean default false,
  p_tipo_pendencia text default null,
  p_status_pos_venda text default null,
  p_valor_premiacao numeric default null,
  p_desconto_premiacao numeric default 0,
  p_motivo_desconto_premiacao text default null,
  p_desconto_comissao numeric default 0,
  p_motivo_desconto_comissao text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_codigo text := upper(btrim(coalesce(p_codigo_contrato, '')));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_premiacao numeric;
  v_lider_id uuid;
  v_comissao numeric;
  v_desconto_prem numeric := coalesce(p_desconto_premiacao, 0);
  v_desconto_com numeric := coalesce(p_desconto_comissao, 0);
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  if v_codigo = '' then
    raise exception 'Informe o código do contrato.';
  end if;
  if p_data_venda is null then
    raise exception 'Informe a data da venda.';
  end if;
  if p_data_venda > current_date then
    raise exception 'A data da venda não pode ser futura.';
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;
  if v_cnpj is not null and v_cnpj !~ '^[0-9]{14}$' then
    raise exception 'CNPJ deve conter 14 dígitos.';
  end if;
  if not p_premiavel and btrim(coalesce(p_motivo_nao_premiavel, '')) = '' then
    raise exception 'Contrato não premiável exige o motivo.';
  end if;
  if p_possui_pendencia and btrim(coalesce(p_tipo_pendencia, '')) = '' then
    raise exception 'Contrato com pendência exige o tipo de pendência.';
  end if;

  -- Deduplicação: mesma chave de negócio da importação (0005).
  if exists (
    select 1 from public.representante_contratos k
     where k.codigo_contrato_norm = v_codigo
       and k.representante_id = p_representante_id
       and k.data_venda = p_data_venda
       and k.cancelado_em is null
  ) then
    raise exception 'Já existe um contrato % para este representante nesta data.', v_codigo;
  end if;

  -- Premiação: usa o valor informado; se omitido, cai no padrão do cadastro.
  select coalesce(p_valor_premiacao, r.valor_premiacao_contrato)
    into v_premiacao
    from public.representantes r
   where r.id = p_representante_id;

  -- Líder vigente NA DATA DA VENDA (não o de hoje).
  select l.lider_id into v_lider_id
    from public.representante_liderancas l
   where l.representante_id = p_representante_id
     and l.inicio <= p_data_venda
     and (l.fim is null or l.fim >= p_data_venda)
   limit 1;

  if v_lider_id is not null then
    select r.valor_comissao_lideranca into v_comissao
      from public.representantes r
     where r.id = v_lider_id;
  end if;

  if v_desconto_prem > 0 and v_desconto_prem > coalesce(v_premiacao, 0) then
    raise exception 'Desconto (%) maior que a premiação do contrato (%).',
      v_desconto_prem, coalesce(v_premiacao, 0);
  end if;
  if v_desconto_com > 0 and v_desconto_com > coalesce(v_comissao, 0) then
    raise exception 'Desconto da comissão (%) maior que a comissão de liderança (%).',
      v_desconto_com, coalesce(v_comissao, 0);
  end if;

  insert into public.representante_contratos (
    data_venda, representante_id, codigo_cliente, cnpj, codigo_contrato,
    nome_fantasia, valor_plano, premiavel, motivo_nao_premiavel_origem,
    possui_pendencia, tipo_pendencia_origem, status_pos_venda,
    pago_informado_origem, origem, importacao_lote_id, observacao,
    valor_premiacao, desconto_premiacao, motivo_desconto_premiacao,
    lider_id, valor_comissao_lideranca, desconto_comissao_lideranca,
    motivo_desconto_comissao, criado_por
  )
  values (
    p_data_venda, p_representante_id,
    nullif(btrim(coalesce(p_codigo_cliente, '')), ''), v_cnpj, v_codigo,
    nullif(btrim(coalesce(p_nome_fantasia, '')), ''), p_valor_plano,
    p_premiavel, nullif(btrim(coalesce(p_motivo_nao_premiavel, '')), ''),
    p_possui_pendencia, nullif(btrim(coalesce(p_tipo_pendencia, '')), ''),
    nullif(btrim(coalesce(p_status_pos_venda, '')), ''),
    false, 'manual', null, nullif(btrim(coalesce(p_observacao, '')), ''),
    v_premiacao, v_desconto_prem,
    nullif(btrim(coalesce(p_motivo_desconto_premiacao, '')), ''),
    v_lider_id, v_comissao, v_desconto_com,
    nullif(btrim(coalesce(p_motivo_desconto_comissao, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.cadastrar_contrato_representante(
  uuid, date, text, text, text, text, numeric, boolean, text, boolean, text,
  text, numeric, numeric, text, numeric, text, text
) from public, anon;
grant execute on function public.cadastrar_contrato_representante(
  uuid, date, text, text, text, text, numeric, boolean, text, boolean, text,
  text, numeric, numeric, text, numeric, text, text
) to authenticated;

-- =====================================================================
-- 5) Imutabilidade ajustada: completar dado que falta ≠ reescrever história
-- =====================================================================
-- A planilha de vendas não traz CNPJ. Esses contratos entram sem o documento
-- e a operação completa depois — PREENCHER um campo vazio é permitido.
-- TROCAR um valor já preenchido continua proibido, como antes.
-- Os valores financeiros gravados no lançamento passam a ser imutáveis
-- também: correção se faz por cancelamento e novo lançamento.
create or replace function public.f_contratos_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contrato é fato histórico: use o cancelamento rastreável.';
  end if;

  if new.id is distinct from old.id
     or new.data_venda is distinct from old.data_venda
     or new.representante_id is distinct from old.representante_id
     or new.codigo_contrato is distinct from old.codigo_contrato
     or new.premiavel is distinct from old.premiavel
     or new.possui_pendencia is distinct from old.possui_pendencia
     or new.pago_informado_origem is distinct from old.pago_informado_origem
     or new.tipo_pagamento_informado_origem is distinct from old.tipo_pagamento_informado_origem
     or new.importacao_lote_id is distinct from old.importacao_lote_id
     or new.origem is distinct from old.origem
     or new.criado_em is distinct from old.criado_em
     or new.criado_por is distinct from old.criado_por then
    raise exception 'Contrato não pode ser reescrito.';
  end if;

  -- Valores financeiros decididos no lançamento não mudam depois.
  if new.valor_premiacao is distinct from old.valor_premiacao
     or new.desconto_premiacao is distinct from old.desconto_premiacao
     or new.lider_id is distinct from old.lider_id
     or new.valor_comissao_lideranca is distinct from old.valor_comissao_lideranca
     or new.desconto_comissao_lideranca is distinct from old.desconto_comissao_lideranca then
    raise exception 'Valores de premiação do contrato não podem ser alterados. Cancele o contrato e lance novamente.';
  end if;

  -- CNPJ, código do cliente e nome do cliente: só podem ser PREENCHIDOS.
  if old.cnpj is not null and new.cnpj is distinct from old.cnpj then
    raise exception 'CNPJ já informado não pode ser alterado.';
  end if;
  if old.codigo_cliente is not null and new.codigo_cliente is distinct from old.codigo_cliente then
    raise exception 'Código do cliente já informado não pode ser alterado.';
  end if;

  if old.cancelado_em is not null
     and (new.cancelado_em is distinct from old.cancelado_em
          or new.cancelado_por is distinct from old.cancelado_por
          or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Cancelamento já registrado não pode ser alterado nem estornado.';
  end if;

  return new;
end;
$fn$;

-- RPC para completar os dados que faltaram na importação.
create or replace function public.complementar_dados_contrato(
  p_contrato_id uuid,
  p_cnpj text default null,
  p_codigo_cliente text default null,
  p_nome_fantasia text default null,
  p_status_pos_venda text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_atual public.representante_contratos%rowtype;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  select * into v_atual from public.representante_contratos where id = p_contrato_id for update;
  if v_atual.id is null then
    raise exception 'Contrato inexistente.';
  end if;
  if v_atual.cancelado_em is not null then
    raise exception 'Contrato cancelado não pode ser complementado.';
  end if;
  if v_cnpj is not null and v_cnpj !~ '^[0-9]{14}$' then
    raise exception 'CNPJ deve conter 14 dígitos.';
  end if;
  if v_cnpj is not null and v_atual.cnpj is not null then
    raise exception 'Este contrato já tem CNPJ informado.';
  end if;

  update public.representante_contratos
     set cnpj = coalesce(v_cnpj, cnpj),
         codigo_cliente = coalesce(
           nullif(btrim(coalesce(p_codigo_cliente, '')), ''), codigo_cliente),
         nome_fantasia = coalesce(
           nullif(btrim(coalesce(p_nome_fantasia, '')), ''), nome_fantasia),
         status_pos_venda = coalesce(
           nullif(btrim(coalesce(p_status_pos_venda, '')), ''), status_pos_venda)
   where id = p_contrato_id;
end;
$fn$;

revoke all on function public.complementar_dados_contrato(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.complementar_dados_contrato(uuid, text, text, text, text)
  to authenticated;

comment on function public.complementar_dados_contrato(uuid, text, text, text, text) is
  'Completa dados que faltaram no lançamento (CNPJ, cliente, status). Só preenche o que está vazio — nunca sobrescreve valor já informado.';

-- Lista de contratos com dado faltando, para a operação completar.
create or replace view public.v_contratos_incompletos
with (security_invoker = on) as
select
  c.id,
  c.data_venda,
  c.codigo_contrato,
  c.nome_fantasia,
  c.cnpj,
  c.valor_plano,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  case when c.cnpj is null then 'CNPJ' end as falta_cnpj,
  case when c.nome_fantasia is null then 'Nome do cliente' end as falta_nome,
  case when c.valor_plano is null then 'Valor do plano' end as falta_valor_plano
from public.representante_contratos c
join public.representantes r on r.id = c.representante_id
where c.cancelado_em is null
  and (c.cnpj is null or c.nome_fantasia is null or c.valor_plano is null);
