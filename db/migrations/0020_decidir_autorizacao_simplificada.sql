-- =====================================================================
-- 0020 — Função decidir_autorizacao_ordem simplificada
--
-- Cada um decide por si:
-- - Berg autoriza supervisão (seu UUID é registrado)
-- - Paulo decide admin (seu UUID é registrado)
-- - Sem ambiguidade de "quem digitou no lugar de quem"
--
-- =====================================================================

create or replace function public.decidir_autorizacao_ordem(
  p_ordem_id uuid,
  p_instancia text,
  p_decisao text,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_atual text;
  v_papel text;
begin
  -- Validar entrada
  if p_decisao not in ('autorizada', 'recusada') then
    raise exception 'Decisão inválida: use "autorizada" ou "recusada".';
  end if;

  if p_decisao = 'recusada' and btrim(coalesce(p_observacao, '')) = '' then
    raise exception 'Recusar exige motivo.';
  end if;

  -- Validar instância
  if p_instancia not in ('operacao', 'supervisao', 'admin') then
    raise exception 'Instância inválida: use operacao, supervisao ou admin.';
  end if;

  -- Verificar que ordem existe e está em estado válido
  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;

  if v_status is null then
    raise exception 'Ordem inexistente ou cancelada.';
  end if;

  if v_status = 'aberta' then
    raise exception 'A ordem precisa estar fechada antes de ser autorizada.';
  end if;

  if v_status = 'paga' then
    raise exception 'Ordem já paga — as autorizações estão encerradas.';
  end if;

  -- Verificar que esta instância foi exigida
  select decisao into v_atual from public.ordem_pagamento_autorizacoes
   where ordem_id = p_ordem_id and instancia = p_instancia;

  if v_atual is null then
    raise exception 'Esta ordem não exige autorização de %.', p_instancia;
  end if;

  if v_atual <> 'pendente' then
    raise exception 'Autorização de % já está %', p_instancia, v_atual;
  end if;

  -- Validar permissão: quem tem o papel pode decidir por si
  if p_instancia = 'supervisao' then
    if not public.f_tem_papel(auth.uid(), 'supervisao') then
      raise exception 'Apenas supervisão (Berg) pode autorizar isso.';
    end if;
  elsif p_instancia = 'admin' then
    if not public.f_tem_papel(auth.uid(), 'admin') then
      raise exception 'Apenas admin (Paulo) pode autorizar isso.';
    end if;
  elsif p_instancia = 'operacao' then
    if not public.f_tem_papel(auth.uid(), 'operacao') then
      raise exception 'Apenas operação (Mariucha) pode autorizar isso.';
    end if;
  end if;

  -- Registrar a decisão
  update public.ordem_pagamento_autorizacoes
     set decisao = p_decisao,
         decidido_em = now(),
         decidido_por = auth.uid(),
         observacao = nullif(btrim(coalesce(p_observacao, '')), '')
   where ordem_id = p_ordem_id and instancia = p_instancia;

end;
$fn$;

-- =====================================================================
-- Reabrir ordem invalidada todas as autorizações (o documento mudou)
-- =====================================================================
create or replace function public.reabrir_ordem_pagamento(
  p_ordem_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  update public.ordens_pagamento
     set status = 'aberta',
         observacao = observacao || E'\n[Reabertura ' || now() || ']: ' || p_motivo
   where id = p_ordem_id and cancelado_em is null;

  -- Invalidar todas as autorizações — o documento mudou
  update public.ordem_pagamento_autorizacoes
     set decisao = 'pendente',
         decidido_em = null,
         decidido_por = null,
         observacao = 'Invalidada por reabertura da ordem'
   where ordem_id = p_ordem_id;

end;
$fn$;

-- =====================================================================
-- Permissões
-- =====================================================================
grant execute on function
  public.decidir_autorizacao_ordem(uuid, text, text, text),
  public.reabrir_ordem_pagamento(uuid, text)
to authenticated;
