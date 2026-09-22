-- =====================================================================
-- 0016 — Perfis iguais no comercial e permissão explícita nas views
--
-- Duas correções:
--
-- 1) As migrations 0002 a 0005 concedem `grant select` explicitamente em
--    cada view que criam. As do financeiro (0012 a 0015) não faziam isso,
--    contando com a concessão automática do Supabase. Pior: a 0015
--    DERRUBA e recria v_ordens_pagamento — e view recriada perde as
--    permissões que tinha. Aqui a concessão volta a ser explícita, como
--    no resto do projeto.
--
-- 2) Berg e Mariucha passam a ter o mesmo acesso do gestor em contratos,
--    ordens de pagamento e representantes. A exclusão definitiva, que é
--    irreversível, continua só com a gerência.
-- =====================================================================

-- =====================================================================
-- 1) Supervisão passa a operar, não só olhar
-- Como `pode_operar` é a checagem usada em quase todo o sistema, incluir
-- supervisão aqui dá a Berg o mesmo acesso operacional da Mariucha de
-- uma vez — inclusive nas frentes fora do comercial, que compartilham
-- essa mesma porta.
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
      and role::text in ('admin', 'operacao', 'supervisao')
  )
$fn$;

-- =====================================================================
-- 2) Pagar, reabrir e dispensar deixam de ser exclusivos da gerência
-- O controle do dinheiro continua na cadeia de autorização: a ordem só
-- é paga com todas as instâncias exigidas concedidas. O que muda é quem
-- pode apertar o botão depois disso.
-- =====================================================================
drop function if exists public.pagar_ordem_pagamento(uuid, text, date, numeric, text);

create or replace function public.pagar_ordem_pagamento(
  p_ordem_id uuid,
  p_forma text,
  p_data date,
  p_valor numeric,
  p_comprovante text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_pendentes text;
  v_recusadas text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe o valor efetivamente pago.';
  end if;
  if p_data is null then
    raise exception 'Informe a data do pagamento.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'paga' then raise exception 'Ordem já está paga.'; end if;
  if v_status <> 'fechada' then
    raise exception 'A ordem precisa estar fechada e autorizada antes do pagamento (atual: %).', v_status;
  end if;

  select string_agg(instancia || ' (' || responsavel || ')', ', ' order by instancia)
    into v_recusadas
    from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and decisao = 'recusada';
  if v_recusadas is not null then
    raise exception 'Pagamento bloqueado — autorização recusada por %.', v_recusadas;
  end if;

  select string_agg(instancia || ' (' || responsavel || ')', ', ' order by instancia)
    into v_pendentes
    from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and decisao = 'pendente';
  if v_pendentes is not null then
    raise exception 'Faltam autorizações: %.', v_pendentes;
  end if;

  update public.ordens_pagamento
     set status = 'paga', pago_em = now(), pago_por = auth.uid(),
         forma_pagamento = p_forma,
         data_pagamento = p_data,
         valor_pago = p_valor,
         comprovante = nullif(btrim(coalesce(p_comprovante, '')), '')
   where id = p_ordem_id;
end;
$fn$;

create or replace function public.reabrir_ordem_pagamento(
  p_ordem_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'fechada' then
    raise exception 'Só uma ordem fechada pode ser reaberta (atual: %).', v_status;
  end if;

  update public.ordem_pagamento_autorizacoes
     set decisao = 'pendente', decidido_em = null, decidido_por = null,
         registrado_por = null, observacao = null
   where ordem_id = p_ordem_id;

  update public.ordens_pagamento
     set status = 'aberta', fechado_em = null, fechado_por = null,
         observacao = coalesce(observacao || chr(10), '') ||
           'Reaberta em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ': ' || btrim(p_motivo)
   where id = p_ordem_id;
end;
$fn$;

create or replace function public.remover_exigencia_autorizacao(
  p_ordem_id uuid,
  p_instancia text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_decisao text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  select decisao into v_decisao from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and instancia = p_instancia;
  if v_decisao is null then raise exception 'Autorização não exigida nesta ordem.'; end if;
  if v_decisao <> 'pendente' then
    raise exception 'Autorização já % — não pode ser dispensada.', v_decisao;
  end if;

  delete from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and instancia = p_instancia;
end;
$fn$;

-- Quem tem o papel da instância decide por si; os demais registram a
-- decisão de quem não usa o sistema (auditoria, diretoria).
create or replace function public.decidir_autorizacao_ordem(
  p_ordem_id uuid,
  p_instancia text,
  p_decisao text,
  p_observacao text default null,
  p_responsavel text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_papel text;
  v_status text;
  v_atual text;
  v_proprio boolean;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_decisao not in ('autorizada', 'recusada') then
    raise exception 'Decisão inválida: use autorizada ou recusada.';
  end if;
  if p_decisao = 'recusada' and btrim(coalesce(p_observacao, '')) = '' then
    raise exception 'Recusar exige motivo.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'aberta' then
    raise exception 'A ordem precisa estar fechada antes de ser autorizada.';
  end if;
  if v_status = 'paga' then
    raise exception 'Ordem já paga — as autorizações estão encerradas.';
  end if;

  select decisao into v_atual from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and instancia = p_instancia;
  if v_atual is null then
    raise exception 'Esta ordem não exige autorização de %.', p_instancia;
  end if;
  if v_atual <> 'pendente' then
    raise exception 'Autorização de % já está %.', p_instancia, v_atual;
  end if;

  v_papel := public.f_papel_da_instancia(p_instancia);
  v_proprio := v_papel is not null and public.f_tem_papel(auth.uid(), v_papel);

  update public.ordem_pagamento_autorizacoes
     set decisao = p_decisao,
         decidido_em = now(),
         decidido_por = case when v_proprio then auth.uid() else null end,
         registrado_por = case when v_proprio then null else auth.uid() end,
         responsavel = coalesce(nullif(btrim(coalesce(p_responsavel, '')), ''), responsavel),
         observacao = nullif(btrim(coalesce(p_observacao, '')), '')
   where ordem_id = p_ordem_id and instancia = p_instancia;
end;
$fn$;

-- =====================================================================
-- 3) Permissão explícita nas views do financeiro
-- É o que as migrations 0002 a 0005 já faziam. Sem isto, qualquer view
-- recriada volta sem permissão e a tela fica vazia sem explicar por quê.
-- =====================================================================
grant select on
  public.v_ordens_pagamento,
  public.v_ordem_pagamento_linhas,
  public.v_financeiro_representante,
  public.v_relatorio_pagamento,
  public.v_representante_debitos,
  public.v_representante_saldo_devedor,
  public.v_contratos_premiacao,
  public.v_contratos_incompletos,
  public.v_representantes_configuracao
to authenticated, service_role;

grant select on
  public.rubricas_pagamento,
  public.ordem_pagamento_autorizacoes,
  public.ordens_pagamento,
  public.ordem_pagamento_itens,
  public.representante_debitos,
  public.representante_debito_abatimentos,
  public.meta_plus_faixas
to authenticated, service_role;

grant execute on function
  public.pagar_ordem_pagamento(uuid, text, date, numeric, text),
  public.reabrir_ordem_pagamento(uuid, text),
  public.remover_exigencia_autorizacao(uuid, text),
  public.decidir_autorizacao_ordem(uuid, text, text, text, text)
to authenticated;
