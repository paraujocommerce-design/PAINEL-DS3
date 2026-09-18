-- Painel de Gestão DS3 — Fase 9
-- Edição dos dados cadastrais do representante (nome e observação).
--
-- Contexto: o código do representante continua IMUTÁVEL (trigger da 0006) —
-- é a identidade dele. Nome e observação passam a ser corrigíveis, porque a
-- fonte dos dados (planilhas antigas) tem a mesma pessoa escrita de várias
-- formas e isso precisa ser acertado dentro do sistema.
--
-- Toda alteração fica registrada em representante_eventos, preservando o
-- valor anterior no detalhe — histórico nunca é destruído.
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
    raise exception 'Migration abortada: função pode_operar não existe (aplicar 0008 antes).';
  end if;
end
$preflight$;

-- =====================================================================
-- 1) Novo tipo de evento: alteração cadastral
-- =====================================================================
alter table public.representante_eventos
  drop constraint if exists representante_eventos_tipo_check;

alter table public.representante_eventos
  add constraint representante_eventos_tipo_check
  check (tipo in ('cadastro', 'mudanca_supervisor', 'alteracao_cadastro'));

-- =====================================================================
-- 2) Edição de nome e observação
-- =====================================================================
create or replace function public.atualizar_cadastro_representante(
  p_representante_id uuid,
  p_nome text,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_nome_atual text;
  v_obs_atual text;
  v_nome_novo text := btrim(coalesce(p_nome, ''));
  v_obs_nova text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_detalhe text;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if v_nome_novo = '' then
    raise exception 'Informe o nome do representante.';
  end if;

  select nome, observacao into v_nome_atual, v_obs_atual
    from public.representantes
   where id = p_representante_id
     for update;

  if v_nome_atual is null then
    raise exception 'Representante inexistente.';
  end if;

  -- Nome é único (índice normalizado): recusa colisão com outro representante.
  if exists (
    select 1 from public.representantes
     where lower(btrim(nome)) = lower(v_nome_novo)
       and id <> p_representante_id
  ) then
    raise exception 'Já existe outro representante com o nome %.', v_nome_novo;
  end if;

  if v_nome_atual = v_nome_novo and v_obs_atual is not distinct from v_obs_nova then
    return; -- nada mudou
  end if;

  update public.representantes
     set nome = v_nome_novo,
         observacao = v_obs_nova
   where id = p_representante_id;

  -- Preserva o valor anterior no histórico.
  v_detalhe := case
    when v_nome_atual <> v_nome_novo
      then 'Nome alterado de "' || v_nome_atual || '" para "' || v_nome_novo || '"'
    else 'Observação alterada'
  end;

  insert into public.representante_eventos
    (representante_id, tipo, ocorrido_em, detalhe, created_by)
  values (p_representante_id, 'alteracao_cadastro', current_date, v_detalhe, auth.uid());
end;
$fn$;

revoke all on function public.atualizar_cadastro_representante(uuid, text, text) from public, anon;
grant execute on function public.atualizar_cadastro_representante(uuid, text, text) to authenticated;

comment on function public.atualizar_cadastro_representante(uuid, text, text) is
  'Corrige nome e observação do representante, registrando o valor anterior em representante_eventos. O código permanece imutável.';
