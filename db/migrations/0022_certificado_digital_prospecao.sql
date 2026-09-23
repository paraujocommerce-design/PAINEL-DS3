-- Migration 0022: Certificado Digital - Prospecção e Indicadores
-- Implementa: Kanban de leads, Metas diárias, Indicadores de prospecção e venda cruzada Serasa

create table public.certificado_digital_leads (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cliente', 'parceiro_contador', 'representante')),
  etapa text not null check (etapa in ('novo_lead', 'contato_realizado', 'qualificado_interesse', 'negociacao_documentacao', 'convertido', 'perdido')),
  razao_social_nome text not null,
  contato_email text,
  contato_telefone text,
  responsavel_prospecao uuid not null references auth.users(id),
  data_criacao timestamp not null default now(),
  data_ultimo_contato timestamp,
  status text not null default 'ativo' check (status in ('ativo', 'perdido')),
  motivo_perda text,
  data_convertido timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table public.certificado_digital_metas (
  id uuid primary key default gen_random_uuid(),
  frente text not null check (frente in ('cliente', 'parceiro_contador', 'representante')),
  meta_diaria integer not null,
  responsavel_config uuid references auth.users(id),
  data_atualizacao timestamp not null default now(),
  created_at timestamp not null default now()
);

create table public.certificado_digital_indicadores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  data_registro date not null,
  tipo_indicador text not null,
  frente text check (frente in ('cliente', 'parceiro_contador', 'representante', 'emissao', null)),
  quantidade integer not null default 1,
  descricao text,
  lead_id uuid references public.certificado_digital_leads(id),
  created_at timestamp not null default now()
);

create table public.venda_cruzada_serasa (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  data_registro date not null,
  cliente_certificado_id uuid references public.certificado_digital_leads(id),
  valor_contrato numeric(10, 2),
  mes_referencia date not null,
  created_at timestamp not null default now()
);

create table public.venda_cruzada_serasa_metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  mes_referencia date not null,
  meta_mensal integer not null,
  responsavel_config uuid references auth.users(id),
  data_atualizacao timestamp not null default now(),
  created_at timestamp not null default now(),
  unique(usuario_id, mes_referencia)
);

-- RLS
alter table public.certificado_digital_leads enable row level security;
alter table public.certificado_digital_metas enable row level security;
alter table public.certificado_digital_indicadores enable row level security;
alter table public.venda_cruzada_serasa enable row level security;
alter table public.venda_cruzada_serasa_metas enable row level security;

-- Policies: todos os operadores podem ler/escrever
create policy "certificado_leads_rls" on public.certificado_digital_leads for all using (true) with check (public.pode_operar(auth.uid()));
create policy "certificado_metas_rls" on public.certificado_digital_metas for all using (true) with check (public.pode_operar(auth.uid()));
create policy "certificado_indicadores_rls" on public.certificado_digital_indicadores for all using (true) with check (public.pode_operar(auth.uid()));
create policy "serasa_rls" on public.venda_cruzada_serasa for all using (true) with check (public.pode_operar(auth.uid()));
create policy "serasa_metas_rls" on public.venda_cruzada_serasa_metas for all using (true) with check (public.pode_operar(auth.uid()));

-- Função: marcar leads como perdidos após 7 dias sem contato
create or replace function public.marcar_leads_perdidos()
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
    motivo_perda = 'Sem contato por mais de 7 dias',
    updated_at = now()
  where
    status = 'ativo'
    and etapa != 'convertido'
    and etapa != 'perdido'
    and (data_ultimo_contato is null and now() - data_criacao > interval '7 days'
         or data_ultimo_contato is not null and now() - data_ultimo_contato > interval '7 days');
end;
$fn$;

-- Views
create or replace view public.v_certificado_leads_kanban as
select
  id,
  tipo,
  etapa,
  razao_social_nome,
  contato_email,
  contato_telefone,
  responsavel_prospecao,
  data_criacao,
  data_ultimo_contato,
  extract(day from now() - coalesce(data_ultimo_contato, data_criacao)) as dias_sem_contato,
  status
from public.certificado_digital_leads
order by data_criacao desc;

create or replace view public.v_certificado_indicadores_diarios as
select
  usuario_id,
  data_registro,
  tipo_indicador,
  frente,
  sum(quantidade) as total
from public.certificado_digital_indicadores
group by usuario_id, data_registro, tipo_indicador, frente
order by data_registro desc, usuario_id;

create or replace view public.v_serasa_vendas_mes as
select
  usuario_id,
  mes_referencia,
  count(*) as total_vendido,
  coalesce((select meta_mensal from public.venda_cruzada_serasa_metas m where m.usuario_id = v.usuario_id and m.mes_referencia = v.mes_referencia), 0) as meta
from public.venda_cruzada_serasa v
group by usuario_id, mes_referencia
order by mes_referencia desc;

grant select on public.v_certificado_leads_kanban to authenticated;
grant select on public.v_certificado_indicadores_diarios to authenticated;
grant select on public.v_serasa_vendas_mes to authenticated;
