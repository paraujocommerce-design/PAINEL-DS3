# Operação — deploy, migrations e armadilhas

## Links reais

Estão em `CLAUDE.md` na raiz. O que mais causa estrago:

**Produção é `https://painel-ds-3.vercel.app`** — com hífen entre "ds" e "3".
`painel-ds3.vercel.app` não existe e devolve 404. Já mandei o link errado
para o gestor uma vez; confira antes de enviar.

## Ciclo de uma mudança

1. Escreva a migration numerada em `db/migrations/`
2. Entregue o arquivo ao gestor com `SendUserFile`
3. **Ele** roda no SQL Editor do Supabase e responde "Success. No rows returned"
4. Só então o código vai para `main`

Você não tem conexão com o banco. Não existe `supabase db push` aqui.

A ordem importa: publicar o front antes da migration rodar quebra a tela em
produção, porque a aplicação chama uma função que ainda não existe.

## Merge para `main` — históricos não relacionados

`main` nasceu de um upload direto do Lovable; o branch de trabalho nasceu de
um clone separado. Um PR normal entre eles falha.

```bash
git checkout main
git pull origin main
git merge claude/painel-gestao-ds3-uicwuy --allow-unrelated-histories -X theirs
git push -u origin main
```

**`-X theirs`, não `-X ours`.** Com `-X ours` o merge conclui limpo e
silenciosamente descarta o seu trabalho — o branch de destino vence cada
conflito. Já aconteceu: horas de código sumiram e só apareceram quando reli o
arquivo. Depois do merge, confira que o código realmente está lá antes de dar
por feito.

## Testar a migration antes de entregar

Há PostgreSQL 16 no ambiente (`/usr/lib/postgresql/16/bin`). Dá para rodar
todas as migrations do zero e exercitar as regras antes de o gestor colar no
Supabase — o que já evitou pelo menos um erro caro.

O `initdb` recusa rodar como root e o diretório de scratchpad não tem
permissão para o usuário `postgres`; use um diretório sob
`/var/lib/postgresql` e rode via `su postgres -c`.

Falta o que o Supabase fornece, então antes das migrations aplique um prelúdio
criando: os papéis `anon`, `authenticated`, `service_role`; as extensões
`btree_gist` e `pgcrypto`; o schema `auth` com a tabela `auth.users`; e uma
`auth.uid()` que leia uma variável de sessão — assim dá para simular cada
perfil com `set test.user_id = '...'` e provar que o que deve ser recusado é
recusado.

## Conferir visualmente o que foi desenhado

Quando a entrega é uma imagem ou uma folha que precisa ficar igual a um
modelo, dá para olhar antes de entregar: há Chromium em
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`.

O caminho: `bun build` do módulo de desenho, embutir o bundle na página com
`<script>` comum (Chromium bloqueia `import` por `file://`, então um
`type="module"` apontando para outro arquivo não carrega), abrir com
`playwright-core` e tirar screenshot do canvas. O script precisa rodar de
dentro do projeto para achar `node_modules`.

`playwright-core` entra só para isso e **sai com `bun remove` depois** — não
deve ficar no `package.json`, senão a Vercel instala à toa.

## Regras de migration

Numeração sequencial, aplicada em ordem, uma de cada vez. **Nunca altere uma
migration já aplicada** — o banco do gestor já a executou, editar o arquivo só
dessincroniza repositório e banco. Corrija com a próxima numerada.

Toda função é `security definer` com `set search_path = ''` (então qualifique
tudo: `public.representantes`, não `representantes`).

### `ALTER TYPE ... ADD VALUE` não enxerga na mesma transação

Adicionar valor a um enum e usá-lo no mesmo script falha. Foi o motivo de a
0008 comparar `role::text in ('admin','operacao')` em vez do enum direto. Se
precisar de valor novo de enum, compare como texto ou parta em duas
migrations.

### `SET LOCAL` com parâmetro customizado não funciona em plpgsql

Use `perform set_config('app.exclusao_admin', 'on', true)` e desligue
explicitamente depois. É o mecanismo que libera `DELETE` nos triggers de
imutabilidade nas funções de exclusão administrativa.

### Migration grande: gere, não transcreva

A 0008 precisava replicar 10 funções e 25 policies trocando só a checagem de
permissão. Transcrever à mão convida a erro silencioso. Extraí das migrations
anteriores por script e reescrevi a checagem mecanicamente. Quando o trabalho
for repetitivo assim, gere — e releia o SQL gerado antes de entregar (num SQL
de carga meu, um `INSERT` estava sem a coluna `status` e o motivo de rejeição
ia cair na coluna errada; peguei relendo).

## Frontend

**Bun, nunca npm.** `bun.lock` é o lockfile real e é o que a Vercel usa.
`bun install`, `bun run dev`, `bun run build`.

`vercel.json` na raiz já configura `installCommand`/`buildCommand`. A stack é
TanStack Start com **SSR real**, não SPA estática — o preset Nitro da Vercel
está em `vite.config.ts`. Não "simplifique" para SPA.

Se `node_modules` sumir (reset de ambiente), `bun install` resolve.

### Lint

`bunx eslint` demora. Rode uma vez e espere terminar — não rode em paralelo
com troca de branch. Já interpretei "52.762 erros" como catástrofe quando era
só o eslint lendo uma árvore no meio de um checkout. O estado limpo é
**0 erros e 7 warnings pré-existentes** do shadcn.

## GitHub

Se as chamadas ao GitHub derem 403/404 de forma persistente, o problema
normalmente é o acesso do GitHub App ao repositório, não visibilidade do repo.
Quem resolve é o gestor, selecionando `PAINEL-DS3` na instalação do app.

## Papéis de usuário

Conceder papel não passa pela aplicação: é `INSERT` em `user_roles` pelo SQL
Editor, feito pelo gestor. `admin` = Paulo (gestor), `operacao` = Mariucha.
No front, `usePapelUsuario()` em `src/lib/papel-usuario.ts` expõe `ehAdmin` —
use isso para esconder as ações de exclusão, que são exclusivas do admin.
