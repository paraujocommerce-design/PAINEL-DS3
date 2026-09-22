-- =====================================================================
-- 0018 — Simplificar modelo de autorização (sem Durval/Kennedy)
--
-- Remove ambiguidade: só 3 papéis usam o sistema (operacao, supervisao, admin).
-- Antes: admin registrava decisão de terceiros ("foi Durval")
-- Depois: só quem tem o papel decide por si
--
-- =====================================================================

-- =====================================================================
-- 1) Remover coluna de "responsável" — causa de ambiguidade
-- =====================================================================
alter table public.ordem_pagamento_autorizacoes
  drop column if exists responsavel;

-- =====================================================================
-- 2) Limpar instâncias antigas (se houver registros com valores antigos)
-- =====================================================================
delete from public.ordem_pagamento_autorizacoes
  where instancia not in ('operacao', 'supervisao', 'admin');

-- =====================================================================
-- 3) Adicionar coluna registrado_por (rastreabilidade)
-- =====================================================================
alter table public.ordem_pagamento_autorizacoes
  add column if not exists registrado_por uuid
    references auth.users(id) on delete set null;

-- =====================================================================
-- 4) Atualizar função exigir_autorizacao_ordem
--    Operação (Mariucha) exige autorização de supervisão (Berg)
--    Admin só se for ajuste específico
-- =====================================================================
create or replace function public.exigir_autorizacao_ordem(
  p_ordem_id uuid,
  p_instancia text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_id uuid;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  if p_instancia not in ('operacao', 'supervisao', 'admin') then
    raise exception 'Instância inválida: use operacao, supervisao ou admin.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'paga' then
    raise exception 'Ordem já paga — não é possível exigir nova autorização.';
  end if;

  insert into public.ordem_pagamento_autorizacoes
    (ordem_id, instancia, criado_por, registrado_por)
  values (p_ordem_id, p_instancia, auth.uid(), auth.uid())
  on conflict (ordem_id, instancia)
    do update set registrado_por = auth.uid()
  returning id into v_id;

  return v_id;
end;
$fn$;

-- =====================================================================
-- 5) Atualizar função remover_exigencia_autorizacao
-- =====================================================================
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
  if not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Apenas admin pode dispensar uma autorização.';
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

-- =====================================================================
-- Permissões
-- =====================================================================
grant all on table public.ordem_pagamento_autorizacoes to authenticated, service_role;
