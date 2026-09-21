import { useMemo, useState, type FormEvent } from "react";
import { Dialog, ClassicButton, Field, Input, Select, Alert } from "@/components/w2k";
import {
  useCadastrarContrato,
  useOpcoesCadastro,
  useRepresentantesParaContrato,
  type RepresentanteOpcao,
} from "./api";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "1.234,56" ou "1234.56" → número. Vazio = null (nunca zero). */
function valorParaNumero(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function moeda(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DialogNovoContrato({ open, onClose }: { open: boolean; onClose: () => void }) {
  const representantes = useRepresentantesParaContrato();
  const opcoes = useOpcoesCadastro();
  const cadastrar = useCadastrarContrato();

  const [representanteId, setRepresentanteId] = useState("");
  const [dataVenda, setDataVenda] = useState(hojeISO());
  const [codigoContrato, setCodigoContrato] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [valorPlano, setValorPlano] = useState("");
  const [premiavel, setPremiavel] = useState(true);
  const [motivoNaoPremiavel, setMotivoNaoPremiavel] = useState("");
  const [possuiPendencia, setPossuiPendencia] = useState(false);
  const [tipoPendencia, setTipoPendencia] = useState("");
  const [statusPosVenda, setStatusPosVenda] = useState("");
  const [valorPremiacao, setValorPremiacao] = useState("");
  const [descontoPremiacao, setDescontoPremiacao] = useState("");
  const [motivoDesconto, setMotivoDesconto] = useState("");
  const [descontoComissao, setDescontoComissao] = useState("");
  const [motivoDescontoComissao, setMotivoDescontoComissao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const selecionado: RepresentanteOpcao | undefined = useMemo(
    () => representantes.data?.find((r) => r.id === representanteId),
    [representantes.data, representanteId],
  );

  const porCategoria = (categoria: string) =>
    (opcoes.data ?? []).filter((opcao) => opcao.categoria === categoria);

  // Prévia do que será pago, para conferência antes de gravar.
  const previaPremiacao = useMemo(() => {
    const base = valorPremiacao.trim()
      ? valorParaNumero(valorPremiacao)
      : (selecionado?.valor_premiacao_contrato ?? null);
    if (base === null || Number.isNaN(base)) return null;
    const desconto = valorParaNumero(descontoPremiacao) ?? 0;
    if (Number.isNaN(desconto)) return null;
    return Math.max(base - desconto, 0);
  }, [valorPremiacao, descontoPremiacao, selecionado]);

  const previaComissao = useMemo(() => {
    if (!selecionado?.lider_id) return null;
    const base = selecionado.valor_comissao_lideranca;
    if (base === null) return null;
    const desconto = valorParaNumero(descontoComissao) ?? 0;
    if (Number.isNaN(desconto)) return null;
    return Math.max(base - desconto, 0);
  }, [selecionado, descontoComissao]);

  function fechar() {
    setRepresentanteId("");
    setDataVenda(hojeISO());
    setCodigoContrato("");
    setNomeFantasia("");
    setCnpj("");
    setValorPlano("");
    setPremiavel(true);
    setMotivoNaoPremiavel("");
    setPossuiPendencia(false);
    setTipoPendencia("");
    setStatusPosVenda("");
    setValorPremiacao("");
    setDescontoPremiacao("");
    setMotivoDesconto("");
    setDescontoComissao("");
    setMotivoDescontoComissao("");
    setObservacao("");
    setErro(null);
    cadastrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);

    if (!representanteId) return setErro("Selecione o representante.");
    if (!codigoContrato.trim()) return setErro("Informe o código do contrato.");
    if (!dataVenda || dataVenda > hojeISO())
      return setErro("Informe uma data de venda válida (não pode ser futura).");
    if (!premiavel && !motivoNaoPremiavel)
      return setErro("Contrato não premiável exige o motivo.");
    if (possuiPendencia && !tipoPendencia)
      return setErro("Contrato com pendência exige o tipo de pendência.");

    const plano = valorParaNumero(valorPlano);
    if (Number.isNaN(plano)) return setErro("Valor do plano inválido.");

    const premiacao = valorPremiacao.trim() ? valorParaNumero(valorPremiacao) : null;
    if (Number.isNaN(premiacao)) return setErro("Valor da premiação inválido.");

    const desconto = valorParaNumero(descontoPremiacao) ?? 0;
    if (Number.isNaN(desconto)) return setErro("Valor do desconto inválido.");
    if (desconto > 0 && !motivoDesconto.trim())
      return setErro("Informe o motivo do desconto na premiação.");

    const descontoCom = valorParaNumero(descontoComissao) ?? 0;
    if (Number.isNaN(descontoCom)) return setErro("Valor do desconto da comissão inválido.");
    if (descontoCom > 0 && !motivoDescontoComissao.trim())
      return setErro("Informe o motivo do desconto na comissão de liderança.");

    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo && cnpjLimpo.length !== 14) return setErro("CNPJ deve ter 14 dígitos.");

    try {
      await cadastrar.mutateAsync({
        representanteId,
        dataVenda,
        codigoContrato,
        nomeFantasia,
        cnpj: cnpjLimpo,
        valorPlano: plano,
        premiavel,
        motivoNaoPremiavel,
        possuiPendencia,
        tipoPendencia,
        statusPosVenda,
        valorPremiacao: premiacao,
        descontoPremiacao: desconto,
        motivoDescontoPremiacao: motivoDesconto,
        descontoComissao: descontoCom,
        motivoDescontoComissao,
        observacao,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível lançar o contrato.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Lançar contrato"
      onClose={fechar}
      footer={
        <>
          <ClassicButton onClick={fechar} disabled={cadastrar.isPending}>
            Cancelar
          </ClassicButton>
          <ClassicButton
            type="submit"
            form="w2k-form"
            variant="primary"
            disabled={cadastrar.isPending}
          >
            {cadastrar.isPending ? "Salvando..." : "Lançar contrato"}
          </ClassicButton>
        </>
      }
    >
      {representantes.isLoading ? (
        <p className="text-sm">Carregando representantes...</p>
      ) : (representantes.data ?? []).length === 0 ? (
        <Alert tone="warning" title="Nenhum representante cadastrado.">
          Cadastre um representante antes de lançar contratos.
        </Alert>
      ) : (
        <form id="w2k-form" onSubmit={enviar} className="flex flex-col gap-3">
          {erro ? <Alert tone="error" title={erro} /> : null}

          <Field label="Representante" htmlFor="ct-rep">
            <Select
              id="ct-rep"
              value={representanteId}
              onChange={(event) => setRepresentanteId(event.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {(representantes.data ?? []).map((representante) => (
                <option key={representante.id} value={representante.id}>
                  {representante.codigo} — {representante.nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Data da venda" htmlFor="ct-data">
            <Input
              id="ct-data"
              type="date"
              value={dataVenda}
              max={hojeISO()}
              onChange={(event) => setDataVenda(event.target.value)}
              required
            />
          </Field>

          <Field label="Código do contrato" htmlFor="ct-codigo">
            <Input
              id="ct-codigo"
              value={codigoContrato}
              onChange={(event) => setCodigoContrato(event.target.value)}
              placeholder="ex: 206130"
              required
            />
          </Field>

          <Field label="Cliente (nome fantasia)" htmlFor="ct-cliente">
            <Input
              id="ct-cliente"
              value={nomeFantasia}
              onChange={(event) => setNomeFantasia(event.target.value)}
            />
          </Field>

          <Field label="CNPJ" htmlFor="ct-cnpj">
            <Input
              id="ct-cnpj"
              value={cnpj}
              onChange={(event) => setCnpj(event.target.value.replace(/\D/g, "").slice(0, 14))}
              inputMode="numeric"
              placeholder="somente números"
            />
          </Field>

          <Field label="Valor do plano — mensalidade (R$)" htmlFor="ct-plano">
            <Input
              id="ct-plano"
              value={valorPlano}
              onChange={(event) => setValorPlano(event.target.value)}
              inputMode="decimal"
              placeholder="base do incentivo de 10%"
            />
          </Field>

          <Field label="Contrato premiável?" htmlFor="ct-premiavel">
            <Select
              id="ct-premiavel"
              value={premiavel ? "sim" : "nao"}
              onChange={(event) => setPremiavel(event.target.value === "sim")}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </Select>
          </Field>

          {!premiavel ? (
            <Field label="Motivo de não ser premiável" htmlFor="ct-motivo-np">
              <Select
                id="ct-motivo-np"
                value={motivoNaoPremiavel}
                onChange={(event) => setMotivoNaoPremiavel(event.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {porCategoria("motivo_nao_premiavel").map((opcao) => (
                  <option key={opcao.codigo} value={opcao.rotulo}>
                    {opcao.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Tem pendência de documento?" htmlFor="ct-pendencia">
            <Select
              id="ct-pendencia"
              value={possuiPendencia ? "sim" : "nao"}
              onChange={(event) => setPossuiPendencia(event.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </Select>
          </Field>

          {possuiPendencia ? (
            <Field label="Tipo de pendência" htmlFor="ct-tipo-pend">
              <Select
                id="ct-tipo-pend"
                value={tipoPendencia}
                onChange={(event) => setTipoPendencia(event.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {porCategoria("tipo_pendencia").map((opcao) => (
                  <option key={opcao.codigo} value={opcao.rotulo}>
                    {opcao.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Status do pós-venda" htmlFor="ct-status">
            <Select
              id="ct-status"
              value={statusPosVenda}
              onChange={(event) => setStatusPosVenda(event.target.value)}
            >
              <option value="">Não informado</option>
              {porCategoria("status_pos_venda").map((opcao) => (
                <option key={opcao.codigo} value={opcao.rotulo}>
                  {opcao.rotulo}
                </option>
              ))}
            </Select>
          </Field>

          {selecionado ? (
            <Alert
              tone="info"
              title={`Premiação a pagar: ${moeda(previaPremiacao)}${
                selecionado.lider_nome
                  ? ` · Líder ${selecionado.lider_nome}: ${moeda(previaComissao)}`
                  : ""
              }`}
            >
              {selecionado.valor_premiacao_contrato === null
                ? "Este representante não tem premiação cadastrada — informe o valor abaixo."
                : `Valor padrão do cadastro: ${moeda(selecionado.valor_premiacao_contrato)}.`}
            </Alert>
          ) : null}

          <Field label="Premiação deste contrato (R$)" htmlFor="ct-premiacao">
            <Input
              id="ct-premiacao"
              value={valorPremiacao}
              onChange={(event) => setValorPremiacao(event.target.value)}
              inputMode="decimal"
              placeholder={
                selecionado?.valor_premiacao_contrato != null
                  ? `vazio = usar ${moeda(selecionado.valor_premiacao_contrato)}`
                  : "informe o valor"
              }
            />
          </Field>

          <Field label="Desconto por débito (R$)" htmlFor="ct-desconto">
            <Input
              id="ct-desconto"
              value={descontoPremiacao}
              onChange={(event) => setDescontoPremiacao(event.target.value)}
              inputMode="decimal"
              placeholder="deixe vazio se não houver"
            />
          </Field>

          {valorParaNumero(descontoPremiacao) ? (
            <Field label="Motivo do desconto" htmlFor="ct-motivo-desc">
              <Input
                id="ct-motivo-desc"
                value={motivoDesconto}
                onChange={(event) => setMotivoDesconto(event.target.value)}
                required
              />
            </Field>
          ) : null}

          {selecionado?.lider_id ? (
            <>
              <Field label="Desconto na comissão do líder (R$)" htmlFor="ct-desconto-com">
                <Input
                  id="ct-desconto-com"
                  value={descontoComissao}
                  onChange={(event) => setDescontoComissao(event.target.value)}
                  inputMode="decimal"
                  placeholder="deixe vazio se não houver"
                />
              </Field>
              {valorParaNumero(descontoComissao) ? (
                <Field label="Motivo do desconto na comissão" htmlFor="ct-motivo-desc-com">
                  <Input
                    id="ct-motivo-desc-com"
                    value={motivoDescontoComissao}
                    onChange={(event) => setMotivoDescontoComissao(event.target.value)}
                    required
                  />
                </Field>
              ) : null}
            </>
          ) : null}

          <Field label="Observação (opcional)" htmlFor="ct-obs">
            <Input
              id="ct-obs"
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
