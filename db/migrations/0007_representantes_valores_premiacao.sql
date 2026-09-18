-- Painel de Gestão DS3 — Fase 7 (etapa 1 da regra de premiação)
-- Valores de premiação no cadastro do representante:
--   * valor padrão da premiação por contrato (cada representante tem o seu);
--   * valor da comissão de liderança (quanto o líder ganha por contrato da equipe);
--   * meta mínima de contratos no mês (acompanhamento de desempenho).
-- Regra completa documentada em docs/regra-premiacao-representantes.md
-- Estes valores são o PADRÃO SUGERIDO. O valor efetivo de cada contrato é
-- definido no cadastro do contrato (etapa 2) e gravado lá — mudar o padrão
-- aqui nunca altera contratos já lançados.
-- Não altera migrations 0001-0006 já aplicadas.

-- =====================================================================
-- 0) Preflight
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'representantes'
  ) then
    raise exception 'Migration abortada: public.representantes não existe (aplicar 0002 antes).';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'representante_liderancas'
  ) then
    raise exception 'Migration abortada: public.representante_liderancas não existe (aplicar 0006 antes).';
  end if;
end
$$;

-- =====================================================================
-- 1) Colunas de valores no cadastro
-- =====================================================================
alter table public.representantes
  add column if not exists valor_premiacao_contrato numeric(12,2),
  add column if not exists valor_comissao_lideranca numeric(12,2),
  add column if not exists meta_minima_mensal integer;

-- Ausência de valor é ausência (NULL), nunca zero: representante sem premiação
-- cadastrada não é o mesmo que representante que ganha R$ 0,00.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'representantes_valor_premiacao_nao_negativo') then
    alter table public.representantes
      add constraint representantes_valor_premiacao_nao_negativo
      check (valor_premiacao_contrato is null or valor_premiacao_contrato >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'representantes_valor_comissao_nao_negativo') then
    alter table public.representantes
      add constraint representantes_valor_comissao_nao_negativo
      check (valor_comissao_lideranca is null or valor_comissao_lideranca >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'representantes_meta_minima_positiva') then
    alter table public.representantes
      add constraint representantes_meta_minima_positiva
      check (meta_minima_mensal is null or meta_minima_mensal > 0);
  end if;
end
$$;

comment on column public.representantes.valor_premiacao_contrato is
  'Valor padrão que este representante recebe por contrato. NULL = não cadastrado (não é zero). O valor efetivo é definido e gravado em cada contrato.';
comment on column public.representantes.valor_comissao_lideranca is
  'Valor que este representante, quando líder, recebe por cada contrato fechado por um representante da sua equipe. NULL = não cadastrado.';
comment on column public.representantes.meta_minima_mensal is
  'Meta mínima de contratos no mês para acompanhamento de desempenho. NULL = não cadastrada.';

-- =====================================================================
-- 2) criar_representante passa a aceitar os valores (todos opcionais)
-- =====================================================================
drop function if exists public.criar_representante(text, text, uuid, date, text);

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
  if not public.has_role(auth.uid(), 'admin') then
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

revoke all on function public.criar_representante(text, text, uuid, date, text, numeric, numeric, integer) from public, anon;
grant execute on function public.criar_representante(text, text, uuid, date, text, numeric, numeric, integer) to authenticated;

-- =====================================================================
-- 3) Edição dos valores (o gestor pediu explicitamente que seja editável)
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
  if not public.has_role(auth.uid(), 'admin') then
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

revoke all on function public.atualizar_valores_representante(uuid, numeric, numeric, integer) from public, anon;
grant execute on function public.atualizar_valores_representante(uuid, numeric, numeric, integer) to authenticated;

-- =====================================================================
-- 4) Visão de apoio: representante com seus valores e situação de liderança
-- =====================================================================
create or replace view public.v_representantes_configuracao
with (security_invoker = on) as
select
  r.id,
  r.codigo,
  r.nome,
  r.valor_premiacao_contrato,
  r.valor_comissao_lideranca,
  r.meta_minima_mensal,
  -- é líder de fato: existe alguém filiado a ele com vínculo aberto
  exists (
    select 1 from public.representante_liderancas l
    where l.lider_id = r.id and l.fim is null
  ) as e_lider,
  (select count(*) from public.representante_liderancas l
    where l.lider_id = r.id and l.fim is null) as qtd_equipe,
  la.lider_id,
  rl.codigo as lider_codigo,
  rl.nome as lider_nome
from public.representantes r
left join public.representante_liderancas la
  on la.representante_id = r.id and la.fim is null
left join public.representantes rl on rl.id = la.lider_id;
