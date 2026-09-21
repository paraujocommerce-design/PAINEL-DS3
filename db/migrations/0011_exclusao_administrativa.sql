-- Painel de Gestão DS3 — Fase 11
-- Exclusão definitiva, restrita ao ADMINISTRADOR.
--
-- Contexto: a arquitetura trata contrato e produção como fato histórico —
-- a correção normal é o cancelamento rastreável, que preserva o registro.
-- A pedido do gestor, o administrador (e somente ele) passa a poder excluir
-- de verdade: contratos, representantes, produções, metas e lotes inteiros
-- de importação.
--
-- Salvaguardas mantidas:
--   * a operação (Mariucha) NÃO exclui nada — segue só com cancelamento;
--   * toda exclusão fica registrada em exclusoes_auditoria, com quem fez,
--     quando e uma cópia do registro apagado;
--   * os triggers de imutabilidade continuam valendo para todo o resto:
--     só liberam DELETE quando a exclusão vem por estas funções.
-- Não altera migrations anteriores.

-- =====================================================================
-- 0) Preflight
-- =====================================================================
do $preflight$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pode_operar'
  ) then
    raise exception 'Migration abortada: aplicar 0008 antes.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'representante_contratos'
      and column_name = 'origem'
  ) then
    raise exception 'Migration abortada: aplicar 0010 antes.';
  end if;
end
$preflight$;

-- =====================================================================
-- 1) Auditoria de exclusões — o rastro que sobra do que foi apagado
-- =====================================================================
create table if not exists public.exclusoes_auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  descricao text not null,
  quantidade integer not null default 1,
  conteudo jsonb,
  excluido_em timestamptz not null default now(),
  excluido_por uuid references auth.users(id) on delete set null
);

create index if not exists exclusoes_auditoria_data_idx
  on public.exclusoes_auditoria (excluido_em desc);

grant select on public.exclusoes_auditoria to authenticated;
grant all on public.exclusoes_auditoria to service_role;
alter table public.exclusoes_auditoria enable row level security;

drop policy if exists "exclusoes_auditoria_select" on public.exclusoes_auditoria;
create policy "exclusoes_auditoria_select"
  on public.exclusoes_auditoria for select
  to authenticated
  using (public.pode_operar(auth.uid()));

revoke all on public.exclusoes_auditoria from anon;
revoke delete, insert, update, truncate on public.exclusoes_auditoria from authenticated;

-- =====================================================================
-- 2) Chave de liberação: DELETE só passa quando vem das funções abaixo
-- =====================================================================
create or replace function public.f_exclusao_autorizada()
returns boolean
language sql
stable
as $fn$
  select coalesce(current_setting('app.exclusao_admin', true), '') = 'on'
$fn$;

-- Contratos de representante
create or replace function public.f_contratos_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if public.f_exclusao_autorizada() then
      return old;  -- exclusão administrativa, já auditada pela função que a chamou
    end if;
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

  if new.valor_premiacao is distinct from old.valor_premiacao
     or new.desconto_premiacao is distinct from old.desconto_premiacao
     or new.lider_id is distinct from old.lider_id
     or new.valor_comissao_lideranca is distinct from old.valor_comissao_lideranca
     or new.desconto_comissao_lideranca is distinct from old.desconto_comissao_lideranca then
    raise exception 'Valores de premiação do contrato não podem ser alterados. Cancele o contrato e lance novamente.';
  end if;

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

-- Produções (base legada)
create or replace function public.f_producoes_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if public.f_exclusao_autorizada() then
      return old;
    end if;
    raise exception 'Produção não pode ser excluída. Use o cancelamento rastreável.';
  end if;

  if new.id is distinct from old.id
     or new.representante_id is distinct from old.representante_id
     or new.data_producao is distinct from old.data_producao
     or new.quantidade is distinct from old.quantidade
     or new.origem is distinct from old.origem
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Produção registrada não pode ser reescrita.';
  end if;

  if old.cancelada_em is not null
     and (new.cancelada_em is distinct from old.cancelada_em
          or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Cancelamento já registrado não pode ser alterado.';
  end if;

  return new;
end;
$fn$;

-- =====================================================================
-- 3) Funções de exclusão — exclusivas do administrador
-- =====================================================================
create or replace function public.f_exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas o administrador pode excluir registros.';
  end if;
end;
$fn$;

-- Excluir UM contrato
create or replace function public.excluir_contrato(p_contrato_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_registro jsonb;
  v_descricao text;
begin
  perform public.f_exigir_admin();

  select to_jsonb(c), 'Contrato ' || c.codigo_contrato || ' de ' || r.nome ||
         ' (' || c.data_venda || ')'
    into v_registro, v_descricao
    from public.representante_contratos c
    join public.representantes r on r.id = c.representante_id
   where c.id = p_contrato_id;

  if v_registro is null then
    raise exception 'Contrato inexistente.';
  end if;

  insert into public.exclusoes_auditoria (tabela, registro_id, descricao, conteudo, excluido_por)
  values ('representante_contratos', p_contrato_id, v_descricao, v_registro, auth.uid());

  perform set_config('app.exclusao_admin', 'on', true);
  delete from public.representante_contratos where id = p_contrato_id;
  perform set_config('app.exclusao_admin', 'off', true);
end;
$fn$;

-- Excluir um LOTE inteiro de importação (contratos + linhas + lote)
create or replace function public.excluir_lote_importacao(p_lote_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_qtd integer;
  v_arquivo text;
begin
  perform public.f_exigir_admin();

  select nome_arquivo into v_arquivo from public.importacao_lotes where id = p_lote_id;
  if v_arquivo is null then
    raise exception 'Lote de importação inexistente.';
  end if;

  select count(*) into v_qtd
    from public.representante_contratos where importacao_lote_id = p_lote_id;

  insert into public.exclusoes_auditoria
    (tabela, registro_id, descricao, quantidade, excluido_por)
  values ('importacao_lotes', p_lote_id,
          'Lote de importação "' || v_arquivo || '" e seus contratos', v_qtd, auth.uid());

  perform set_config('app.exclusao_admin', 'on', true);
  delete from public.representante_contratos where importacao_lote_id = p_lote_id;
  delete from public.importacao_linhas where lote_id = p_lote_id;
  delete from public.importacao_lotes where id = p_lote_id;
  perform set_config('app.exclusao_admin', 'off', true);

  return v_qtd;
end;
$fn$;

-- Excluir TODOS os contratos de um período (limpeza de carga errada)
create or replace function public.excluir_contratos_periodo(
  p_inicio date,
  p_fim date,
  p_somente_importados boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_qtd integer;
begin
  perform public.f_exigir_admin();
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Informe um período válido.';
  end if;

  select count(*) into v_qtd
    from public.representante_contratos
   where data_venda between p_inicio and p_fim
     and (not p_somente_importados or origem = 'importacao');

  if v_qtd = 0 then
    return 0;
  end if;

  insert into public.exclusoes_auditoria
    (tabela, descricao, quantidade, excluido_por)
  values ('representante_contratos',
          'Contratos de ' || p_inicio || ' a ' || p_fim ||
          case when p_somente_importados then ' (somente importados)' else ' (todos)' end,
          v_qtd, auth.uid());

  perform set_config('app.exclusao_admin', 'on', true);
  delete from public.representante_contratos
   where data_venda between p_inicio and p_fim
     and (not p_somente_importados or origem = 'importacao');
  perform set_config('app.exclusao_admin', 'off', true);

  return v_qtd;
end;
$fn$;

-- Excluir um representante (e tudo que depende dele)
create or replace function public.excluir_representante(p_representante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_registro jsonb;
  v_nome text;
  v_contratos integer;
begin
  perform public.f_exigir_admin();

  select to_jsonb(r), r.codigo || ' — ' || r.nome
    into v_registro, v_nome
    from public.representantes r where r.id = p_representante_id;
  if v_registro is null then
    raise exception 'Representante inexistente.';
  end if;

  select count(*) into v_contratos
    from public.representante_contratos where representante_id = p_representante_id;

  insert into public.exclusoes_auditoria
    (tabela, registro_id, descricao, quantidade, conteudo, excluido_por)
  values ('representantes', p_representante_id,
          'Representante ' || v_nome || ' e seus ' || v_contratos || ' contrato(s)',
          v_contratos + 1, v_registro, auth.uid());

  perform set_config('app.exclusao_admin', 'on', true);
  delete from public.representante_contratos where representante_id = p_representante_id;
  delete from public.producoes where representante_id = p_representante_id;
  delete from public.representante_liderancas
   where representante_id = p_representante_id or lider_id = p_representante_id;
  delete from public.representante_vinculos where representante_id = p_representante_id;
  delete from public.representante_eventos where representante_id = p_representante_id;
  delete from public.representantes where id = p_representante_id;
  perform set_config('app.exclusao_admin', 'off', true);
end;
$fn$;

-- Excluir uma meta
create or replace function public.excluir_meta(p_meta_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_registro jsonb;
begin
  perform public.f_exigir_admin();

  select to_jsonb(m) into v_registro from public.metas m where m.id = p_meta_id;
  if v_registro is null then
    raise exception 'Meta inexistente.';
  end if;

  insert into public.exclusoes_auditoria (tabela, registro_id, descricao, conteudo, excluido_por)
  values ('metas', p_meta_id, 'Meta cadastrada', v_registro, auth.uid());

  perform set_config('app.exclusao_admin', 'on', true);
  delete from public.metas where id = p_meta_id;
  perform set_config('app.exclusao_admin', 'off', true);
end;
$fn$;

-- =====================================================================
-- 4) Permissões: authenticated pode chamar; a função barra quem não é admin
-- =====================================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.excluir_contrato(uuid)',
    'public.excluir_lote_importacao(uuid)',
    'public.excluir_contratos_periodo(date, date, boolean)',
    'public.excluir_representante(uuid)',
    'public.excluir_meta(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

-- DELETE direto continua bloqueado para a aplicação: só pelas funções acima.
revoke delete on public.representante_contratos from authenticated;
revoke delete on public.representantes from authenticated;
revoke delete on public.producoes from authenticated;
revoke delete on public.metas from authenticated;

comment on table public.exclusoes_auditoria is
  'Rastro das exclusões definitivas feitas pelo administrador. Guarda quem apagou, quando e uma cópia do registro.';
