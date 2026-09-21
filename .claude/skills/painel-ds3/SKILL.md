---
name: painel-ds3
description: Contexto completo do Painel de Gestão DS3 — sistema de gestão comercial da DS3 (React/TanStack Start + Supabase + Vercel). Use SEMPRE que a conversa envolver este projeto, em qualquer forma que apareça — "o painel", "o sistema", "DS3", representantes, contratos, premiação, Meta Plus, incentivo comercial, ordens de pagamento, supervisores Berg/Clênio, prefeituras, certificado digital, vendas internas, importação de planilhas, ou qualquer migration, tabela ou tela deste repositório. Traz o mapa do banco, as regras de negócio já decididas, o fluxo de deploy e as armadilhas conhecidas, para não precisar reler migrations nem reperguntar o que já foi combinado.
---

# Painel de Gestão DS3

Sistema interno de gestão comercial da DS3. Consolida resultados de quatro
frentes (Representantes, Prefeituras, Vendas Internas, Certificado Digital) e
calcula a remuneração dos representantes.

Esta skill existe para você não gastar tempo (nem tokens) redescobrindo o que
já está decidido. Leia o que for relevante ao pedido e vá direto ao trabalho.

## Onde está cada coisa

| Arquivo | Quando ler |
| --- | --- |
| `references/banco.md` | Antes de escrever qualquer SQL ou mexer em dados — tabelas, RPCs, views |
| `references/regras-negocio.md` | Premiação, Meta Plus, incentivo, liderança, débito |
| `references/operacao.md` | Deploy, migrations, armadilhas já encontradas |

`CLAUDE.md` na raiz do repositório tem os links reais (produção, GitHub, Supabase).

## Como este projeto trabalha

O ponto que mais confunde quem chega: **você não aplica migrations**. Não há
conexão direta com o banco. O ciclo é sempre este:

1. Você escreve a migration numerada em `db/migrations/`
2. Entrega o arquivo ao gestor (`SendUserFile`)
3. **Ele** roda no SQL Editor do Supabase e responde "Success. No rows returned"
4. Só então você leva o código para `main`, que é o que a Vercel publica

Publicar o front antes da migration rodar quebra a tela em produção — a
aplicação chama uma função que ainda não existe. Por isso a ordem importa.

Para levar ao `main`, veja `references/operacao.md`: os dois branches têm
históricos Git não relacionados e um merge comum falha.

## Princípios que o sistema inteiro respeita

Estes vieram da especificação do gestor e estão implementados no banco, não
são convenção solta. Violá-los quebra coisas que já funcionam:

**Ausência não é zero.** Representante sem premiação cadastrada é `NULL`, não
`0`. Na tela aparece "Sem dado", nunca um zero que finge ser informação. Meta
não cadastrada não vira meta zero — o atingimento simplesmente não é calculado.

**Fato histórico não se reescreve.** Contrato, produção e movimento são
imutáveis por trigger. A correção é cancelamento rastreável (quem, quando,
por quê) ou, desde a migration 0011, exclusão administrativa auditada.
Nunca `UPDATE` num valor financeiro já gravado.

**O valor aplicado fica no fato.** O contrato guarda a premiação que foi
decidida no lançamento. Mudar depois o valor padrão do representante não
altera contratos passados — é isso que impede reprocessamento retroativo de
pagamento.

**Escrita sensível só por RPC.** As tabelas não aceitam INSERT/UPDATE/DELETE
direto de usuário autenticado. Tudo passa por função `security definer` que
verifica permissão com `pode_operar(auth.uid())`. RLS ativa em tudo.

**Sem dado, não preenche.** Nunca inferir data, escolher representante por
aproximação, completar CNPJ ou inventar status. Linha inválida na importação
é rejeitada com motivo, e o motivo fica gravado para correção depois.

## Convenções de código

O front é **React 19 + TanStack Start (SSR) + Supabase**, com **Bun** como
gerenciador (`bun.lock` é o lockfile real — nunca npm).

Cada frente vive em `src/features/<frente>/` com a mesma anatomia:
`api.ts` (hooks React Query sobre RPCs e views), `dominio.ts` (regras puras),
`indicadores.ts` (derivações de tela), `<frente>-module.tsx` (a tela),
`formularios.tsx` (diálogos). A rota em `src/routes/` só monta o módulo.

A interface usa um design system próprio estilo Windows 2000 em
`src/components/w2k/` — `Window`, `Panel`, `Table`, `Dialog`, `Field`,
`ClassicButton`, `IndicatorSlot`, `Alert`. Não introduza outro vocabulário
visual: a consistência entre módulos é o que faz o sistema parecer um só.

Textos de interface e mensagens de erro em português, diretos, sem jargão
técnico — quem usa é gestor e operação, não desenvolvedor.

## Estado das frentes

| Frente | Situação |
| --- | --- |
| Representantes | completo: cadastro, equipe, contratos, premiação |
| Financeiro | completo: rubricas do formulário real, débito, autorização em quatro instâncias, pagamento registrado |
| Prefeituras | funil de 9 etapas com RPCs e integridade no banco |
| Importação | infraestrutura pronta, ligada só a Representantes |
| Vendas Internas | tela vazia, sem backend |
| Certificado Digital | tela vazia, sem backend |
| Relatório de pagamento por representante | especificado (equipe inteira × parcial para líderes), **não construído** |
| Relatórios PDF/Excel | não existe |
| Visão Geral (dashboard) | tela estática |
| Ações Gerenciais, Alertas, Pessoas, Suporte | telas vazias |

Quando for construir uma frente nova, espelhe a estrutura de
`src/features/representantes/` — ela é a referência madura do projeto.

## Como conversar com o gestor

Ele é o dono do negócio, não desenvolvedor. O que funciona:

- Resposta curta primeiro, detalhe depois — ele costuma pedir "objetivo e prático"
- Uma decisão de cada vez, com as opções reais e a recomendação
- Nunca supor regra de negócio: se o dado não existe, pergunte antes de inventar
- Ao entregar, diga o que testar e onde clicar

Quando encontrar um problema real (dado inconsistente, regra que se contradiz,
risco de recalcular pagamento antigo), diga na hora, em uma ou duas frases, e
siga com o que dá para fazer. Ele decide — mas decide informado.
