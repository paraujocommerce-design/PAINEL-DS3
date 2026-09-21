import { useMemo, useState } from "react";
import {
  Alert,
  ClassicButton,
  Dialog,
  EmptyState,
  Field,
  Input,
  IndicatorSlot,
  LoadingState,
  Panel,
  Select,
  Table,
  Toolbar,
  ToolbarSeparator,
} from "@/components/w2k";
import type { Column } from "@/components/w2k";
import { usePapelUsuario } from "@/lib/papel-usuario";
import {
  useAcaoOrdem,
  useAdicionarItem,
  useAutorizacoes,
  useContratosDoRepresentante,
  useDecidirAutorizacao,
  useDefinirDestinatario,
  useExigirAutorizacao,
  useLimparDestinatario,
  useLinhasOrdem,
  usePagarOrdem,
  useRemoverExigencia,
  useRemoverItem,
  useRubricas,
  type InstanciaAutorizacao,
  type OrdemPagamento,
} from "./api";

const INSTANCIAS: Array<{ valor: InstanciaAutorizacao; rotulo: string; padrao: string }> = [
  { valor: "gerencia", rotulo: "Gerência", padrao: "" },
  { valor: "supervisao", rotulo: "Supervisão", padrao: "Berg Calasans" },
  { valor: "auditoria", rotulo: "Auditoria", padrao: "Durval" },
  { valor: "diretoria", rotulo: "Diretoria", padrao: "Kennedy" },
];

const FORMAS = [
  { valor: "pix", rotulo: "PIX" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "deposito", rotulo: "Depósito" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "outro", rotulo: "Outro" },
];

const COLUNAS_LINHAS: Column[] = [
  { key: "rubrica", label: "Rubrica" },
  { key: "contrato", label: "Contrato" },
  { key: "data", label: "Data" },
  { key: "valor", label: "R$", align: "right" },
  { key: "observacao", label: "Observação" },
  { key: "acao", label: "" },
];

const COLUNAS_AUTORIZACOES: Column[] = [
  { key: "instancia", label: "Instância" },
  { key: "responsavel", label: "Responsável" },
  { key: "situacao", label: "Situação" },
  { key: "origem", label: "Registro" },
  { key: "acao", label: "" },
];

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function mensagem(causa: unknown, padrao: string): string {
  return causa instanceof Error ? causa.message : padrao;
}

/** Lançamento manual de rubrica — as linhas que o sistema não calcula. */
function DialogLancarRubrica({
  ordem,
  aberto,
  onFechar,
  onErro,
}: {
  ordem: OrdemPagamento;
  aberto: boolean;
  onFechar: () => void;
  onErro: (erro: string) => void;
}) {
  const rubricas = useRubricas();
  const contratos = useContratosDoRepresentante(ordem.representante_id);
  const adicionar = useAdicionarItem();

  const [rubrica, setRubrica] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [contratoId, setContratoId] = useState("");

  const manuais = (rubricas.data ?? []).filter((r) => !r.automatica);
  const escolhida = manuais.find((r) => r.codigo === rubrica);

  function limpar() {
    setRubrica("");
    setValor("");
    setData(hoje());
    setObservacao("");
    setContratoId("");
  }

  async function salvar() {
    const numero = Number(valor.replace(",", "."));
    if (!rubrica) return onErro("Escolha a rubrica.");
    if (!Number.isFinite(numero) || numero <= 0) return onErro("Informe um valor maior que zero.");
    if (escolhida?.exige_contrato && !contratoId) {
      return onErro(`"${escolhida.rotulo}" exige apontar o contrato que está sendo pago.`);
    }
    try {
      await adicionar.mutateAsync({
        ordemId: ordem.id,
        rubrica,
        valor: numero,
        data,
        observacao: observacao.trim() || undefined,
        contratoId: contratoId || undefined,
      });
      limpar();
      onFechar();
    } catch (causa) {
      onErro(mensagem(causa, "Não foi possível lançar a rubrica."));
    }
  }

  return (
    <Dialog
      open={aberto}
      title="Lançar rubrica na ordem"
      onClose={onFechar}
      footer={
        <>
          <ClassicButton onClick={onFechar}>Cancelar</ClassicButton>
          <ClassicButton
            variant="primary"
            onClick={() => void salvar()}
            disabled={adicionar.isPending}
          >
            {adicionar.isPending ? "Lançando..." : "Lançar"}
          </ClassicButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Field label="Rubrica">
          <Select value={rubrica} onChange={(e) => setRubrica(e.target.value)}>
            <option value="">Escolha...</option>
            {manuais.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.rotulo}
                {r.sinal < 0 ? " (subtrai)" : ""}
                {r.gera_debito ? " (gera débito)" : ""}
              </option>
            ))}
          </Select>
        </Field>

        {escolhida?.gera_debito ? (
          <Alert
            tone="warning"
            title="Este lançamento vira dívida do representante"
            children="O valor é pago agora e fica registrado como débito, a ser descontado nas próximas vendas."
          />
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="450,00"
            />
          </Field>
          <Field label="Data">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
        </div>

        {escolhida?.exige_contrato ? (
          <Field label="Contrato" hint="O código fica na ordem — é o que impede pagar duas vezes.">
            <Select value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
              <option value="">Escolha o contrato...</option>
              {(contratos.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo_contrato}
                  {c.nome_fantasia ? ` — ${c.nome_fantasia}` : ""} ({formatarData(c.data_venda)})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Observação">
          <Input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Cod. 206204 — será descontado a partir de 10/08"
          />
        </Field>
      </div>
    </Dialog>
  );
}

function DialogDestinatario({
  ordem,
  aberto,
  onFechar,
  onErro,
}: {
  ordem: OrdemPagamento;
  aberto: boolean;
  onFechar: () => void;
  onErro: (erro: string) => void;
}) {
  const definir = useDefinirDestinatario();
  const [nome, setNome] = useState(ordem.destinatario_nome ?? "");
  const [motivo, setMotivo] = useState(ordem.destinatario_motivo ?? "");
  const [documento, setDocumento] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [tipoConta, setTipoConta] = useState("cc");

  async function salvar() {
    if (!nome.trim()) return onErro("Informe o nome do destinatário.");
    if (!motivo.trim()) return onErro("Mudar o destinatário do pagamento exige motivo.");
    try {
      await definir.mutateAsync({
        ordemId: ordem.id,
        nome: nome.trim(),
        motivo: motivo.trim(),
        documento: documento.trim() || undefined,
        banco: banco.trim() || undefined,
        agencia: agencia.trim() || undefined,
        conta: conta.trim() || undefined,
        tipoConta,
      });
      onFechar();
    } catch (causa) {
      onErro(mensagem(causa, "Não foi possível alterar o destinatário."));
    }
  }

  return (
    <Dialog
      open={aberto}
      title="Alterar destinatário do pagamento"
      onClose={onFechar}
      footer={
        <>
          <ClassicButton onClick={onFechar}>Cancelar</ClassicButton>
          <ClassicButton
            variant="primary"
            onClick={() => void salvar()}
            disabled={definir.isPending}
          >
            {definir.isPending ? "Salvando..." : "Salvar"}
          </ClassicButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Alert
          tone="warning"
          title="O pagamento sai para outra pessoa"
          children="Por padrão o valor vai para a conta cadastrada do representante. Preencha aqui só quando o destinatário for outro."
        />
        <Field label="Favorecido">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="Motivo da alteração">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="CPF/CNPJ">
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </Field>
          <Field label="Banco">
            <Input value={banco} onChange={(e) => setBanco(e.target.value)} />
          </Field>
          <Field label="Agência">
            <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} />
          </Field>
          <Field label="Conta">
            <Input value={conta} onChange={(e) => setConta(e.target.value)} />
          </Field>
        </div>
        <Field label="Tipo de conta">
          <Select value={tipoConta} onChange={(e) => setTipoConta(e.target.value)}>
            <option value="cc">Conta corrente</option>
            <option value="cp">Conta poupança</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function DialogExigirAutorizacao({
  ordem,
  aberto,
  onFechar,
  onErro,
  jaExigidas,
}: {
  ordem: OrdemPagamento;
  aberto: boolean;
  onFechar: () => void;
  onErro: (erro: string) => void;
  jaExigidas: InstanciaAutorizacao[];
}) {
  const exigir = useExigirAutorizacao();
  const disponiveis = INSTANCIAS.filter((i) => !jaExigidas.includes(i.valor));
  const [instancia, setInstancia] = useState<string>("");
  const [responsavel, setResponsavel] = useState("");

  function escolher(valor: string) {
    setInstancia(valor);
    const achada = INSTANCIAS.find((i) => i.valor === valor);
    if (achada && !responsavel) setResponsavel(achada.padrao);
  }

  async function salvar() {
    if (!instancia) return onErro("Escolha a instância.");
    if (!responsavel.trim()) return onErro("Informe quem deve autorizar.");
    try {
      await exigir.mutateAsync({
        ordemId: ordem.id,
        instancia: instancia as InstanciaAutorizacao,
        responsavel: responsavel.trim(),
      });
      setInstancia("");
      setResponsavel("");
      onFechar();
    } catch (causa) {
      onErro(mensagem(causa, "Não foi possível exigir a autorização."));
    }
  }

  return (
    <Dialog
      open={aberto}
      title="Exigir autorização"
      onClose={onFechar}
      footer={
        <>
          <ClassicButton onClick={onFechar}>Cancelar</ClassicButton>
          <ClassicButton
            variant="primary"
            onClick={() => void salvar()}
            disabled={exigir.isPending}
          >
            {exigir.isPending ? "Salvando..." : "Exigir"}
          </ClassicButton>
        </>
      }
    >
      {disponiveis.length === 0 ? (
        <EmptyState title="Todas as instâncias já foram exigidas nesta ordem." />
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Instância">
            <Select value={instancia} onChange={(e) => escolher(e.target.value)}>
              <option value="">Escolha...</option>
              {disponiveis.map((i) => (
                <option key={i.valor} value={i.valor}>
                  {i.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Quem autoriza"
            hint="Berg autoriza pelo próprio acesso. Auditoria e diretoria são registradas pela gerência."
          >
            <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function DialogPagar({
  ordem,
  aberto,
  onFechar,
  onErro,
}: {
  ordem: OrdemPagamento;
  aberto: boolean;
  onFechar: () => void;
  onErro: (erro: string) => void;
}) {
  const pagar = usePagarOrdem();
  const [forma, setForma] = useState("pix");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(String(ordem.total_liquido.toFixed(2)).replace(".", ","));
  const [comprovante, setComprovante] = useState("");

  async function confirmar() {
    const numero = Number(valor.replace(",", "."));
    if (!Number.isFinite(numero) || numero <= 0)
      return onErro("Informe o valor efetivamente pago.");
    if (!data) return onErro("Informe a data do pagamento.");
    try {
      await pagar.mutateAsync({
        ordemId: ordem.id,
        forma,
        data,
        valor: numero,
        comprovante: comprovante.trim() || undefined,
      });
      onFechar();
    } catch (causa) {
      onErro(mensagem(causa, "Não foi possível registrar o pagamento."));
    }
  }

  return (
    <Dialog
      open={aberto}
      title={`Pagar — ${ordem.representante_codigo} ${ordem.representante_nome}`}
      onClose={onFechar}
      footer={
        <>
          <ClassicButton onClick={onFechar}>Cancelar</ClassicButton>
          <ClassicButton
            variant="primary"
            onClick={() => void confirmar()}
            disabled={pagar.isPending}
          >
            {pagar.isPending ? "Registrando..." : "Confirmar pagamento"}
          </ClassicButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          Favorecido: <strong>{ordem.favorecido_efetivo ?? "não cadastrado"}</strong>
          {ordem.banco_efetivo ? (
            <>
              {" "}
              — {ordem.banco_efetivo} ag. {ordem.agencia_efetiva ?? "—"} c/{" "}
              {ordem.conta_efetiva ?? "—"}
            </>
          ) : null}
        </p>
        {ordem.destinatario_nome ? (
          <Alert
            tone="warning"
            title="Destinatário alterado"
            children={ordem.destinatario_motivo ?? undefined}
          />
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Forma">
            <Select value={forma} onChange={(e) => setForma(e.target.value)}>
              {FORMAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data do pagamento">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <Field label="Valor pago (R$)">
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Field label="Comprovante">
            <Input
              value={comprovante}
              onChange={(e) => setComprovante(e.target.value)}
              placeholder="ID da transação"
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/** A ordem aberta como documento, no formato do formulário da DS3. */
export function OrdemDetalhe({
  ordem,
  onVoltar,
  onRelatorio,
}: {
  ordem: OrdemPagamento;
  onVoltar: () => void;
  onRelatorio: () => void;
}) {
  const { ehAdmin } = usePapelUsuario();
  const linhas = useLinhasOrdem(ordem.id);
  const autorizacoes = useAutorizacoes(ordem.id);
  const acao = useAcaoOrdem();
  const remover = useRemoverItem();
  const decidir = useDecidirAutorizacao();
  const removerExigencia = useRemoverExigencia();
  const limparDestinatario = useLimparDestinatario();

  const [erro, setErro] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<
    "rubrica" | "destinatario" | "autorizacao" | "pagar" | null
  >(null);

  const aberta = ordem.status === "aberta";
  const jaExigidas = useMemo(
    () => (autorizacoes.data ?? []).map((a) => a.instancia),
    [autorizacoes.data],
  );

  async function executar(tipo: "fechar" | "cancelar" | "reabrir") {
    setErro(null);
    let motivo: string | undefined;
    if (tipo !== "fechar") {
      const rotulo = tipo === "cancelar" ? "cancelamento" : "reabertura";
      const informado = window.prompt(`Motivo da ${rotulo}:`);
      if (!informado?.trim()) return;
      motivo = informado.trim();
    }
    try {
      await acao.mutateAsync({ ordemId: ordem.id, acao: tipo, motivo });
    } catch (causa) {
      setErro(mensagem(causa, "Não foi possível concluir a ação."));
    }
  }

  async function decidirInstancia(
    instancia: InstanciaAutorizacao,
    decisao: "autorizada" | "recusada",
    responsavel: string,
  ) {
    setErro(null);
    let observacao: string | undefined;
    if (decisao === "recusada") {
      const informado = window.prompt("Motivo da recusa:");
      if (!informado?.trim()) return;
      observacao = informado.trim();
    }
    try {
      await decidir.mutateAsync({
        ordemId: ordem.id,
        instancia,
        decisao,
        observacao,
        responsavel,
      });
    } catch (causa) {
      setErro(mensagem(causa, "Não foi possível registrar a decisão."));
    }
  }

  return (
    <div className="flex flex-col gap-[3px]">
      <Toolbar>
        <ClassicButton onClick={onVoltar}>← Voltar</ClassicButton>
        <ToolbarSeparator />
        <ClassicButton onClick={onRelatorio}>Relatório do representante</ClassicButton>
        <ToolbarSeparator />
        {aberta ? (
          <>
            <ClassicButton onClick={() => setDialogo("rubrica")}>Lançar rubrica</ClassicButton>
            <ClassicButton onClick={() => setDialogo("destinatario")}>Destinatário</ClassicButton>
            <ClassicButton onClick={() => setDialogo("autorizacao")}>
              Exigir autorização
            </ClassicButton>
            <ToolbarSeparator />
            <ClassicButton variant="primary" onClick={() => void executar("fechar")}>
              Fechar ordem
            </ClassicButton>
          </>
        ) : null}
        {ordem.status === "fechada" ? (
          <>
            <ClassicButton onClick={() => setDialogo("autorizacao")}>
              Exigir autorização
            </ClassicButton>
            {ehAdmin ? (
              <>
                <ClassicButton onClick={() => void executar("reabrir")}>Reabrir</ClassicButton>
                <ClassicButton
                  variant="primary"
                  onClick={() => setDialogo("pagar")}
                  disabled={!ordem.liberada_para_pagamento}
                >
                  Pagar
                </ClassicButton>
              </>
            ) : null}
          </>
        ) : null}
        {ordem.status !== "cancelada" && ordem.status !== "paga" ? (
          <ClassicButton onClick={() => void executar("cancelar")}>Cancelar ordem</ClassicButton>
        ) : null}
      </Toolbar>

      {erro ? <Alert tone="error" title={erro} /> : null}

      <Panel
        title={`Ordem ${ordem.competencia.slice(0, 7)} — ${ordem.representante_codigo} ${ordem.representante_nome}`}
      >
        <div className="grid gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
          <IndicatorSlot
            label="Supervisor"
            value={ordem.supervisor_nome ?? undefined}
            note={ordem.supervisor_nome ? undefined : "Sem vínculo no período"}
          />
          <IndicatorSlot label="Situação" value={ordem.status} />
          <IndicatorSlot label="Total a pagar" value={moeda(ordem.total_liquido)} />
          <IndicatorSlot
            label="Saldo devedor"
            value={ordem.saldo_devedor_atual > 0 ? moeda(ordem.saldo_devedor_atual) : "—"}
          />
        </div>
        <p className="mt-2 text-sm">
          Favorecido: <strong>{ordem.favorecido_efetivo ?? "não cadastrado"}</strong>
          {ordem.banco_efetivo ? (
            <>
              {" "}
              — {ordem.banco_efetivo}, ag. {ordem.agencia_efetiva ?? "—"}, conta{" "}
              {ordem.conta_efetiva ?? "—"}
            </>
          ) : null}
          {ordem.destinatario_nome ? (
            <>
              {" "}
              <em>(destinatário alterado: {ordem.destinatario_motivo})</em>{" "}
              {aberta ? (
                <ClassicButton onClick={() => void limparDestinatario.mutateAsync(ordem.id)}>
                  Voltar ao padrão
                </ClassicButton>
              ) : null}
            </>
          ) : null}
        </p>
        {ordem.status === "paga" ? (
          <p className="mt-1 text-sm">
            Pago em {formatarData(ordem.data_pagamento)} por {ordem.forma_pagamento} —{" "}
            {moeda(ordem.valor_pago ?? 0)}
            {ordem.comprovante ? ` — comprovante ${ordem.comprovante}` : ""}
          </p>
        ) : null}
      </Panel>

      {linhas.isLoading ? (
        <LoadingState />
      ) : (linhas.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma linha nesta ordem."
          description="Apure a competência para gerar as linhas automáticas, ou lance uma rubrica à mão."
        />
      ) : (
        <Table
          columns={COLUNAS_LINHAS}
          caption="Linhas da ordem"
          rows={(linhas.data ?? []).map((linha) => ({
            rubrica: linha.rotulo,
            contrato: linha.codigo_contrato ?? "—",
            data: formatarData(linha.data_referencia),
            valor: moeda(linha.valor_liquido),
            observacao: linha.observacao ?? linha.descricao,
            acao:
              aberta && !linha.automatica ? (
                <ClassicButton
                  onClick={() => {
                    setErro(null);
                    remover
                      .mutateAsync(linha.item_id)
                      .catch((causa) => setErro(mensagem(causa, "Não foi possível remover.")));
                  }}
                >
                  Remover
                </ClassicButton>
              ) : null,
          }))}
        />
      )}

      <Panel title="Autorizações">
        {autorizacoes.isLoading ? (
          <LoadingState />
        ) : (autorizacoes.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma autorização exigida."
            description="Sem exigência registrada, a ordem pode ser paga assim que for fechada."
          />
        ) : (
          <Table
            columns={COLUNAS_AUTORIZACOES}
            rows={(autorizacoes.data ?? []).map((a) => {
              const rotulo = INSTANCIAS.find((i) => i.valor === a.instancia)?.rotulo ?? a.instancia;
              return {
                instancia: rotulo,
                responsavel: a.responsavel,
                situacao:
                  a.decisao === "pendente"
                    ? "Pendente"
                    : a.decisao === "autorizada"
                      ? `Autorizada em ${formatarData(a.decidido_em)}`
                      : `Recusada — ${a.observacao ?? "sem motivo"}`,
                origem: a.decidiu_no_sistema
                  ? "Decidiu no sistema"
                  : a.registrado_por_terceiro
                    ? "Registrada pela gerência"
                    : "—",
                acao:
                  a.decisao === "pendente" && ordem.status === "fechada" ? (
                    <span className="flex gap-1">
                      <ClassicButton
                        onClick={() =>
                          void decidirInstancia(a.instancia, "autorizada", a.responsavel)
                        }
                      >
                        Autorizar
                      </ClassicButton>
                      <ClassicButton
                        onClick={() =>
                          void decidirInstancia(a.instancia, "recusada", a.responsavel)
                        }
                      >
                        Recusar
                      </ClassicButton>
                    </span>
                  ) : a.decisao === "pendente" && aberta && ehAdmin ? (
                    <ClassicButton
                      onClick={() => {
                        setErro(null);
                        removerExigencia
                          .mutateAsync({ ordemId: ordem.id, instancia: a.instancia })
                          .catch((causa) =>
                            setErro(mensagem(causa, "Não foi possível dispensar.")),
                          );
                      }}
                    >
                      Dispensar
                    </ClassicButton>
                  ) : null,
              };
            })}
          />
        )}
      </Panel>

      <DialogLancarRubrica
        ordem={ordem}
        aberto={dialogo === "rubrica"}
        onFechar={() => setDialogo(null)}
        onErro={setErro}
      />
      <DialogDestinatario
        ordem={ordem}
        aberto={dialogo === "destinatario"}
        onFechar={() => setDialogo(null)}
        onErro={setErro}
      />
      <DialogExigirAutorizacao
        ordem={ordem}
        aberto={dialogo === "autorizacao"}
        onFechar={() => setDialogo(null)}
        onErro={setErro}
        jaExigidas={jaExigidas}
      />
      <DialogPagar
        ordem={ordem}
        aberto={dialogo === "pagar"}
        onFechar={() => setDialogo(null)}
        onErro={setErro}
      />
    </div>
  );
}
