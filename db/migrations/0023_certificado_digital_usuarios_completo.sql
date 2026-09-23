-- Migration 0023: Certificado Digital - Sistema Completo com Usuários, Histórico e Metas
-- Expande a estrutura anterior com: usuários (Duda, Pedro, Gabryela), histórico de leads, indicadores consolidados, metas

-- Tabela de usuários do Certificado Digital
create table public.certificado_digital_usuarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) unique,
  nome_completo text not null,
  apelido text,
  tipo_operador text not null check (tipo_operador in ('operador_emissao', 'prospector')),
  email text not null unique,
  criado_em timestamp not null default now()
);

-- Expandir leads com histórico e mais detalhes
alter table public.certificado_digital_leads add column if not exists cnpj_cpf text;
alter table public.certificado_digital_leads add column if not exists telefone_contato text;
alter table public.certificado_digital_leads add column if not exists email_contato text;
alter table public.certificado_digital_leads add column if not exists data_ultima_verificacao timestamp;
alter table public.certificado_digital_leads add column if not exists dias_sem_movimento integer generated always as (extract(day from now() - coalesce(data_ultima_verificacao, data_criacao))) stored;

-- Histórico de movimentação entre etapas
create table public.certificado_digital_leads_historico (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.certificado_digital_leads(id) on delete cascade,
  etapa_anterior text,
  etapa_nova text not null,
  movido_por uuid not null references auth.users(id),
  movido_em timestamp not null default now()
);

-- Indicadores diários detalhados
create table public.certificado_digital_indicadores_diarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.certificado_digital_usuarios(user_id),
  data_registro date not null,
  tipo_indicador text not null,
  frente text,
  quantidade integer not null default 1,
  quantidade_serasa integer default 0,
  observacao text,
  criado_em timestamp not null default now(),
  unique(usuario_id, data_registro, tipo_indicador, frente)
);

-- Consolidação semanal
create table public.certificado_digital_indicadores_semanais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.certificado_digital_usuarios(user_id),
  semana_inicio date not null,
  tipo_indicador text not null,
  frente text,
  total integer not null default 0,
  total_serasa integer default 0,
  criado_em timestamp not null default now()
);

-- Consolidação mensal
create table public.certificado_digital_indicadores_mensais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.certificado_digital_usuarios(user_id),
  mes date not null,
  tipo_indicador text not null,
  frente text,
  total integer not null default 0,
  total_serasa integer default 0,
  meta_esperada integer,
  criado_em timestamp not null default now(),
  unique(usuario_id, mes, tipo_indicador, frente)
);

-- Metas configuráveis
create table public.certificado_digital_metas_config (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  meta_mensal_geral integer not null default 300,
  meta_serasa_minimo integer not null default 3,
  meta_serasa_maximo integer not null default 5,
  meta_agosto_especial integer default 200,
  meta_diaria_gabryela_clientes integer not null default 5,
  meta_diaria_gabryela_parceiros integer not null default 2,
  meta_diaria_gabryela_representantes integer not null default 3,
  atualizado_em timestamp not null default now(),
  unique(mes)
);

-- RLS
alter table public.certificado_digital_usuarios enable row level security;
alter table public.certificado_digital_leads_historico enable row level security;
alter table public.certificado_digital_indicadores_diarios enable row level security;
alter table public.certificado_digital_indicadores_semanais enable row level security;
alter table public.certificado_digital_indicadores_mensais enable row level security;
alter table public.certificado_digital_metas_config enable row level security;

-- Policies
create policy "cd_usuarios_rls" on public.certificado_digital_usuarios for all using (true) with check (public.pode_operar(auth.uid()));
create policy "cd_historico_rls" on public.certificado_digital_leads_historico for all using (true) with check (public.pode_operar(auth.uid()));
create policy "cd_indicadores_diarios_rls" on public.certificado_digital_indicadores_diarios for all using (true) with check (public.pode_operar(auth.uid()));
create policy "cd_indicadores_semanais_rls" on public.certificado_digital_indicadores_semanais for all using (true) with check (public.pode_operar(auth.uid()));
create policy "cd_indicadores_mensais_rls" on public.certificado_digital_indicadores_mensais for all using (true) with check (public.pode_operar(auth.uid()));
create policy "cd_metas_config_rls" on public.certificado_digital_metas_config for all using (true) with check (public.pode_operar(auth.uid()));

-- Views consolidadas
create or replace view public.v_certificado_painel_departamento as
select
  u.id as usuario_id,
  u.nome_completo,
  u.apelido,
  u.tipo_operador,
  (select count(*) from public.certificado_digital_leads l where l.status = 'ativo' and l.etapa = 'novo_lead') as novo_lead_total,
  (select count(*) from public.certificado_digital_leads l where l.status = 'ativo' and l.etapa = 'contato_realizado') as contato_realizado_total,
  (select count(*) from public.certificado_digital_leads l where l.status = 'ativo' and l.etapa = 'qualificado_interesse') as qualificado_total,
  (select count(*) from public.certificado_digital_leads l where l.status = 'ativo' and l.etapa = 'negociacao_documentacao') as negociacao_total,
  (select count(*) from public.certificado_digital_leads l where l.status = 'ativo' and l.etapa = 'convertido') as convertido_total,
  (select count(*) from public.certificado_digital_leads l where l.status = 'perdido') as perdido_total,
  coalesce((select sum(quantidade) from public.certificado_digital_indicadores_diarios i where i.usuario_id = u.id and i.data_registro = current_date), 0) as indicadores_hoje
from public.certificado_digital_usuarios u;

create or replace view public.v_certificado_leads_com_historico as
select
  l.id,
  l.tipo,
  l.etapa,
  l.razao_social_nome,
  l.cnpj_cpf,
  l.email_contato,
  l.telefone_contato,
  l.dias_sem_movimento,
  l.status,
  l.data_criacao,
  l.data_ultima_verificacao,
  l.responsavel_prospecao,
  string_agg(h.etapa_anterior || ' → ' || h.etapa_nova || ' (' || h.movido_em::text || ')', E'\n' order by h.movido_em desc) as historico
from public.certificado_digital_leads l
left join public.certificado_digital_leads_historico h on l.id = h.lead_id
group by l.id
order by l.data_criacao desc;

create or replace view public.v_certificado_meta_mensal_atual as
select
  current_date as data_consulta,
  m.meta_mensal_geral,
  m.meta_serasa_minimo,
  m.meta_serasa_maximo,
  m.meta_agosto_especial,
  (select count(*) from public.certificado_digital_indicadores_diarios where extract(month from data_registro) = extract(month from current_date) and tipo_indicador = 'convertido') as convertidos_mes,
  (select count(*) from public.certificado_digital_indicadores_diarios where extract(month from data_registro) = extract(month from current_date) and tipo_indicador = 'convertido' and quantidade_serasa > 0) as serasa_mes
from public.certificado_digital_metas_config m
where m.mes = date_trunc('month', current_date)::date;

grant select on public.v_certificado_painel_departamento to authenticated;
grant select on public.v_certificado_leads_com_historico to authenticated;
grant select on public.v_certificado_meta_mensal_atual to authenticated;

-- Função para marcar leads como perdidos (7 dias)
create or replace function public.marcar_leads_perdidos_automático()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.certificado_digital_leads
  set
    status = 'perdido',
    etapa = 'perdido',
    motivo_perda = 'Automaticamente marcado como perdido após 7 dias sem movimento',
    updated_at = now()
  where
    status = 'ativo'
    and etapa not in ('convertido', 'perdido')
    and extract(day from now() - coalesce(data_ultima_verificacao, data_criacao)) >= 7;
end;
$fn$;

-- Função para consolidar indicadores semanais
create or replace function public.consolidar_indicadores_semanais()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_semana_inicio date;
begin
  v_semana_inicio := date_trunc('week', current_date - interval '7 days')::date;

  insert into public.certificado_digital_indicadores_semanais
    (usuario_id, semana_inicio, tipo_indicador, frente, total, total_serasa)
  select
    usuario_id,
    v_semana_inicio,
    tipo_indicador,
    frente,
    sum(quantidade),
    sum(coalesce(quantidade_serasa, 0))
  from public.certificado_digital_indicadores_diarios
  where data_registro >= v_semana_inicio and data_registro < v_semana_inicio + interval '7 days'
  group by usuario_id, tipo_indicador, frente
  on conflict do nothing;
end;
$fn$;

-- Função para consolidar indicadores mensais
create or replace function public.consolidar_indicadores_mensais()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_mes date;
  v_meta integer;
begin
  v_mes := date_trunc('month', current_date)::date;

  insert into public.certificado_digital_indicadores_mensais
    (usuario_id, mes, tipo_indicador, frente, total, total_serasa)
  select
    usuario_id,
    v_mes,
    tipo_indicador,
    frente,
    sum(quantidade),
    sum(coalesce(quantidade_serasa, 0))
  from public.certificado_digital_indicadores_diarios
  where extract(month from data_registro) = extract(month from current_date)
  group by usuario_id, tipo_indicador, frente
  on conflict (usuario_id, mes, tipo_indicador, frente)
  do update set total = excluded.total, total_serasa = excluded.total_serasa;
end;
$fn$;
