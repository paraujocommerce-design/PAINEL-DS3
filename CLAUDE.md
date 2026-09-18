# Painel DS3 — Referência rápida

Leia isto antes de mexer no projeto. Evita erros já cometidos nesta sessão.

## Links reais (confirmados, não adivinhar)

- **Produção:** https://painel-ds-3.vercel.app — **atenção ao hífen entre "ds" e "3"**.
  `painel-ds3.vercel.app` (sem o segundo hífen) **não existe** e dá 404.
- **GitHub:** https://github.com/paraujocommerce-design/PAINEL-DS3
- **Supabase:** projeto `painel-ds3`, painel em
  https://supabase.com/dashboard/project/tpbgxoqjwgwbiicxyqrz

## Branches

- **`main`** — é o que a Vercel publica em produção. Todo trabalho precisa
  chegar até aqui pra aparecer no link real.
- **`claude/painel-gestao-ds3-uicwuy`** — branch de desenvolvimento desta
  sessão. Os dois branches têm **históricos Git não relacionados**
  (`main` nasceu de um upload direto do Lovable, o outro de um clone
  separado) — um Pull Request normal entre eles falha. Para levar mudanças
  pro `main`: merge local com `--allow-unrelated-histories -X theirs`
  (mantendo o conteúdo do branch de trabalho) e `git push origin main`.

## Banco de dados

- Migrations em `db/migrations/`, aplicadas manualmente no SQL Editor do
  Supabase, em ordem, uma de cada vez. **Nunca alterar uma migration já
  aplicada** — sempre criar a próxima numerada.
- Já aplicadas: 0001 a 0006 (auth, Representantes, Prefeituras,
  importação, código manual de representante + hierarquia de liderança).

## Deploy

- Vercel builda com **Bun**, não npm (`bun.lock` é o lockfile real).
- `vercel.json` na raiz já configura `installCommand`/`buildCommand`.
- Stack é **TanStack Start com SSR real** (não SPA estática) — o preset
  Nitro da Vercel já está configurado em `vite.config.ts`.
