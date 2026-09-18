-- Painel de Gestão DS3 — Fase 8
-- Segundo perfil de acesso: OPERAÇÃO (Mariucha).
--
-- Decisão do gestor: a operação enxerga e opera todos os módulos do sistema,
-- mas não administra o próprio sistema (concessão de papéis continua sendo
-- operação de banco, fora do alcance da aplicação — nunca houve policy de
-- escrita em user_roles para usuários autenticados).
--
-- Como foi feito: a checagem de permissão das RPCs e policies deixa de ser
-- "é admin" e passa a ser "pode operar" (admin OU operação). A função
-- has_role continua com semântica ESTRITA (responde sobre um papel exato) e
-- segue disponível para quando existir algo restrito só ao administrador.
--
-- Este arquivo foi gerado a partir das funções já aplicadas (0002-0007),
-- trocando apenas a linha da checagem — o restante do corpo é idêntico.
-- Todas as funções usam CREATE OR REPLACE, preservando os grants existentes.
-- Não altera migrations anteriores.

-- =====================================================================
-- 0) Preflight
-- =====================================================================
do $preflight$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    raise exception 'Migration abortada: enum app_role não existe (aplicar 0001 antes).';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'representante_liderancas'
  ) then
    raise exception 'Migration abortada: aplicar 0006 antes.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'representantes'
      and column_name = 'valor_premiacao_contrato'
  ) then
    raise exception 'Migration abortada: aplicar 0007 antes.';
  end if;
end
$preflight$;

-- =====================================================================
-- 1) Novo papel
-- =====================================================================
-- SE ESTA LINHA FALHAR com "ALTER TYPE ... cannot run inside a transaction
-- block": rode APENAS esta linha sozinha primeiro, e depois o restante do
-- arquivo numa segunda execução. O resto do script não referencia o valor
-- novo do enum (a comparação é feita por texto), então roda normalmente.
alter type public.app_role add value if not exists 'operacao';

-- =====================================================================
-- 2) Checagem de permissão operacional
-- Compara o papel como texto de propósito: assim este script não precisa
-- referenciar o valor recém-criado do enum na mesma transação.
-- =====================================================================
create or replace function public.pode_operar(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('admin', 'operacao')
  )
$fn$;

revoke all on function public.pode_operar(uuid) from public, anon;
grant execute on function public.pode_operar(uuid) to authenticated;

comment on function public.pode_operar(uuid) is
  'Permissão operacional: administrador ou operação. Usada por RPCs e policies. Para checar um papel exato, usar has_role.';


-- =====================================================================
-- 3) RPCs passam a aceitar a operação
-- =====================================================================

create or replace function public.atualizar_valores_representante(
  p_representante_id uuid,
  p_valor_premiacao_contrato numeric,
  p_valor_comissao_lideranca numeric,
  p_meta_minima_mensal integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;
  if p_valor_premiacao_contrato is not null and p_valor_premiacao_contrato < 0 then
    raise exception 'Valor da premiação por contrato não pode ser negativo.';
  end if;
  if p_valor_comissao_lideranca is not null and p_valor_comissao_lideranca < 0 then
    raise exception 'Valor da comissão de liderança não pode ser negativo.';
  end if;
  if p_meta_minima_mensal is not null and p_meta_minima_mensal <= 0 then
    raise exception 'Meta mínima mensal deve ser maior que zero.';
  end if;

  update public.representantes
     set valor_premiacao_contrato = p_valor_premiacao_contrato,
         valor_comissao_lideranca = p_valor_comissao_lideranca,
         meta_minima_mensal = p_meta_minima_mensal
   where id = p_representante_id;
end;
$$;

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
  if not public.pode_operar(auth.uid()) then
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
  if not public.pode_operar(auth.uid()) then
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
  if not public.pode_operar(auth.uid()) then
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

create or replace function public.criar_representante(
  p_codigo text,
  p_nome text,
  p_supervisor_id uuid,
  p_data_cadastro date default current_date,
  p_observacao text default null,
  p_valor_premiacao_contrato numeric default null,
  p_valor_comissao_lideranca numeric default null,
  p_meta_minima_mensal integer default null
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
  if not public.pode_operar(auth.uid()) then
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
  if p_valor_premiacao_contrato is not null and p_valor_premiacao_contrato < 0 then
    raise exception 'Valor da premiação por contrato não pode ser negativo.';
  end if;
  if p_valor_comissao_lideranca is not null and p_valor_comissao_lideranca < 0 then
    raise exception 'Valor da comissão de liderança não pode ser negativo.';
  end if;
  if p_meta_minima_mensal is not null and p_meta_minima_mensal <= 0 then
    raise exception 'Meta mínima mensal deve ser maior que zero.';
  end if;

  select s.nome into v_supervisor from public.supervisores s where s.id = p_supervisor_id;
  if v_supervisor is null then
    raise exception 'Supervisor inexistente.';
  end if;

  insert into public.representantes (
    codigo, nome, data_cadastro, observacao, created_by,
    valor_premiacao_contrato, valor_comissao_lideranca, meta_minima_mensal
  )
  values (
    v_codigo, btrim(p_nome), coalesce(p_data_cadastro, current_date),
    nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid(),
    p_valor_premiacao_contrato, p_valor_comissao_lideranca, p_meta_minima_mensal
  )
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
  if not public.pode_operar(auth.uid()) then
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
  if not public.pode_operar(auth.uid()) then
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
  if not public.pode_operar(auth.uid()) then
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

create or replace function public.f_prefeitura_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
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
  if not public.pode_operar(auth.uid()) then
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
-- 4) Policies de leitura/escrita passam a aceitar a operação
-- =====================================================================

drop policy if exists "supervisores_select_admin" on public.supervisores;
create policy "supervisores_select_admin"
  on public.supervisores for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "representantes_select_admin" on public.representantes;
create policy "representantes_select_admin"
  on public.representantes for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "representante_vinculos_select_admin" on public.representante_vinculos;
create policy "representante_vinculos_select_admin"
  on public.representante_vinculos for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "representante_eventos_select_admin" on public.representante_eventos;
create policy "representante_eventos_select_admin"
  on public.representante_eventos for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "producoes_select_admin" on public.producoes;
create policy "producoes_select_admin"
  on public.producoes for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "producoes_insert_admin" on public.producoes;
create policy "producoes_insert_admin"
  on public.producoes for insert
  to authenticated
  with check (public.pode_operar(auth.uid()) and created_by = auth.uid());

drop policy if exists "metas_select_admin" on public.metas;
create policy "metas_select_admin"
  on public.metas for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "metas_insert_admin" on public.metas;
create policy "metas_insert_admin"
  on public.metas for insert
  to authenticated
  with check (public.pode_operar(auth.uid()) and created_by = auth.uid());

drop policy if exists "prefeituras_select_admin" on public.prefeituras;
create policy "prefeituras_select_admin"
  on public.prefeituras for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_contatos_select_admin" on public.prefeitura_contatos;
create policy "prefeitura_contatos_select_admin"
  on public.prefeitura_contatos for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_contatos_insert_admin" on public.prefeitura_contatos;
create policy "prefeitura_contatos_insert_admin"
  on public.prefeitura_contatos for insert
  to authenticated
  with check (public.pode_operar(auth.uid()) and created_by = auth.uid());

drop policy if exists "prefeitura_contatos_update_admin" on public.prefeitura_contatos;
create policy "prefeitura_contatos_update_admin"
  on public.prefeitura_contatos for update
  to authenticated
  using (public.pode_operar(auth.uid()))
  with check (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_oportunidades_select_admin" on public.prefeitura_oportunidades;
create policy "prefeitura_oportunidades_select_admin"
  on public.prefeitura_oportunidades for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_movimentos_select_admin" on public.prefeitura_movimentos;
create policy "prefeitura_movimentos_select_admin"
  on public.prefeitura_movimentos for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_interacoes_select_admin" on public.prefeitura_interacoes;
create policy "prefeitura_interacoes_select_admin"
  on public.prefeitura_interacoes for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_interacoes_insert_admin" on public.prefeitura_interacoes;
create policy "prefeitura_interacoes_insert_admin"
  on public.prefeitura_interacoes for insert
  to authenticated
  with check (public.pode_operar(auth.uid()) and created_by = auth.uid());

drop policy if exists "prefeitura_contratos_select_admin" on public.prefeitura_contratos;
create policy "prefeitura_contratos_select_admin"
  on public.prefeitura_contratos for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_metas_select_admin" on public.prefeitura_metas;
create policy "prefeitura_metas_select_admin"
  on public.prefeitura_metas for select
  to authenticated
  using (public.pode_operar(auth.uid()));

drop policy if exists "prefeitura_metas_insert_admin" on public.prefeitura_metas;
create policy "prefeitura_metas_insert_admin"
  on public.prefeitura_metas for insert
  to authenticated
  with check (public.pode_operar(auth.uid()) and created_by = auth.uid());

drop policy if exists "representante_liderancas_select_admin" on public.representante_liderancas;
create policy "representante_liderancas_select_admin"
  on public.representante_liderancas for select
  to authenticated
  using (public.pode_operar(auth.uid()));


-- Tabelas de importação (policies criadas em laço na migration 0005)
do $importacao$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'importacao_frentes', 'importacao_lotes', 'importacao_linhas',
    'representante_contratos', 'producao_corte'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_tabela || '_select_admin', v_tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pode_operar(auth.uid()))',
      v_tabela || '_select_admin', v_tabela
    );
  end loop;
end
$importacao$;
