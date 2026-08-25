# Foundation Panel

PAINEL DE GESTÃO DS3 — FUNDAÇÃO TÉCNICA

Atue como CTO, arquiteto de software e engenheiro full-stack sênior.

Esta é a PRIMEIRA implementação de um novo sistema chamado Painel de Gestão DS3.

OBJETIVO DESTA EXECUÇÃO

Construir SOMENTE a fundação técnica, visual e estrutural do sistema.

NÃO implementar ainda regras comerciais completas, cálculos de performance, automações, gamificação, IA, dados demonstrativos, integrações comerciais ou funcionalidades não expressamente autorizadas.

A aplicação será desenvolvida com:

Lovable: desenvolvimento;

GitHub: código e versionamento;

Supabase: banco, autenticação e backend;

Vercel: hospedagem final.

Evite dependências exclusivas do Lovable Cloud que dificultem a hospedagem externa.

1. REGRA ABSOLUTA DE NÃO INVENÇÃO

NÃO invente:

regras de negócio;

dados;

usuários;

metas;

valores;

KPIs;

fórmulas;

tabelas de negócio desnecessárias nesta fase;

colunas comerciais;

relacionamentos não definidos;

integrações;

APIs;

automações;

permissões complexas;

gamificação;

IA;

notificações externas;

departamentos;

pessoas;

funcionalidades.

Se encontrar uma necessidade não definida que exija decisão de negócio, entidade, campo crítico, relacionamento, cálculo, permissão, integração ou comportamento:

NÃO decida autonomamente.

Preserve o que puder ser executado com segurança e informe objetivamente:

o ponto bloqueado;

por que precisa de decisão;

alternativas tecnicamente válidas;

recomendação técnica.

Não utilize dados fictícios para preencher telas.

Estado sem dados deve aparecer como estado vazio real.

2. ARQUITETURA

Preparar a aplicação para:

Frontend → aplicação web
Backend/Banco/Auth → Supabase
Versionamento → GitHub
Deploy → Vercel

A arquitetura deve permitir funcionamento independente de créditos Lovable após hospedagem externa.

Não introduza dependências proprietárias desnecessárias do Lovable Cloud.

Nunca exponha secrets, chaves privadas ou service_role no frontend.

3. AUDITORIA ANTES DE ALTERAR

Antes de criar qualquer estrutura:

inspecione o projeto atual;

identifique arquivos e componentes existentes;

verifique configuração atual;

verifique conexão Supabase, se existente;

verifique schema existente;

verifique autenticação existente;

reutilize estruturas adequadas;

não duplique componentes ou estruturas existentes.

Como o projeto é novo, não presuma que esteja completamente vazio sem verificar.

Altere SOMENTE o necessário para esta fundação.

Não reorganize, renomeie ou refatore partes sem necessidade técnica comprovada.

4. ESTRUTURA FUNCIONAL DA NAVEGAÇÃO

Criar a estrutura de navegação preparada para os seguintes módulos:

Visão Geral

Cockpit executivo da DS3.

Representantes

Subáreas:

Berg

Clênio

IMPORTANTE:
Berg e Clênio utilizam a MESMA arquitetura de gestão de representantes.

Não criar duas implementações independentes.

A diferença deve ocorrer por supervisor/filtro/contexto.

Prefeituras

Frente própria.

Não misturar com Representantes Clênio.

Vendas Internas

Frente própria.

Certificado Digital

Frente própria.

Preparar organização interna para futura implementação de:

visão geral;

produção;

emissões;

renovações;

clientes;

representantes;

parceiros/contadores;

custos;

certificadoras;

conversões comerciais relacionadas.

Não implementar regras ou cálculos ainda.

Suporte DS3

Área operacional de suporte/Mariucha.

Não tratar suporte como vendas.

Pessoas

Preparar área para futura gestão individual por função.

Ações Gerenciais

Preparar módulo próprio.

Alertas

Preparar módulo próprio.

Relatórios

Preparar módulo próprio.

Importação

Preparar módulo para futura importação Excel.

Configurações

Somente estrutura necessária.

5. NAVEGAÇÃO

A navegação deve ser simples e rápida.

Estrutura conceitual:

Arquivo

Importar

Exportar

Sair

Gestão

Visão Geral

Representantes

Berg

Clênio

Prefeituras

Vendas Internas

Certificado Digital

Suporte DS3

Análise

Pessoas

Ações Gerenciais

Alertas

Relatórios

Sistema

Configurações

Evitar menus redundantes.

As telas desta fase podem utilizar estados vazios funcionais informando claramente que ainda não existem dados.

Não criar dados fake.

6. IDENTIDADE VISUAL — WINDOWS 2000

A interface deve adotar estética inspirada no Windows 2000 clássico, mas com engenharia e usabilidade modernas.

Criar um design system reutilizável.

Elementos visuais:

cinzas clássicos;

bordas 3D discretas;

title bars;

menu bar;

toolbar;

tabs clássicas;

botões quadrados;

campos de formulário clássicos;

tabelas compactas;

painéis;

dialogs;

status bar;

ícones coerentes com a linguagem visual;

tipografia compacta e altamente legível.

Criar componentes reutilizáveis equivalentes conceitualmente a:

Window

TitleBar

MenuBar

Toolbar

Tabs

Panel

ClassicButton

Input

Select

Table

StatusBar

Dialog

Alert

Progress

Não espalhar CSS específico repetido por cada tela.

Centralizar tokens e componentes visuais.

IMPORTANTE:

Windows 2000 é a linguagem estética, NÃO uma limitação tecnológica.

Preservar:

responsividade;

acessibilidade;

legibilidade;

performance;

feedback imediato;

navegação rápida;

baixa carga cognitiva.

Não usar efeitos modernos incompatíveis com a proposta, como glassmorphism, gradientes exagerados, sombras sofisticadas ou animações decorativas.

7. COCKPIT EXECUTIVO — SOMENTE ESTRUTURA

Criar a estrutura visual da Visão Geral preparada para futuramente receber:

resultados;

metas;

saúde das frentes;

alertas;

ações pendentes;

indicadores;

pessoas/frentes que exigem atenção.

Nesta fase:

NÃO criar números fictícios.

Usar estados vazios claros, por exemplo:

“Nenhum dado registrado para o período.”

Não exibir 0 quando o dado não existe.

8. PRINCÍPIOS DE DADOS QUE DEVEM SER PRESERVADOS

Mesmo sem implementar toda a lógica comercial agora, preparar a arquitetura respeitando:

AUSÊNCIA ≠ ZERO

ATIVADO ≠ ATIVO

PROSPECTADO ≠ CONVERTIDO

CONTRATO ≠ OPORTUNIDADE

REPRESENTANTE ≠ PARCEIRO

CERTIFICADO ≠ VENDA SERASA

META ≠ INDICADOR

HIPÓTESE ≠ FATO

Não simplificar entidades futuras de forma que essas diferenças se tornem impossíveis de representar.

9. BANCO DE DADOS

Nesta fase, aplicar a política de schema mínimo necessário.

Não criar antecipadamente todas as tabelas comerciais do sistema apenas para “preparar o futuro”.

Criar somente estruturas comprovadamente necessárias para a fundação atual, autenticação e funcionamento básico.

As entidades comerciais serão implementadas posteriormente com migrations incrementais e auditadas.

Se o Supabase ainda não estiver conectado/configurado e isso impedir criação segura do banco:

não inventar configuração nem substituir por armazenamento local permanente.

Informar a dependência necessária.

10. AUTENTICAÇÃO E SEGURANÇA

O sistema inicialmente será utilizado por um único gestor.

Não implementar agora hierarquia complexa de usuários.

Entretanto, evitar decisões arquiteturais que impeçam futura evolução para múltiplos usuários e permissões.

Se autenticação Supabase estiver disponível, estruturar autenticação básica segura.

Aplicar menor privilégio.

Não expor informações sensíveis no cliente.

Não criar usuários fictícios.

11. IMPORTAÇÃO

Nesta fase criar somente a estrutura/tela do módulo.

A futura implementação deverá seguir:

arquivo → mapeamento → validação → duplicidades → prévia → erros → confirmação → gravação → log

NÃO implementar importação direta que grave arquivos no banco sem essas proteções.

12. ESTADOS DA INTERFACE

Toda estrutura criada deve prever corretamente:

loading;

vazio;

erro;

sucesso;

sem resultado;

indisponível.

Nunca preencher ausência de informação com valores artificiais.

13. PERFORMANCE

Manter bundle e componentes enxutos.

Evitar:

bibliotecas desnecessárias;

dependências pesadas apenas para estética;

componentes duplicados;

carregamentos globais desnecessários;

lógica repetida;

abstrações prematuras.

O design Windows 2000 deve ser obtido preferencialmente pelo próprio design system da aplicação.

14. RESPONSIVIDADE

Prioridade operacional inicial: desktop.

Ainda assim, a interface não deve quebrar em telas menores.

Tabelas extensas podem utilizar comportamento responsivo adequado, inclusive scroll horizontal quando tecnicamente melhor que comprimir informações.

Não sacrificar legibilidade para tentar transformar tabelas complexas em cards mobile desnecessários.

15. FORA DO ESCOPO DESTA EXECUÇÃO

NÃO implementar agora:

regras completas de Berg;

regras completas de Clênio;

cálculos de atividade/inatividade;

metas comerciais;

funis completos;

regras de Prefeituras;

regras de Vendas Internas;

regras completas do Certificado Digital;

regras de Gabryela;

custos de certificadoras;

cálculos de conversão;

regras de Mariucha;

Skill/Will/Hill;

scoring;

gamificação;

IA;

alertas automáticos;

relatórios analíticos completos;

importação funcional;

integrações externas;

dados de demonstração;

automações;

notificações externas.

Esses itens serão implementados posteriormente sobre a fundação validada.

16. ECONOMIA DE CRÉDITOS E RETRABALHO

Execute esta fundação de maneira consolidada.

Não faça alterações experimentais.

Não crie alternativas visuais para escolher depois.

Não implemente funcionalidades extras.

Não faça refatorações cosméticas fora do escopo.

Reutilize componentes.

Não tente antecipar fases futuras.

Prefira a menor implementação profissional que cumpra integralmente esta etapa.

17. CRITÉRIOS DE ACEITE

Antes de concluir, validar:

aplicação inicializa sem erros;

navegação funciona;

todos os módulos previstos estão acessíveis;

Berg e Clênio não foram implementados como sistemas duplicados;

Prefeituras permanece separada;

Certificado Digital permanece separado;

Suporte não foi tratado como vendas;

design system Windows 2000 está centralizado e reutilizável;

layout desktop está consistente;

responsividade básica funciona;

estados vazios não inventam dados;

nenhuma regra comercial foi inventada;

nenhuma funcionalidade fora do escopo foi adicionada;

nenhuma dependência desnecessária foi introduzida;

arquitetura permanece compatível com GitHub + Supabase + Vercel;

secrets não estão expostos;

nada fora desta solicitação foi alterado.

18. RELATÓRIO FINAL OBRIGATÓRIO

Ao terminar, NÃO continue implementando outras fases.

Informe objetivamente:

arquivos/componentes criados ou alterados;

estrutura de navegação criada;

estrutura do design system;

situação da conexão com Supabase;

situação da autenticação;

dependências adicionadas, se houver;

qualquer decisão que NÃO foi tomada por falta de autorização;

problemas encontrados;

testes realizados;

confirmação de que nada fora do escopo foi implementado.

Se algum critério de aceite não puder ser confirmado, declare explicitamente qual.

NÃO iniciar a próxima fase sem autorização.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ds3-foundation-framework.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bad057c9-46a4-46aa-ab3b-c5910f83a73f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
