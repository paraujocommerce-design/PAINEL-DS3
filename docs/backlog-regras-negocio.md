# Backlog de regras de negócio

Requisitos capturados em conversa, ainda **não implementados**. Cada item
deve virar migration + RPC + frontend na onda indicada quando for a vez —
nenhum aqui deve ser codificado antecipadamente.

---

## 1. Agenda de cobrança de contrato físico (Suporte DS3 / Mariucha)

**Capturado em:** 18/09/2026

**Responsável funcional:** Mariucha (módulo Suporte DS3 — hoje placeholder).

**Regra de negócio:**

- Todo contrato de representante pode ficar com pendência de **contrato
  físico assinado pelo cliente ainda não recebido pela empresa** (o tipo de
  pendência "contrato assinado" já existe no schema desde a migration 0005 —
  `representante_contratos.possui_pendencia` / `tipo_pendencia`).
- A empresa só considera o contrato **"baixado"** depois de receber esse
  documento físico.
- **Consequência financeira:** o incentivo comercial do representante
  (10% do valor do contrato — §28 da especificação original, ainda não
  implementado) só pode ser contabilizado para contratos já baixados.
  Contrato com pendência de documento físico não gera incentivo.
- Mariucha precisa de uma **agenda/fila de cobrança**: lista de contratos
  com essa pendência em aberto, para que ela cobre o representante
  responsável até o documento chegar e o contrato seja baixado.

**Dependências:**

- Pendência documental do contrato: já existe (migration 0005).
- Incentivo comercial (10% do valor faturado): ainda não implementado —
  hoje o valor é lançado manualmente (§28), sem cálculo nem vínculo com
  baixa de contrato.
- Módulo Suporte DS3: hoje é placeholder puro (`src/routes/suporte.tsx`),
  sem tabela própria no banco.

**Onde entra no plano de ondas:** cruza a Onda 7 (financeiro de
representantes / incentivo comercial) com o módulo Suporte DS3. Avaliar se
vira uma onda própria ("Onda 7b — Baixa de contrato e agenda de cobrança")
ou se é incorporada à Onda 7 quando chegar a vez.

**Pontos em aberto para quando for implementar (perguntar antes de
desenhar a migration):**

- Quem pode marcar um contrato como "baixado" — só admin, ou também
  Mariucha precisa de um papel/permissão própria? Hoje só existe o papel
  `admin` (migration 0001); Mariucha usando o sistema pode ser o primeiro
  caso real que force a criar um segundo papel.
- Existe prazo padrão para cobrança (ex: cobrar automaticamente após X
  dias sem receber o físico), ou a agenda é só uma lista viva sem prazo
  fixo por regra?
- O que acontece se o representante nunca enviar o físico — o contrato
  fica pendente indefinidamente, ou existe uma regra de cancelamento/
  desconto de premiação depois de um tempo?
- A baixa é feita contrato a contrato, ou existe algum lançamento em lote
  (ex: Mariucha recebe um envelope com vários físicos de uma vez)?
