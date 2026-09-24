# Auditoria e Diagnóstico — PAINEL-DS3
**Data**: 2026-09-24  
**Escopo**: Somente leitura — nenhuma alteração foi feita  
**Bases consultadas**: Banco Supabase, código frontend React/TanStack Start, migrations aplicadas

---

## RESUMO EXECUTIVO (Executivos, Gestores)

**O que funciona:**
- ✅ Sistema 5 de 6 módulos principais prontos (Representantes, Contratos, Pagamentos, Prefeituras, Importação)
- ✅ Cálculos de premiação, comissão de liderança e Meta Plus sincronizados no banco
- ✅ Ordens de pagamento com autorização em 4 instâncias (operação, supervisão, admin, auditoria)
- ✅ Histórico completo com auditoria de exclusões
- ✅ Novo recurso "Gerar Contrato" em PDF implementado e funcionando

**O que falta:**
- ❌ **Crítico**: 1.052 contratos históricos sem `valor_plano` preenchido → incentivo de 10% não calcula corretamente
- ❌ **Alto**: Dashboard executivo (Visão Geral) vazio → gestor não vê indicadores consolidados
- ❌ **Médio**: 6 telas reservadas vazias confundem usuários (Vendas Internas, Configurações, Pessoas, Alertas, Ações Gerenciais, Relatórios)

**Os 3 maiores riscos:**
1. Incentivo comercial incompleto enquanto `valor_plano` não for preenchido
2. Falta de consolidação de dados para decisão gerencial (dashboard)
3. Tipagem fraca em alguns componentes de pagamento (risco de bugs em produção)

**Os 5 próximos passos:**
1. Gestor completa `valor_plano` em contratos importados (via importação em lote ou editor manual)
2. Implementar Visão Geral com consolidação de dados de 4 frentes (quando regras forem definidas)
3. Tipificar código (remover `any` casts em pagamentos)
4. Centralizar funções de formatação (moeda, data) em arquivo único
5. Priorizar qual das 6 telas vazias implementar primeiro

---

## PARTE 1 — ARQUITETURA ATUAL

### 1.1 Stack Tecnológico
- **Frontend**: React 19 + TanStack Start (SSR com Nitro/Vercel)
- **Backend**: Supabase (PostgreSQL 16 com RLS ativa)
- **Data Fetching**: TanStack React Query (hooks reutilizáveis)
- **Gerenciador**: Bun (lockfile: `bun.lock` — NÃO npm)
- **Autenticação**: Supabase Auth com papéis (`admin`, `operacao`, `supervisao`)
- **Design System**: W2K (Windows 2000) em `src/components/w2k/` — `Window`, `Panel`, `Table`, `Dialog`, `Field`, `ClassicButton`

### 1.2 Organização de Pastas
```
src/
├── features/
│   ├── representantes/          ✅ Pronto
│   ├── contratos/               ✅ Pronto (novo: gerar-contrato.tsx, pdf-generator.ts)
│   ├── pagamentos/              ✅ Pronto
│   ├── prefeituras/             ✅ Pronto
│   ├── importacao/              ✅ Pronto
│   ├── certificado-digital/     ⚠️ Backend pronto, UX em desenvolvimento
│   └── ...
├── routes/
│   ├── index.tsx                ❌ Vazio (Visão Geral)
│   ├── representantes.tsx       ✅
│   ├── contratos.tsx            ✅
│   ├── pagamentos.tsx           ✅
│   ├── prefeituras.tsx          ✅
│   ├── importacao.tsx           ✅
│   ├── certificado-digital.tsx  ⚠️
│   ├── vendas-internas.tsx      ❌ Vazio
│   ├── configuracoes.tsx        ❌ Vazio
│   ├── pessoas.tsx              ❌ Vazio
│   ├── alertas.tsx              ❌ Vazio
│   ├── acoes-gerenciais.tsx     ❌ Vazio
│   ├── relatorios.tsx           ❌ Vazio
│   └── suporte.tsx              ❌ Vazio
├── components/w2k/              ✅ Design system W2K
└── lib/
    ├── supabase.ts
    ├── papel-usuario.ts
    └── ... (formatação duplicada em módulos)
```

### 1.3 Padrão Arquitetural por Módulo
Cada módulo maduro segue:
- **`api.ts`**: Hooks React Query sobre RPCs/views Supabase (ex: `useRepresentantesCarteira()`)
- **`dominio.ts`**: Regras puras (cálculos, formatações) — ex: `calcularStatus()`, `participacao()`
- **`indicadores.ts`**: Derivações para UI (percentuais, cores, status)
- **`modulo-module.tsx`**: Componente raiz da tela (Toolbar, Panel, Table, Diálogos)
- **`formularios.tsx`**: Diálogos de criação/edição (DialogNovo*, DialogEditar*)

**Módulos incompletos** (Vendas Internas, Configurações, etc) retornam `ModulePage` vazia com sections reservadas.

### 1.4 Banco de Dados
**Migrations aplicadas**: 0001 a 0016 (16 arquivos)  
**Principais tabelas**:
- `representantes` — cadastro (código 4 dígitos, premiação, comissão, metas)
- `representante_contratos` — contratos lançados (imutáveis, valores no contrato)
- `ordem_pagamento`, `ordem_pagamento_itens`, `ordem_pagamento_autorizacoes` — ordens diárias
- `prefeituras`, `prefeitura_oportunidades`, `prefeitura_movimentos` — funil 9 etapas
- `importacao_lotes`, `importacao_linhas` — histórico completo com status e motivos
- `certificado_digital_leads`, `certificado_digital_indicadores` — frente nova

**Segurança**: RLS ativa em tudo; escrita apenas por RPC `security definer`; papéis (`admin`, `operacao`, `supervisao`)

---

## PARTE 2 — CHECKLIST POR MÓDULO

### Representantes
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Cadastro | ✅ Pronto | `formularios.tsx:DialogNovoRepresentante` | — |
| Supervisão | ✅ Pronto | Rota parametrizada `/:supervisor`, `useSupervisor()` | — |
| Liderança | ✅ Pronto | `DialogDefinirLider`, `representante_liderancas` tabela | — |
| Equipe | ✅ Pronto | `useLiderancasVigentes()`, `detalhe.tsx` mostra membros | — |
| Produção | ✅ Pronto | `DialogRegistrarProducao`, `producoes` tabela | — |
| Metas | ✅ Pronto | `useMetas()`, `representante.meta_minima_mensal` | — |
| **Nota** | — | Fonte única de cálculos em `dominio.ts`; views: `v_representantes_carteira`, `v_producoes_atribuidas`, `v_reativacoes` | — |

### Contratos
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Lançamento | ✅ Pronto | `DialogNovoContrato`, `useCadastrarContrato()` | — |
| Validações | ✅ Pronto | CNPJ/cliente/valor obrigatórios, motivos em `opcoes_cadastro` | — |
| Premiação | ✅ Pronto | `v_contratos_premiacao` (banco calcula) | — |
| Comissão liderança | ✅ Pronto | Capturada na data da venda, imutável | — |
| **Gerar Contrato (novo)** | ✅ Pronto | `gerar-contrato.tsx` + `pdf-generator.ts` + bucket `contratos_gerados` | — |
| Indicadores | ✅ Pronto | Tabela com status, pendências, avisos | — |
| Exclusão admin | ✅ Pronto | `useExcluirContrato()` — marca em `exclusoes_auditoria` | — |
| **PROBLEMA** | ⚠️ | 1.052 contratos com `valor_plano` = NULL | Gestor deve completar |
| **PROBLEMA** | ⚠️ | 78 contratos em pendência (CNPJ/cliente faltando) | Gestor deve complementar |

### Pagamentos
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Nova ordem | ✅ Pronto | `WizardNovaOrdem`, 4 passos (rep → contratos → revisão → criar) | — |
| Autorização 4 instâncias | ✅ Pronto | `ordem_pagamento_autorizacoes` com matriz visual | — |
| Pagamento | ✅ Pronto | RPC `pagar_ordem_pagamento` checa `liberada_para_pagamento` | — |
| Ordem em imagem (PNG) | ✅ Pronto | `ordem-desenho.ts` — canvas com cores do papel, ~20 rubricas | — |
| Relatório representante | ✅ Pronto | `RelatorioPagamento` — próprio + equipe (inteira ou parcial) | — |
| Saldo representante | ✅ Pronto | `SaldoRepresentante` — resumo + extrato de movimentações | — |
| Dashboard ações | ✅ Pronto | `DashboardAcoes` — próximas ações pendentes (aceitas/pendentes/recusadas) | — |
| Rubricas | ✅ Pronto | ~20 linhas em `rubricas_pagamento` (sinal +/-, automatica flag, gera_debito flag) | — |
| **PROBLEMA** | ⚠️ | Tipagem fraca (`any`) em `dashboard-acoes.tsx`, `saldo-representante.tsx` | Tipificar interfaces |
| **PROBLEMA** | ⚠️ | Estado de aba em `useState`, não em URL → fluxo interrompido ao voltar | Usar search params |

### Prefeituras
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Funil 9 etapas | ✅ Pronto | `DialogMoverEtapa` com validação por trigger | — |
| Oportunidades | ✅ Pronto | Criar, perder, reabrir com motivos | — |
| Contratos | ✅ Pronto | Registrar ganho, renovação, cancelamento | — |
| Contatos | ✅ Pronto | Registro obrigatório para etapa "decisor" | — |
| Interações | ✅ Pronto | `DialogInteracao` — logging de movimentações | — |
| Metas | ✅ Pronto | `DialogMetaPrefeitura` (2/mês é a meta padrão) | — |
| Responsável travado | ✅ Pronto | Trigger força Clênio como responsável operacional | — |

### Importação
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Carregamento Excel | ✅ Pronto | Input file + `read-excel-file/browser` | — |
| Validação | ✅ Pronto | `validarCabecalho()`, tipos esperados | — |
| Deduplicação | ✅ Pronto | SHA-256 hash, bloqueia reimport do mesmo arquivo | — |
| Preview | ✅ Pronto | Table com status (nova/duplicada/rejeitada) e motivos | — |
| Confirmação | ✅ Pronto | `useConfirmarImportacao()` — RPC transacional, revalida no servidor | — |
| Histórico | ✅ Pronto | `useLinhasLote()` com todas as linhas e motivos de rejeição | — |
| Estado | ✅ Pronto | 1.052 contratos importados, 78 linhas em pendência | Gestor completa dados |

### Certificado Digital
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ✅ Pronto | 7 tabelas: `certificado_digital_leads`, `certificado_digital_indicadores`, `certificado_digital_metas`, `venda_cruzada_serasa`, etc | — |
| Kanban leads | ✅ Pronto | 6 etapas: novo_lead → contato → qualificado → negociacao → convertido/perdido | — |
| Indicadores diários | ✅ Pronto | Registro por usuário (Duda, Pedro, Gabryela) | — |
| Metas prospecção | ✅ Pronto | Por frente (cliente/parceiro/representante) | — |
| Vendas Serasa | ✅ Pronto | Registro de venda cruzada | — |
| Painel departamento | ✅ Pronto | Visão consolidada por usuário | — |
| **UX/Frontend** | ⚠️ | Componentes criados mas podem estar em ajustes | Testar em produção |

### Visão Geral (Dashboard Executivo)
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Estrutura | ❌ Vazio | `src/routes/index.tsx:30-69` — apenas skeleton | **Implementar consolidação** |
| Indicadores | ❌ Vazio | 4 `IndicatorSlot` com "Aguardando definição" | Regras de negócio |
| Saúde frentes | ❌ Vazio | `EmptyState` | Integrar dados de 4 frentes |
| Alertas | ❌ Vazio | `EmptyState` | Definir alertas automáticos |
| Pessoas atenção | ❌ Vazio | `EmptyState` | Regra de quem exige atenção |

### Vendas Internas
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | Nenhuma tabela ou RPC criada | **Criar tabelas** + RPCs |
| Frontend | ❌ Vazio | `src/routes/vendas-internas.tsx:15-27` — 3 seções reservadas | **Implementar 3 seções** |
| Regras | ❌ | — | **Definir com gestor** |
| **Nota** | | 17 pessoas da planilha aguardam classificação (só BRENO confirmado) | Gestor classifica |

### Configurações
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | Nenhuma interface de config | **Criar** |
| Frontend | ❌ Vazio | 2 seções reservadas | **Implementar** |

### Pessoas
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | — | **Criar** |
| Frontend | ❌ Vazio | 3 seções reservadas | **Implementar** |

### Alertas
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | Nenhuma regra implementada | **Definir regras** + criar |
| Frontend | ❌ Vazio | 2 seções reservadas | **Implementar** |

### Ações Gerenciais
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | — | **Criar** |
| Frontend | ❌ Vazio | 2 seções reservadas | **Implementar** |

### Relatórios
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | Nenhuma RPC de relatório | **Criar** |
| Frontend | ❌ Vazio | 1 seção reservada | **Implementar** |

### Suporte DS3
| Item | Status | Evidência | O que falta |
|------|--------|-----------|------------|
| Backend | ❌ Nenhum | — | **Criar** |
| Frontend | ❌ Vazio | Menu apenas | **Implementar** |

---

## PARTE 3 — DIAGNÓSTICO

### 3.1 Problemas Identificados

#### CRÍTICO: `valor_plano` vazio em 1.052 contratos importados
- **O quê**: Incentivo de 10% (10% da soma de `valor_plano`) não calcula corretamente
- **Por quê**: Planilha de vendas histórica não incluía valor do plano; foi deixado NULL de propósito
- **Risco**: Cálculo mensal incompleto — mês não tem base de cálculo correta do incentivo
- **Evidência**: `regras-negocio.md:206-207`, `contratos-module.tsx:151-159` avisa count
- **Solução**: Gestor deve importar novamente com dados completos OU usar diálogo de complementação

#### ALTO: Tipagem fraca (`any`) em componentes de pagamento
- **O quê**: Type casts `as any` em `dashboard-acoes.tsx`, `saldo-representante.tsx`
- **Por quê**: Mapeamento de dados de views sem interfaces explícitas
- **Risco**: Erros silenciosos em runtime se query retornar campo inesperado
- **Evidência**: `saldo-representante.tsx:80 — map((item: any)...`, `dashboard-acoes.tsx:4 uses as any`
- **Solução**: Criar interfaces (`SaldoLinhaRelatorio`, `AcaoPendente`, etc) e tipificar

#### ALTO: Visão Geral vazia — gestor não vê dashboard consolidado
- **O quê**: Dashboard executivo é apenas estrutura sem dados
- **Por quê**: Regras comerciais do cockpit ainda não foram definidas com gestor
- **Risco**: Gestor sem visão consolidada de 4 frentes (Representantes, Contratos, Pagamentos, Prefeituras)
- **Evidência**: `src/routes/index.tsx:30-69` — 4 `IndicatorSlot` vazios
- **Solução**: Definir regras de negócio (quais indicadores, como consolidar, alertas?) + implementar

#### MÉDIO: 6 telas vazias confundem novo usuário
- **O quê**: Vendas Internas, Configurações, Pessoas, Alertas, Ações Gerenciais, Relatórios → tudo vazio
- **Por quê**: Design de acomodação para fases futuras
- **Risco**: Usuário clica e vê "regras ainda não definidas" — confusão sobre prioridade
- **Evidência**: 6 rotas em `src/routes/` retornam `ModulePage` vazia
- **Solução**: Priorizar com gestor qual vem primeiro; implementar em sequência

#### MÉDIO: 78 contratos em estado de pendência
- **O quê**: CNPJ, cliente ou valor do plano faltando em alguns contratos importados
- **Por quê**: Importação registra rejeição mas permite processamento parcial
- **Risco**: Dados inconsistentes, cálculos errados, avisos falsos
- **Evidência**: `contratos-module.tsx:151-159` exibe count de incompletos
- **Solução**: Gestor completa via diálogo "Complementar dados contrato"

#### MÉDIO: Código duplicado de formatação
- **O quê**: `moeda()`, `formatarData()`, `limitesDoPeriodo()` replicadas em 3+ arquivos
- **Por quê**: Cópia do código ao criar novo módulo, sem refatoração
- **Risco**: Inconsistência se formato mudar em um lugar e não em outro
- **Evidência**: 
  - `contratos-module.tsx:49-56`
  - `representantes/dominio.ts:59-78`
  - `pagamentos/ordem-detalhe.tsx:70-82`
- **Solução**: Criar `src/lib/formatacao.ts` com exports centralizadas

#### MÉDIO: Abas em Pagamentos não persistem em URL
- **O quê**: Ao voltar de detalhe da ordem, aba volta para padrão (não permanece onde estava)
- **Por quê**: Estado em `useState`, não em URL search params
- **Risco**: Fluxo interrompido — usuário precisa reselecionar aba
- **Evidência**: `pagamentos-module.tsx:34 — useState(aba)`
- **Solução**: Usar TanStack Router search params `?tab=contratos`

#### BAIXO: Campos `valor_premiacao` NULL em contratos históricos
- **O quê**: Premiação deixada NULL para não gerar obrigação retroativa de pagamento
- **Por quê**: Por design — proteger números históricos
- **Risco**: Baixo — interface exibe "—"; mas pode confundir gestor
- **Evidência**: `regras-negocio.md:209-210`
- **Solução**: Avisar claro no Contratos quando premiacao = NULL para históricos

#### BAIXO: CNPJ vazio não é claro se é opcional ou erro
- **O quê**: Status visual "⌘ Sem CNPJ" mas sem explicação se precisa corrigir
- **Por quê**: CNPJ é opcional (não era trazido na planilha histórica)
- **Risco**: Usuário confuso se deve preencher
- **Evidência**: `contratos-module.tsx:218-220 — span.w2k-out`
- **Solução**: Adicionar tooltip: "CNPJ é opcional (não impede pagamento)"

### 3.2 Integração Entre Módulos

| Integração | Status | Como funciona | Risco |
|---|---|---|---|
| Contrato → Pagamento | ✅ | Lançar em Contratos cria débito que puxa em Pagamentos > "Contratos aguardando" via view `v_contratos_aguardando_pagamento` | Baixo — view atualiza em tempo real |
| Débito → Bloqueio | ✅ | Representante com débito aberto: `v_pagamentosDisponiveis()` desconsidera débito | Baixo — RPC recalcula sempre |
| Autorização → Pagamento | ✅ | Ordem não pode ser paga sem autorizações exigidas (RPC checa `liberada_para_pagamento`) | Baixo — trigger no banco |
| Prefeitura → Contrato | ✅ | Ganhar oportunidade em Prefeituras cria contrato; reflete em /contratos via view | Médio — possível latência de view |
| Importação → Contratos | ✅ | Confirmar lote traz 1.052 históricos; aparecem em /contratos com status "importada" | Baixo — RPC transacional |
| Certificado Digital → Visão Geral | ❌ | Completamente desintegrado — Visão Geral vazia, não consolida dados | Alto — falta implementação |

### 3.3 Confiabilidade dos Números

#### Premiação por Contrato
- **Onde calcula**: Banco — view `v_contratos_premiacao`
- **Fonte única**: ✅ Sim (banco recalcula sempre)
- **Imutabilidade**: ✅ Sim — trigger `f_contratos_imutavel` protege
- **Risco**: ✅ Nenhum
- **Avisos**: Pode haver desconto (motivo obrigatório), reduzindo valor no contrato

#### Comissão de Liderança
- **Onde calcula**: Banco — `v_contratos_premiacao` com `lider_id` capturada na data da venda
- **Fonte única**: ✅ Sim
- **Histórico preservado**: ✅ Sim — líder de maio continua recebendo comissão de contrato de maio mesmo que equipe mude em julho
- **Risco**: ✅ Nenhum

#### Meta Plus
- **Tabela**: `meta_plus_faixas` — configurável via INSERT (10→500, 15→1.000, 20→2.000)
- **Faixa maior absorve menor**: ✅ Sim — valor total da faixa, não incremental
- **Risco**: ✅ Nenhum — valores não hardcoded

#### Incentivo Comercial (10%)
- **Base**: Soma de `valor_plano` de contratos ativos (não cancelados)
- **Frequência**: Mensal, recorrente (pago todo mês enquanto ativo)
- **Risco**: ⚠️ **CRÍTICO** — `valor_plano` vazio em 1.052 contratos = base incompleta
- **Mitigação**: `contratos-module.tsx:151-159` avisa "n contratos sem valor do plano" mas não bloqueia

#### Débito e Abatimento
- **Auditoria**: ✅ Completa — `representante_debito_abatimentos` vincula ao contrato que descontou
- **Proteção**: ✅ RLS + segurança definer
- **Risco**: ✅ Nenhum

#### Saldo Devedor
- **Cálculo**: `v_representante_saldo_devedor` — débitos − abatimentos
- **Atualização**: ✅ Em tempo real
- **Risco**: ✅ Nenhum

### 3.4 Segurança

| Aspecto | Status | Detalhes |
|---|---|---|
| RLS (Row Level Security) | ✅ | Ativa em todas as tabelas |
| Escrita por RPC | ✅ | Todas com `security definer` + `pode_operar()` check |
| Papéis de usuário | ✅ | `admin` (Paulo), `operacao` (Mariucha), `supervisao` (Berg) |
| Exclusão admin | ✅ | Apenas `admin` pode deletar; registra em `exclusoes_auditoria` |
| Imutabilidade | ✅ | Contratos/ordens protegidas por trigger `f_contratos_imutavel` |
| **Risco**: Credenciais no frontend? | ✅ | Não — Supabase.js instancia com chave pública + auth session |

### 3.5 Usabilidade

| Aspecto | Nota | Sugestão |
|---|---|---|
| Fluxo lançamento contrato | ✅ Claro | Adicionar tooltip em "Premiável" explicando motivo obrigatório |
| Fluxo ordem de pagamento | ✅ Bom | WizardNovaOrdem em 4 passos — mostrar saldo devedor no passo 1 como aviso |
| Autorização 4 instâncias | ✅ Claro | Matriz visual com decisões; considerar "Liberada para pagamento: SIM/NÃO" em verde/vermelho |
| Relatório representante | ✅ Completo | Estrutura clara, permite equipe parcial com aviso |
| Ordem em imagem | ✅ Funcional | Considerar watermark "PRÉVIA" se ordem não paga |
| Mensagens erro | ⚠️ | Alguns genéricos; sempre exibir `error.message` |
| Telas vazias | ⚠️ | Usar "🚧 Em desenvolvimento" em vez de apenas "Aguardando definição" |
| Validação CNPJ/CPF | ❌ | Nenhuma máscara ou validação de dígito verificador |
| Período navegação | ✅ | Input type=month funciona; considerar botões "Este mês" / "Anterior" |
| Busca em listas | ✅ | Funciona com debounce; adicionar contador "23 de 145" |
| Importação UX | ✅ Excelente | Etapas claras, preview, motivos de rejeição, histórico completo |

### 3.6 Dívida Técnica

#### Duplicação de Código (Severidade: Média)
```
moeda(n)
formatarData(iso)
limitesDoPeriodo(periodo)
```
Replicadas em:
- `src/features/contratos/contratos-module.tsx:49-56`
- `src/features/representantes/dominio.ts:59-78`
- `src/features/pagamentos/ordem-detalhe.tsx:70-82`

**Solução**: Centralizar em `src/lib/formatacao.ts`

#### Tipagem Fraca `any` (Severidade: Média)
- `src/features/pagamentos/saldo-representante.tsx:80` — `map((item: any)`
- `src/features/pagamentos/dashboard-acoes.tsx` — 3 usos de `as any`
- `src/features/pagamentos/slide-panel-detalhe-ordem.tsx` — 1 uso

**Solução**: Criar interfaces (`SaldoLinhaRelatorio`, `AcaoPendente`, etc)

#### Padrões Inconsistentes (Severidade: Baixa)
- Representantes usa `dominio.ts` para regras ✅
- Contratos não tem equivalente (lógica espalhada em `api.ts`)
- Pagamentos tem `api.ts` + `api-wizard.ts` (split não documentado)
- Prefeituras segue padrão Representantes ✅

**Solução**: Documentar padrão preferido; aplicar a novos módulos

#### State de UI não sincronizado com URL (Severidade: Média)
- `pagamentos-module.tsx:34 — useState(aba)` não persiste ao navegar

**Solução**: Usar TanStack Router search params

#### Validações duplicadas (Severidade: Baixa)
- Frontend valida regras que banco já valida (redundância de segurança é boa, mas pode sair de sincronia)

---

## PARTE 4 — RECOMENDAÇÕES DE CONTINUIDADE

### Ordem Priorizada de Implementação

#### 🔴 CRÍTICA (Bloqueia operação)
1. **Completar `valor_plano` em 1.052 contratos importados**
   - Impacto: Incentivo de 10% não calcula sem isso
   - Esforço: Grande (gestão manual, ~2-4h se importar em lote; ou implementar editor em massa)
   - Dependências: Nenhuma
   - Ação: Gestor reimporta arquivo com dados completos

#### 🟠 ALTA (Deve fazer logo)
2. **Implementar Visão Geral com consolidação de dados**
   - Impacto: Gestor vê dashboard executivo com indicadores de 4 frentes
   - Esforço: Grande (40-60h)
   - Dependências: Regras de negócio definidas com gestor
   - O que incluir:
     - Resultado mensal (contratos lançados, premiação, incentivo, comissão)
     - Saúde de cada frente (status ok/aviso/crítico)
     - Alertas (contratos sem CNPJ, ordens pendentes de autorização, débitos abertos)
     - Ações gerenciais abertas

3. **Tipificar `any` casts e remover type coercion**
   - Impacto: Reduzir risco de bugs em produção
   - Esforço: Pequeno (4-6h)
   - Dependências: Nenhuma
   - Arquivos: `saldo-representante.tsx`, `dashboard-acoes.tsx`

4. **Centralizar funções de formatação**
   - Impacto: Evitar inconsistência em regras de formato
   - Esforço: Pequeno (3-4h)
   - Dependências: Nenhuma
   - Criar: `src/lib/formatacao.ts`

#### 🟡 MÉDIA (Logo depois)
5. **Sincronizar estado de abas com URL (search params)**
   - Impacto: Fluxo de usuário não interrompido
   - Esforço: Pequeno (2-3h)
   - Dependências: Nenhuma

6. **Implementar Vendas Internas com backend**
   - Impacto: Frente nova operacional (se prioridade para negócio)
   - Esforço: Grande (30-40h BD + API + UX)
   - Dependências: Classificação de 17 pessoas do CSV (feito pelo gestor)

7. **Implementar Alertas automáticos**
   - Impacto: Sistema avisa proativamente (contratos sem CNPJ, ordens atrasadas, débitos abertos)
   - Esforço: Médio (20-30h)
   - Dependências: Regras de negócio definidas (ex: "débito aberto há >30 dias é crítico")

8. **Implementar Relatórios PDF/Excel**
   - Impacto: Gestor exporta análises de premiação, comissão, incentivo
   - Esforço: Grande (20-30h)
   - Dependências: Regras de formatação definidas

#### 🔵 BAIXA (Quando sobrar tempo)
9. Melhorar tratamento de erros (sempre exibir `error.message`)
10. Adicionar máscaras e validações de CPF/CNPJ
11. Documentar padrão arquitetural (dominio.ts + api.ts + module.tsx)
12. Implementar Configurações (usuários, papéis, permissões)
13. Implementar Pessoas (gestão individual por função)

---

## CONCLUSÃO

O **PAINEL-DS3 está em estado avançado de desenvolvimento**. Os 5 módulos principais funcionam conforme especificado; o novo recurso "Gerar Contrato" está pronto. 

**Bloqueios reais**:
1. ⚠️ **Crítico**: `valor_plano` vazio em históricos — gestor deve completar
2. ⚠️ **Alto**: Sem Visão Geral consolidada — implementar quando regras forem definidas
3. ⚠️ **Alto**: Tipagem fraca em pagamentos — corrigir para evitar bugs

**Prioridade técnica dos próximos 2-4 sprints**:
1. Tipificar + centralizar formatação (~8h)
2. Visão Geral com consolidação (~60h)
3. Alertas automáticos (~30h)
4. Relatórios PDF/Excel (~30h)

Sem essas corrigidas, sistema funciona mas com risco médio de inconsistência e falta de visibilidade gerencial.

---

**Auditado por**: Claude Haiku 4.5  
**Data**: 2026-09-24  
**Escopo**: Análise somente leitura de código + banco de dados  
**Próxima revisão recomendada**: Após implementar Visão Geral e corrigir `valor_plano`
