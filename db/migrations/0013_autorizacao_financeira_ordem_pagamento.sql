-- =====================================================================
-- 0013 — Autorização financeira e ordem de pagamento no formato real
--
-- Alinha a ordem de pagamento ao formulário que a DS3 já usa (modelo
-- "BERG CALASANS — 3840 CLAUDIO CARDOSO") e cria a cadeia de autorização.
--
-- O que entra:
--   1. Papel `supervisao` (Berg) — autoriza, não opera
--   2. Dados financeiros e bancários no cadastro do representante
--   3. Rubricas configuráveis — as ~20 linhas do formulário
--   4. Itens com data, sinal (abatimento/estorno subtraem) e rubrica
--   5. Trava de duplicidade: um contrato só é pago uma vez por rubrica
--   6. Destinatário alternativo (só quando o pagamento muda de mão)
--   7. Autorizações: gerência, supervisão, auditoria, diretoria
--   8. Pagamento só depois de todas as autorizações exigidas
--
-- Regra que o gestor definiu e que o código precisa respeitar:
--   adiantamento vira dívida a descontar; ajuda de custo é gratificação
--   e NÃO volta. As duas saem dinheiro na hora — só a primeira gera débito.
-- =====================================================================

-- =====================================================================
-- 1) Papel de supervisão
-- A comparação é feita por texto de propósito: assim este script não
-- referencia o valor recém-criado do enum na mesma transação.
-- =====================================================================
alter type public.app_role add value if not exists 'supervisao';

create or replace function public.f_tem_papel(_user_id uuid, _papel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.user_roles
     where user_id = _user_id and role::text = _papel
  )
$fn$;

-- Quem enxerga o financeiro: admin, operação e supervisão.
-- Supervisão só lê — autorizar é ação própria, não escrita direta.
create or replace function public.pode_ver_financeiro(_user_id uuid)
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
-- 2) Cadastro do representante: ajuda de custo fixa e conta bancária
-- A conta é a de destino padrão do pagamento. Só aparece na ordem
-- quando o destinatário muda (ver seção 6).
-- =====================================================================
alter table public.representantes
  add column if not exists valor_ajuda_custo_fixa numeric(12,2),
  add column if not exists banco text,
  add column if not exists agencia text,
  add column if not exists conta text,
  add column if not exists tipo_conta text,
  add column if not exists favorecido text,
  add column if not exists documento_favorecido text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'representantes_ajuda_fixa_positiva') then
    alter table public.representantes
      add constraint representantes_ajuda_fixa_positiva
      check (valor_ajuda_custo_fixa is null or valor_ajuda_custo_fixa >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'representantes_tipo_conta_valido') then
    alter table public.representantes
      add constraint representantes_tipo_conta_valido
      check (tipo_conta is null or tipo_conta in ('cc', 'cp'));
  end if;
end
$$;

create or replace function public.atualizar_dados_financeiros_representante(
  p_representante_id uuid,
  p_valor_ajuda_custo_fixa numeric default null,
  p_banco text default null,
  p_agencia text default null,
  p_conta text default null,
  p_tipo_conta text default null,
  p_favorecido text default null,
  p_documento_favorecido text default null
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
  if not exists (select 1 from public.representantes where id = p_representante_id) then
    raise exception 'Representante inexistente.';
  end if;

  update public.representantes
     set valor_ajuda_custo_fixa = p_valor_ajuda_custo_fixa,
         banco                  = nullif(btrim(coalesce(p_banco, '')), ''),
         agencia                = nullif(btrim(coalesce(p_agencia, '')), ''),
         conta                  = nullif(btrim(coalesce(p_conta, '')), ''),
         tipo_conta             = nullif(btrim(coalesce(p_tipo_conta, '')), ''),
         favorecido             = nullif(btrim(coalesce(p_favorecido, '')), ''),
         documento_favorecido   = nullif(regexp_replace(coalesce(p_documento_favorecido, ''), '\D', '', 'g'), '')
   where id = p_representante_id;
end;
$fn$;

-- =====================================================================
-- 3) Rubricas — as linhas do formulário, configuráveis
--
--   sinal          +1 soma no total, -1 subtrai (abatimento, estorno)
--   automatica     o sistema calcula e lança sozinho na apuração
--   gera_debito    o valor pago vira dívida a descontar depois
--   exige_contrato a linha precisa apontar o contrato que está pagando
-- =====================================================================
create table if not exists public.rubricas_pagamento (
  codigo text primary key,
  rotulo text not null check (btrim(rotulo) <> ''),
  ordem int not null default 0,
  sinal smallint not null default 1 check (sinal in (1, -1)),
  automatica boolean not null default false,
  gera_debito boolean not null default false,
  exige_contrato boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.rubricas_pagamento
  (codigo, rotulo, ordem, sinal, automatica, gera_debito, exige_contrato)
values
  ('ajuda_custo_contrato',           'Ajuda de custo por contrato',      10,  1, true,  false, true),
  ('diferenca_contrato',             'Diferença do contrato',            20,  1, false, false, false),
  ('ajuda_custo_fixa',               'Ajuda de custo fixa',              30,  1, true,  false, false),
  ('ajuda_custo_extra',              'Ajuda de custo extra',             40,  1, false, false, false),
  ('ajuda_combustivel',              'Ajuda de combustível',             50,  1, false, false, false),
  ('meta_plus_combustivel',          'Meta Plus de combustível',         60,  1, false, false, false),
  ('meta_plus',                      'Meta Plus',                        70,  1, true,  false, false),
  ('participacao_representante',     'Participação de representante',    80,  1, false, false, false),
  ('adesao_boleto',                  'Adesão boleto',                    90,  1, false, false, false),
  ('pagamento_reativacao',           'Pagamento reativação de contrato',100,  1, false, false, true),
  ('pagamento_incentivo',            'Pagamento incentivo',             110,  1, true,  false, false),
  ('acordo',                         'Acordo',                          120,  1, false, false, false),
  ('pagamento_primeira_mensalidade', 'Pagamento da 1ª mensalidade',     130,  1, false, false, true),
  ('pagamento_equipe',               'Pagamento por equipe',            140,  1, true,  false, true),
  ('primeira_mensalidade',           '1ª mensalidade',                  150,  1, false, false, true),
  ('pagamento_carro',                'Pagamento carro',                 160,  1, false, false, false),
  ('adiantamento',                   'Adiantamento',                    170,  1, false, true,  false),
  ('abatimento',                     'Abatimento',                      180, -1, false, false, false),
  ('estorno',                        'Estorno',                         190, -1, false, false, false),
  ('ajuste',                         'Ajuste',                          200,  1, false, false, false)
on conflict (codigo) do nothing;

-- =====================================================================
-- 4) Itens da ordem: rubrica, data e sinal
-- O campo `tipo` passa a ser o código da rubrica — uma fonte só, sem
-- duplicar a lista em check constraint.
-- =====================================================================
alter table public.ordem_pagamento_itens
  drop constraint if exists ordem_pagamento_itens_tipo_check;

update public.ordem_pagamento_itens
   set tipo = case tipo
        when 'premiacao_contrato'  then 'ajuda_custo_contrato'
        when 'comissao_lideranca'  then 'pagamento_equipe'
        when 'incentivo_comercial' then 'pagamento_incentivo'
        else tipo
      end
 where tipo in ('premiacao_contrato', 'comissao_lideranca', 'incentivo_comercial');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordem_pagamento_itens_tipo_fkey') then
    alter table public.ordem_pagamento_itens
      add constraint ordem_pagamento_itens_tipo_fkey
      foreign key (tipo) references public.rubricas_pagamento(codigo) on update cascade;
  end if;
end
$$;

alter table public.ordem_pagamento_itens
  add column if not exists data_referencia date,
  add column if not exists sinal smallint not null default 1,
  add column if not exists observacao text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordem_pagamento_itens_sinal_valido') then
    alter table public.ordem_pagamento_itens
      add constraint ordem_pagamento_itens_sinal_valido check (sinal in (1, -1));
  end if;
end
$$;

update public.ordem_pagamento_itens i
   set sinal = r.sinal
  from public.rubricas_pagamento r
 where r.codigo = i.tipo and i.sinal <> r.sinal;

-- valor_liquido precisa passar a aceitar negativo (abatimento, estorno).
-- É coluna gerada: derrubar e recriar não perde dado, mas a view que a
-- usa precisa sair da frente antes.
drop view if exists public.v_ordens_pagamento;

alter table public.ordem_pagamento_itens drop column if exists valor_liquido;
alter table public.ordem_pagamento_itens
  add column valor_liquido numeric(12,2)
  generated always as (sinal * greatest(valor_bruto - desconto, 0)) stored;

-- =====================================================================
-- 5) Trava de duplicidade
-- Exigência do gestor: a ordem "deve conter o código que estamos pagando
-- para não gerar duplicidade". A conferência não pode depender de quem
-- monta lembrar — o banco recusa.
-- =====================================================================
create or replace function public.f_item_sem_duplicidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_competencia date;
  v_codigo text;
  v_rotulo text;
begin
  if new.contrato_id is null then
    return new;
  end if;

  select o.competencia into v_competencia
    from public.ordem_pagamento_itens i
    join public.ordens_pagamento o on o.id = i.ordem_id
   where i.contrato_id = new.contrato_id
     and i.tipo = new.tipo
     and i.id <> new.id
     and o.cancelado_em is null
   limit 1;

  if v_competencia is not null then
    select codigo_contrato into v_codigo
      from public.representante_contratos where id = new.contrato_id;
    select rotulo into v_rotulo
      from public.rubricas_pagamento where codigo = new.tipo;
    raise exception 'Contrato % já tem "%" lançado na ordem de %. Não é possível pagar duas vezes.',
      coalesce(v_codigo, '?'), coalesce(v_rotulo, new.tipo), to_char(v_competencia, 'MM/YYYY');
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_item_sem_duplicidade on public.ordem_pagamento_itens;
create trigger trg_item_sem_duplicidade
  before insert or update of contrato_id, tipo on public.ordem_pagamento_itens
  for each row execute function public.f_item_sem_duplicidade();

-- =====================================================================
-- 6) Ordem: supervisor, destinatário alternativo e registro do pagamento
-- O destinatário só é preenchido quando o pagamento muda de mão — o
-- padrão é a conta cadastrada do próprio representante.
-- =====================================================================
alter table public.ordens_pagamento
  add column if not exists supervisor_id uuid references public.supervisores(id) on delete set null,
  add column if not exists destinatario_nome text,
  add column if not exists destinatario_documento text,
  add column if not exists destinatario_banco text,
  add column if not exists destinatario_agencia text,
  add column if not exists destinatario_conta text,
  add column if not exists destinatario_tipo_conta text,
  add column if not exists destinatario_motivo text,
  add column if not exists destinatario_definido_em timestamptz,
  add column if not exists destinatario_definido_por uuid references auth.users(id) on delete set null,
  add column if not exists forma_pagamento text,
  add column if not exists data_pagamento date,
  add column if not exists comprovante text,
  add column if not exists valor_pago numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordem_destinatario_completo') then
    alter table public.ordens_pagamento
      add constraint ordem_destinatario_completo check (
        destinatario_nome is null
        or (btrim(coalesce(destinatario_nome, '')) <> ''
            and btrim(coalesce(destinatario_motivo, '')) <> '')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordem_destinatario_tipo_conta_valido') then
    alter table public.ordens_pagamento
      add constraint ordem_destinatario_tipo_conta_valido
      check (destinatario_tipo_conta is null or destinatario_tipo_conta in ('cc', 'cp'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordem_forma_pagamento_valida') then
    alter table public.ordens_pagamento
      add constraint ordem_forma_pagamento_valida check (
        forma_pagamento is null
        or forma_pagamento in ('pix', 'transferencia', 'deposito', 'dinheiro', 'outro')
      );
  end if;
end
$$;

create or replace function public.definir_destinatario_ordem(
  p_ordem_id uuid,
  p_nome text,
  p_motivo text,
  p_documento text default null,
  p_banco text default null,
  p_agencia text default null,
  p_conta text default null,
  p_tipo_conta text default null
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
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Informe o nome do destinatário.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Mudar o destinatário do pagamento exige motivo.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'paga' then
    raise exception 'Ordem já paga — o destinatário não pode ser alterado.';
  end if;

  update public.ordens_pagamento
     set destinatario_nome       = btrim(p_nome),
         destinatario_motivo     = btrim(p_motivo),
         destinatario_documento  = nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), ''),
         destinatario_banco      = nullif(btrim(coalesce(p_banco, '')), ''),
         destinatario_agencia    = nullif(btrim(coalesce(p_agencia, '')), ''),
         destinatario_conta      = nullif(btrim(coalesce(p_conta, '')), ''),
         destinatario_tipo_conta = nullif(btrim(coalesce(p_tipo_conta, '')), ''),
         destinatario_definido_em  = now(),
         destinatario_definido_por = auth.uid()
   where id = p_ordem_id;
end;
$fn$;

create or replace function public.limpar_destinatario_ordem(p_ordem_id uuid)
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
  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'paga' then
    raise exception 'Ordem já paga — o destinatário não pode ser alterado.';
  end if;

  update public.ordens_pagamento
     set destinatario_nome = null, destinatario_motivo = null,
         destinatario_documento = null, destinatario_banco = null,
         destinatario_agencia = null, destinatario_conta = null,
         destinatario_tipo_conta = null,
         destinatario_definido_em = null, destinatario_definido_por = null
   where id = p_ordem_id;
end;
$fn$;

-- =====================================================================
-- 7) Autorizações
--
-- Quatro instâncias. Berg tem login e autoriza por si; Durval e Kennedy
-- não têm acesso ao sistema, então a autorização deles é REGISTRADA por
-- quem monta a ordem — e o registro guarda quem digitou, separado de
-- quem autorizou, para não confundir as duas coisas.
-- =====================================================================
create table if not exists public.ordem_pagamento_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_pagamento(id) on delete cascade,
  instancia text not null check (instancia in ('gerencia', 'supervisao', 'auditoria', 'diretoria')),
  responsavel text not null check (btrim(responsavel) <> ''),
  decisao text not null default 'pendente'
    check (decisao in ('pendente', 'autorizada', 'recusada')),
  decidido_em timestamptz,
  decidido_por uuid references auth.users(id) on delete set null,
  registrado_por uuid references auth.users(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  unique (ordem_id, instancia),
  constraint autorizacao_decisao_coerente check (
    (decisao = 'pendente' and decidido_em is null)
    or (decisao <> 'pendente' and decidido_em is not null)
  ),
  constraint autorizacao_recusa_exige_motivo check (
    decisao <> 'recusada' or btrim(coalesce(observacao, '')) <> ''
  )
);

create index if not exists idx_autorizacoes_ordem on public.ordem_pagamento_autorizacoes(ordem_id);

-- Qual papel de sistema responde por cada instância.
-- auditoria e diretoria retornam null: ninguém tem login, só registro.
create or replace function public.f_papel_da_instancia(_instancia text)
returns text
language sql
immutable
as $fn$
  select case _instancia
           when 'gerencia'   then 'admin'
           when 'supervisao' then 'supervisao'
           else null
         end
$fn$;

create or replace function public.exigir_autorizacao_ordem(
  p_ordem_id uuid,
  p_instancia text,
  p_responsavel text
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
  if btrim(coalesce(p_responsavel, '')) = '' then
    raise exception 'Informe quem deve autorizar.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status = 'paga' then
    raise exception 'Ordem já paga — não é possível exigir nova autorização.';
  end if;

  insert into public.ordem_pagamento_autorizacoes
    (ordem_id, instancia, responsavel, criado_por)
  values (p_ordem_id, p_instancia, btrim(p_responsavel), auth.uid())
  on conflict (ordem_id, instancia)
    do update set responsavel = excluded.responsavel
  returning id into v_id;

  return v_id;
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
  if not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Apenas a gerência pode dispensar uma autorização.';
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

-- Decide uma instância. Quem tem o papel decide por si; a gerência pode
-- registrar a decisão de quem não usa o sistema (auditoria, diretoria).
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

  if not v_proprio and not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Acesso negado: esta autorização não é sua para decidir.';
  end if;

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
-- 8) Lançamento manual de rubrica
-- É por aqui que entram as linhas que o sistema não calcula: combustível,
-- acordo, carro, adiantamento, abatimento, estorno.
-- Adiantamento gera débito automaticamente; ajuda de custo não.
-- =====================================================================
alter table public.representante_debitos
  add column if not exists origem_item_id uuid
    references public.ordem_pagamento_itens(id) on delete set null;

create or replace function public.adicionar_item_ordem(
  p_ordem_id uuid,
  p_rubrica text,
  p_valor numeric,
  p_data date default null,
  p_observacao text default null,
  p_contrato_id uuid default null,
  p_desconto numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r public.rubricas_pagamento%rowtype;
  v_status text;
  v_representante uuid;
  v_codigo text;
  v_item uuid;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  select * into r from public.rubricas_pagamento where codigo = p_rubrica;
  if not found then raise exception 'Rubrica inexistente: %.', p_rubrica; end if;
  if not r.ativo then raise exception 'Rubrica "%" está inativa.', r.rotulo; end if;
  if r.automatica then
    raise exception '"%" é calculada pelo sistema — use a apuração da competência.', r.rotulo;
  end if;

  select status, representante_id into v_status, v_representante
    from public.ordens_pagamento where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta aceita lançamento (atual: %).', v_status;
  end if;

  if r.exige_contrato and p_contrato_id is null then
    raise exception '"%" exige o contrato que está sendo pago.', r.rotulo;
  end if;

  if p_contrato_id is not null then
    select codigo_contrato into v_codigo
      from public.representante_contratos
     where id = p_contrato_id and cancelado_em is null;
    if v_codigo is null then raise exception 'Contrato inexistente ou cancelado.'; end if;
  end if;

  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, desconto,
     sinal, data_referencia, observacao)
  values
    (p_ordem_id, r.codigo, p_contrato_id, v_codigo,
     r.rotulo || coalesce(' — contrato ' || v_codigo, ''),
     p_valor, greatest(coalesce(p_desconto, 0), 0),
     r.sinal, coalesce(p_data, current_date),
     nullif(btrim(coalesce(p_observacao, '')), ''))
  returning id into v_item;

  -- Adiantamento sai dinheiro agora e volta depois: vira débito.
  -- Ajuda de custo é gratificação e não gera débito nenhum.
  if r.gera_debito then
    insert into public.representante_debitos
      (representante_id, valor_original, motivo, data_origem, observacao,
       criado_por, origem_item_id)
    values
      (v_representante, p_valor,
       r.rotulo || coalesce(' — contrato ' || v_codigo, ''),
       coalesce(p_data, current_date),
       nullif(btrim(coalesce(p_observacao, '')), ''),
       auth.uid(), v_item);
  end if;

  return v_item;
end;
$fn$;

create or replace function public.remover_item_ordem(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_automatica boolean;
  v_debito uuid;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;

  select o.status, r.automatica into v_status, v_automatica
    from public.ordem_pagamento_itens i
    join public.ordens_pagamento o on o.id = i.ordem_id
    join public.rubricas_pagamento r on r.codigo = i.tipo
   where i.id = p_item_id;
  if v_status is null then raise exception 'Item inexistente.'; end if;
  if v_status <> 'aberta' then
    raise exception 'Só uma ordem aberta aceita remoção (atual: %).', v_status;
  end if;
  if v_automatica then
    raise exception 'Item calculado pelo sistema — reapure a competência para refazer.';
  end if;

  select id into v_debito from public.representante_debitos
   where origem_item_id = p_item_id and cancelado_em is null;

  if v_debito is not null then
    if exists (select 1 from public.representante_debito_abatimentos where debito_id = v_debito) then
      raise exception 'Este lançamento já gerou débito com abatimento aplicado e não pode ser removido.';
    end if;
    delete from public.representante_debitos where id = v_debito;
  end if;

  delete from public.ordem_pagamento_itens where id = p_item_id;
end;
$fn$;

-- =====================================================================
-- 9) Apuração — agora com ajuda de custo fixa e supervisor do período
-- Reapurar refaz só o que é calculado; o que foi lançado à mão fica.
-- =====================================================================
create or replace function public.apurar_ordem_pagamento(
  p_representante_id uuid,
  p_competencia date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ordem uuid;
  v_inicio date;
  v_fim date;
  v_status text;
  v_contratos int;
  v_faixa_valor numeric;
  v_carteira numeric;
  v_incentivo numeric;
  v_ajuda_fixa numeric;
  v_supervisor uuid;
begin
  if not public.pode_operar(auth.uid()) then
    raise exception 'Acesso negado.';
  end if;
  if p_competencia is null then
    raise exception 'Informe a competência.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;

  select v.supervisor_id into v_supervisor
    from public.representante_vinculos v
   where v.representante_id = p_representante_id
     and v.inicio <= v_fim
     and (v.fim is null or v.fim >= v_inicio)
   order by v.inicio desc
   limit 1;

  select id, status into v_ordem, v_status
    from public.ordens_pagamento
   where representante_id = p_representante_id and competencia = v_inicio
     and cancelado_em is null;

  if v_ordem is null then
    insert into public.ordens_pagamento (representante_id, competencia, criado_por, supervisor_id)
    values (p_representante_id, v_inicio, auth.uid(), v_supervisor)
    returning id into v_ordem;
  elsif v_status in ('paga', 'fechada') then
    raise exception 'Ordem de % já está % e não pode ser reapurada.',
      to_char(v_inicio, 'MM/YYYY'), v_status;
  else
    -- reapuração: refaz só as rubricas automáticas, preserva o manual
    delete from public.ordem_pagamento_itens i
     using public.rubricas_pagamento r
     where i.ordem_id = v_ordem and r.codigo = i.tipo and r.automatica;
    update public.ordens_pagamento
       set supervisor_id = coalesce(v_supervisor, supervisor_id)
     where id = v_ordem;
  end if;

  -- 9.1 Ajuda de custo por contrato (a premiação: um item por contrato,
  --     com o código, que é o que trava a duplicidade)
  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, desconto,
     sinal, data_referencia)
  select v_ordem, 'ajuda_custo_contrato', c.id, c.codigo_contrato,
         'Contrato ' || c.codigo_contrato ||
           coalesce(' — ' || c.nome_fantasia, '') ||
           ' (' || to_char(c.data_venda, 'DD/MM') || ')',
         coalesce(c.valor_premiacao, 0), coalesce(c.desconto_premiacao, 0),
         1, c.data_venda
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_premiacao, 0) > 0;

  -- 9.2 Pagamento por equipe (comissão de liderança)
  insert into public.ordem_pagamento_itens
    (ordem_id, tipo, contrato_id, referencia, descricao, valor_bruto, desconto,
     sinal, data_referencia)
  select v_ordem, 'pagamento_equipe', c.id, c.codigo_contrato,
         'Equipe: ' || r.nome || ' — contrato ' || c.codigo_contrato ||
           ' (' || to_char(c.data_venda, 'DD/MM') || ')',
         coalesce(c.valor_comissao_lideranca, 0),
         coalesce(c.desconto_comissao_lideranca, 0),
         1, c.data_venda
    from public.representante_contratos c
    join public.representantes r on r.id = c.representante_id
   where c.lider_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel
     and coalesce(c.valor_comissao_lideranca, 0) > 0;

  -- 9.3 Ajuda de custo fixa — valor do cadastro, todo mês
  select valor_ajuda_custo_fixa into v_ajuda_fixa
    from public.representantes where id = p_representante_id;

  if coalesce(v_ajuda_fixa, 0) > 0 then
    insert into public.ordem_pagamento_itens
      (ordem_id, tipo, descricao, valor_bruto, sinal, data_referencia)
    values (v_ordem, 'ajuda_custo_fixa', 'Ajuda de custo fixa do mês',
            v_ajuda_fixa, 1, v_fim);
  end if;

  -- 9.4 Meta Plus — a faixa maior absorve a menor
  select count(*) into v_contratos
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda between v_inicio and v_fim
     and c.cancelado_em is null
     and c.premiavel;

  select f.valor_total into v_faixa_valor
    from public.meta_plus_faixas f
   where f.ativo and f.quantidade_contratos <= v_contratos
   order by f.quantidade_contratos desc
   limit 1;

  if v_faixa_valor is not null and v_faixa_valor > 0 then
    insert into public.ordem_pagamento_itens
      (ordem_id, tipo, referencia, descricao, valor_bruto, sinal, data_referencia)
    values (v_ordem, 'meta_plus', v_contratos::text,
            'Meta Plus — ' || v_contratos || ' contratos no mês',
            v_faixa_valor, 1, v_fim);
  end if;

  -- 9.5 Pagamento incentivo — 10% da carteira ativa
  select sum(c.valor_plano) into v_carteira
    from public.representante_contratos c
   where c.representante_id = p_representante_id
     and c.data_venda <= v_fim
     and c.cancelado_em is null
     and c.valor_plano is not null;

  if coalesce(v_carteira, 0) > 0 then
    v_incentivo := round(v_carteira * 0.10, 2);
    insert into public.ordem_pagamento_itens
      (ordem_id, tipo, referencia, descricao, valor_bruto, sinal, data_referencia)
    values (v_ordem, 'pagamento_incentivo', to_char(v_carteira, 'FM999999990.00'),
            'Incentivo comercial — 10% da carteira ativa (' ||
              to_char(v_carteira, 'FM999G999G990D00') || ')',
            v_incentivo, 1, v_fim);
  end if;

  return v_ordem;
end;
$fn$;

-- =====================================================================
-- 10) Pagamento — só com autorização completa, e registrando como pagou
-- Quem monta a ordem não a paga: fechar é da operação, pagar é da
-- gerência. Essa separação é o ponto da autorização financeira.
-- =====================================================================
drop function if exists public.pagar_ordem_pagamento(uuid);

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
  if not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Apenas a gerência pode efetivar o pagamento.';
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


-- Reabrir: uma ordem recusada ou com erro precisa de caminho de volta,
-- senão fica presa em "fechada" e o único jeito seria cancelar tudo.
-- O conteúdo vai mudar, então as autorizações já dadas perdem validade
-- e voltam todas a pendente — aprovar de novo é o certo.
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
  if not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Apenas a gerência pode reabrir uma ordem.';
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

-- Cancelar uma ordem já paga deixa de ser ação de rotina: é a gerência
-- desfazendo um pagamento, não a operação corrigindo um rascunho.
create or replace function public.cancelar_ordem_pagamento(
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
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select status into v_status from public.ordens_pagamento
   where id = p_ordem_id and cancelado_em is null;
  if v_status is null then raise exception 'Ordem inexistente ou já cancelada.'; end if;
  if v_status = 'paga' and not public.f_tem_papel(auth.uid(), 'admin') then
    raise exception 'Ordem já paga — apenas a gerência pode cancelar.';
  end if;

  update public.ordens_pagamento
     set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where id = p_ordem_id;
end;
$fn$;

-- =====================================================================
-- 11) Visões — a ordem consolidada e o cruzamento financeiro
-- =====================================================================
create or replace view public.v_ordens_pagamento
with (security_invoker = on) as
select
  o.id,
  o.representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  o.supervisor_id,
  sup.nome as supervisor_nome,
  o.competencia,
  o.status,
  coalesce(i.total_bruto, 0) as total_bruto,
  coalesce(i.total_desconto, 0) as total_desconto,
  coalesce(i.total_liquido, 0) as total_liquido,
  coalesce(i.qtd_itens, 0) as itens,
  coalesce(s.saldo_devedor, 0) as saldo_devedor_atual,
  coalesce(a.exigidas, 0) as autorizacoes_exigidas,
  coalesce(a.concedidas, 0) as autorizacoes_concedidas,
  coalesce(a.recusadas, 0) as autorizacoes_recusadas,
  (o.status = 'fechada'
   and coalesce(a.recusadas, 0) = 0
   and coalesce(a.exigidas, 0) = coalesce(a.concedidas, 0)) as liberada_para_pagamento,
  o.destinatario_nome,
  o.destinatario_motivo,
  coalesce(o.destinatario_nome, r.favorecido, r.nome) as favorecido_efetivo,
  coalesce(o.destinatario_banco, r.banco) as banco_efetivo,
  coalesce(o.destinatario_agencia, r.agencia) as agencia_efetiva,
  coalesce(o.destinatario_conta, r.conta) as conta_efetiva,
  o.forma_pagamento,
  o.data_pagamento,
  o.valor_pago,
  o.comprovante,
  o.criado_em,
  o.fechado_em,
  o.pago_em
from public.ordens_pagamento o
join public.representantes r on r.id = o.representante_id
left join public.supervisores sup on sup.id = o.supervisor_id
left join lateral (
  select sum(it.sinal * it.valor_bruto) as total_bruto,
         sum(it.desconto) as total_desconto,
         sum(it.valor_liquido) as total_liquido,
         count(*) as qtd_itens
    from public.ordem_pagamento_itens it
   where it.ordem_id = o.id
) i on true
left join lateral (
  select count(*) as exigidas,
         count(*) filter (where au.decisao = 'autorizada') as concedidas,
         count(*) filter (where au.decisao = 'recusada') as recusadas
    from public.ordem_pagamento_autorizacoes au
   where au.ordem_id = o.id
) a on true
left join public.v_representante_saldo_devedor s on s.representante_id = o.representante_id
where o.cancelado_em is null;

-- A ordem como o formulário mostra: rubrica, data, valor, observação.
create or replace view public.v_ordem_pagamento_linhas
with (security_invoker = on) as
select
  i.ordem_id,
  i.id as item_id,
  r.codigo as rubrica,
  r.rotulo,
  r.ordem as ordem_exibicao,
  r.automatica,
  r.gera_debito,
  i.contrato_id,
  i.referencia as codigo_contrato,
  i.descricao,
  i.data_referencia,
  i.valor_bruto,
  i.desconto,
  i.valor_liquido,
  i.observacao
from public.ordem_pagamento_itens i
join public.rubricas_pagamento r on r.codigo = i.tipo;

-- Cruzamento por representante e competência: o que foi apurado, o que
-- saiu, e quanto ele ainda deve.
create or replace view public.v_financeiro_representante
with (security_invoker = on) as
select
  r.id as representante_id,
  r.codigo as representante_codigo,
  r.nome as representante_nome,
  o.competencia,
  o.status,
  coalesce(v.total_liquido, 0) as total_apurado,
  coalesce(o.valor_pago, 0) as total_pago,
  coalesce(v.total_liquido, 0) - coalesce(o.valor_pago, 0) as diferenca,
  coalesce(s.saldo_devedor, 0) as saldo_devedor,
  (select count(*) from public.representante_contratos c
    where c.representante_id = r.id
      and c.cancelado_em is null
      and c.data_venda between o.competencia
        and (o.competencia + interval '1 month - 1 day')::date) as contratos_no_mes
from public.representantes r
join public.ordens_pagamento o on o.representante_id = r.id and o.cancelado_em is null
join public.v_ordens_pagamento v on v.id = o.id
left join public.v_representante_saldo_devedor s on s.representante_id = r.id;

-- =====================================================================
-- 12) RLS
-- =====================================================================
alter table public.rubricas_pagamento enable row level security;
alter table public.ordem_pagamento_autorizacoes enable row level security;

drop policy if exists rubricas_pagamento_select on public.rubricas_pagamento;
create policy rubricas_pagamento_select on public.rubricas_pagamento
  for select to authenticated using (public.pode_ver_financeiro(auth.uid()));

drop policy if exists ordem_pagamento_autorizacoes_select on public.ordem_pagamento_autorizacoes;
create policy ordem_pagamento_autorizacoes_select on public.ordem_pagamento_autorizacoes
  for select to authenticated using (public.pode_ver_financeiro(auth.uid()));

revoke all on public.rubricas_pagamento from anon;
revoke all on public.ordem_pagamento_autorizacoes from anon;
revoke insert, update, delete, truncate on public.rubricas_pagamento from authenticated;
revoke insert, update, delete, truncate on public.ordem_pagamento_autorizacoes from authenticated;
grant select on public.rubricas_pagamento to authenticated;
grant select on public.ordem_pagamento_autorizacoes to authenticated;

-- Supervisão precisa enxergar a ordem que está autorizando.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'ordens_pagamento', 'ordem_pagamento_itens',
    'representantes', 'representante_contratos', 'supervisores'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_tabela || '_select_supervisao', v_tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pode_ver_financeiro(auth.uid()))',
      v_tabela || '_select_supervisao', v_tabela);
  end loop;
end
$$;

grant execute on function
  public.atualizar_dados_financeiros_representante(uuid, numeric, text, text, text, text, text, text),
  public.definir_destinatario_ordem(uuid, text, text, text, text, text, text, text),
  public.limpar_destinatario_ordem(uuid),
  public.exigir_autorizacao_ordem(uuid, text, text),
  public.remover_exigencia_autorizacao(uuid, text),
  public.decidir_autorizacao_ordem(uuid, text, text, text, text),
  public.adicionar_item_ordem(uuid, text, numeric, date, text, uuid, numeric),
  public.remover_item_ordem(uuid),
  public.pagar_ordem_pagamento(uuid, text, date, numeric, text),
  public.reabrir_ordem_pagamento(uuid, text)
to authenticated;
