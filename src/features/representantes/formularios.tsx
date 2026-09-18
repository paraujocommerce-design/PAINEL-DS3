import { useState, type FormEvent } from "react";
import { Dialog, ClassicButton, Field, Input, Select, Alert } from "@/components/w2k";
import {
  useAtualizarCadastroRepresentante,
  useAtualizarValoresRepresentante,
  useCadastrarMeta,
  useConfiguracaoRepresentante,
  useCriarRepresentante,
  useDefinirLiderRepresentante,
  useRegistrarProducao,
  type Meta,
} from "./api";
import { hojeISO, limitesDoPeriodo } from "./dominio";

function Rodape({
  onClose,
  enviando,
  rotulo,
}: {
  onClose: () => void;
  enviando: boolean;
  rotulo: string;
}) {
  return (
    <>
      <ClassicButton onClick={onClose} disabled={enviando}>
        Cancelar
      </ClassicButton>
      <ClassicButton type="submit" form="w2k-form" variant="primary" disabled={enviando}>
        {enviando ? "Salvando..." : rotulo}
      </ClassicButton>
    </>
  );
}

/** Converte "1.234,56" ou "1234.56" em número. Vazio = null (nunca zero). */
function valorParaNumero(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const normalizado = limpo.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

export function DialogNovoRepresentante({
  open,
  onClose,
  supervisorId,
  supervisorLabel,
  possiveisLideres,
}: {
  open: boolean;
  onClose: () => void;
  supervisorId?: string | undefined;
  supervisorLabel: string;
  possiveisLideres: Array<{ id: string; nome: string }>;
}) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [dataCadastro, setDataCadastro] = useState(hojeISO());
  const [valorPremiacao, setValorPremiacao] = useState("");
  const [valorComissao, setValorComissao] = useState("");
  const [metaMinima, setMetaMinima] = useState("");
  const [liderId, setLiderId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarRepresentante();

  function fechar() {
    setCodigo("");
    setNome("");
    setObservacao("");
    setValorPremiacao("");
    setValorComissao("");
    setMetaMinima("");
    setLiderId("");
    setDataCadastro(hojeISO());
    setErro(null);
    criar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!/^\d{4}$/.test(codigo.trim())) {
      return setErro("Informe o código do representante com exatamente 4 dígitos.");
    }
    if (!nome.trim()) return setErro("Informe o nome do representante.");
    if (!supervisorId) return setErro("Contexto de supervisão indisponível.");

    const premiacao = valorParaNumero(valorPremiacao);
    if (Number.isNaN(premiacao)) return setErro("Valor da premiação por contrato inválido.");
    if (premiacao !== null && premiacao < 0)
      return setErro("Valor da premiação por contrato não pode ser negativo.");

    const comissao = valorParaNumero(valorComissao);
    if (Number.isNaN(comissao)) return setErro("Valor da comissão de liderança inválido.");
    if (comissao !== null && comissao < 0)
      return setErro("Valor da comissão de liderança não pode ser negativo.");

    const meta = metaMinima.trim() ? Number(metaMinima.trim()) : null;
    if (meta !== null && (!Number.isInteger(meta) || meta <= 0))
      return setErro("Meta mínima mensal deve ser um número inteiro maior que zero.");

    try {
      await criar.mutateAsync({
        codigo,
        nome,
        supervisorId,
        dataCadastro,
        observacao,
        valorPremiacaoContrato: premiacao,
        valorComissaoLideranca: comissao,
        metaMinimaMensal: meta,
        liderId: liderId || null,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cadastrar.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Cadastrar representante"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={criar.isPending} rotulo="Cadastrar" />}
    >
      <form id="w2k-form" onSubmit={enviar} className="flex flex-col gap-3">
        {erro ? <Alert tone="error" title={erro} /> : null}
        <Field label="Código (4 dígitos)" htmlFor="rep-codigo">
          <Input
            id="rep-codigo"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            required
          />
        </Field>
        <Field label="Nome" htmlFor="rep-nome">
          <Input
            id="rep-nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            required
          />
        </Field>
        <Field label="Supervisão">
          <Input value={supervisorLabel} readOnly />
        </Field>
        <Field label="Data de cadastro" htmlFor="rep-data">
          <Input
            id="rep-data"
            type="date"
            value={dataCadastro}
            max={hojeISO()}
            onChange={(event) => setDataCadastro(event.target.value)}
            required
          />
        </Field>
        <Field label="Premiação por contrato (R$)" htmlFor="rep-premiacao">
          <Input
            id="rep-premiacao"
            value={valorPremiacao}
            onChange={(event) => setValorPremiacao(event.target.value)}
            inputMode="decimal"
            placeholder="deixe vazio se ainda não definido"
          />
        </Field>
        <Field label="Meta mínima de contratos no mês" htmlFor="rep-meta-minima">
          <Input
            id="rep-meta-minima"
            value={metaMinima}
            onChange={(event) => setMetaMinima(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="deixe vazio se ainda não definida"
          />
        </Field>
        <Field label="Filiado ao líder (opcional)" htmlFor="rep-lider">
          <Select
            id="rep-lider"
            value={liderId}
            onChange={(event) => setLiderId(event.target.value)}
          >
            <option value="">Nenhum — não pertence a uma equipe</option>
            {possiveisLideres.map((lider) => (
              <option key={lider.id} value={lider.id}>
                {lider.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Comissão de liderança por contrato da equipe (R$)" htmlFor="rep-comissao">
          <Input
            id="rep-comissao"
            value={valorComissao}
            onChange={(event) => setValorComissao(event.target.value)}
            inputMode="decimal"
            placeholder="preencha apenas se este representante for líder"
          />
        </Field>
        <Field label="Observação (opcional)" htmlFor="rep-obs">
          <Input
            id="rep-obs"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * Edição do cadastro de um representante já existente.
 * O código nunca muda — é a identidade dele no sistema.
 */
export function DialogEditarRepresentante({
  representanteId,
  onClose,
  possiveisLideres,
}: {
  representanteId: string | null;
  onClose: () => void;
  possiveisLideres: Array<{ id: string; nome: string }>;
}) {
  const configuracao = useConfiguracaoRepresentante(representanteId ?? undefined);
  const atualizarCadastro = useAtualizarCadastroRepresentante();
  const atualizarValores = useAtualizarValoresRepresentante();
  const definirLider = useDefinirLiderRepresentante();

  const [nome, setNome] = useState("");
  const [valorPremiacao, setValorPremiacao] = useState("");
  const [valorComissao, setValorComissao] = useState("");
  const [metaMinima, setMetaMinima] = useState("");
  const [liderId, setLiderId] = useState("");
  const [carregouId, setCarregouId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const dados = configuracao.data;

  // Preenche o formulário quando os dados do representante chegam.
  if (dados && carregouId !== dados.id) {
    setCarregouId(dados.id);
    setNome(dados.nome);
    setValorPremiacao(dados.valor_premiacao_contrato?.toString().replace(".", ",") ?? "");
    setValorComissao(dados.valor_comissao_lideranca?.toString().replace(".", ",") ?? "");
    setMetaMinima(dados.meta_minima_mensal?.toString() ?? "");
    setLiderId(dados.lider_id ?? "");
  }

  const enviando =
    atualizarCadastro.isPending || atualizarValores.isPending || definirLider.isPending;

  function fechar() {
    setCarregouId(null);
    setErro(null);
    atualizarCadastro.reset();
    atualizarValores.reset();
    definirLider.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!dados) return;
    if (!nome.trim()) return setErro("Informe o nome do representante.");

    const premiacao = valorParaNumero(valorPremiacao);
    if (Number.isNaN(premiacao)) return setErro("Valor da premiação por contrato inválido.");
    const comissao = valorParaNumero(valorComissao);
    if (Number.isNaN(comissao)) return setErro("Valor da comissão de liderança inválido.");
    const meta = metaMinima.trim() ? Number(metaMinima.trim()) : null;
    if (meta !== null && (!Number.isInteger(meta) || meta <= 0))
      return setErro("Meta mínima mensal deve ser um número inteiro maior que zero.");

    try {
      if (nome.trim() !== dados.nome) {
        await atualizarCadastro.mutateAsync({
          representanteId: dados.id,
          nome,
        });
      }

      await atualizarValores.mutateAsync({
        representanteId: dados.id,
        valorPremiacaoContrato: premiacao,
        valorComissaoLideranca: comissao,
        metaMinimaMensal: meta,
      });

      const liderAtual = dados.lider_id ?? "";
      if (liderId !== liderAtual) {
        await definirLider.mutateAsync({
          representanteId: dados.id,
          liderId: liderId || null,
        });
      }

      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível salvar as alterações.");
    }
  }

  return (
    <Dialog
      open={representanteId !== null}
      title={dados ? `Editar representante — ${dados.codigo}` : "Editar representante"}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={enviando} rotulo="Salvar alterações" />}
    >
      {configuracao.isLoading ? (
        <p className="text-sm">Carregando cadastro...</p>
      ) : configuracao.isError ? (
        <Alert tone="error" title="Não foi possível carregar o cadastro deste representante." />
      ) : !dados ? (
        <Alert tone="warning" title="Representante não encontrado." />
      ) : (
        <form id="w2k-form" onSubmit={enviar} className="flex flex-col gap-3">
          {erro ? <Alert tone="error" title={erro} /> : null}
          <Field label="Código (não pode ser alterado)">
            <Input value={dados.codigo} readOnly />
          </Field>
          <Field label="Nome" htmlFor="edit-nome">
            <Input
              id="edit-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              required
            />
          </Field>
          <Field label="Premiação por contrato (R$)" htmlFor="edit-premiacao">
            <Input
              id="edit-premiacao"
              value={valorPremiacao}
              onChange={(event) => setValorPremiacao(event.target.value)}
              inputMode="decimal"
              placeholder="deixe vazio se ainda não definido"
            />
          </Field>
          <Field label="Meta mínima de contratos no mês" htmlFor="edit-meta">
            <Input
              id="edit-meta"
              value={metaMinima}
              onChange={(event) => setMetaMinima(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="deixe vazio se ainda não definida"
            />
          </Field>
          <Field label="Filiado ao líder" htmlFor="edit-lider">
            <Select
              id="edit-lider"
              value={liderId}
              onChange={(event) => setLiderId(event.target.value)}
            >
              <option value="">Nenhum — não pertence a uma equipe</option>
              {possiveisLideres
                .filter((lider) => lider.id !== dados.id)
                .map((lider) => (
                  <option key={lider.id} value={lider.id}>
                    {lider.nome}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Comissão de liderança por contrato da equipe (R$)" htmlFor="edit-comissao">
            <Input
              id="edit-comissao"
              value={valorComissao}
              onChange={(event) => setValorComissao(event.target.value)}
              inputMode="decimal"
              placeholder="preencha apenas se este representante for líder"
            />
          </Field>
          {dados.e_lider ? (
            <Alert
              tone="info"
              title={`Este representante lidera ${dados.qtd_equipe} representante(s).`}
            />
          ) : null}
        </form>
      )}
    </Dialog>
  );
}

export function DialogRegistrarProducao({
  open,
  onClose,
  representantes,
  representanteInicial,
}: {
  open: boolean;
  onClose: () => void;
  representantes: Array<{ id: string; nome: string }>;
  representanteInicial?: string;
}) {
  const [representanteId, setRepresentanteId] = useState(representanteInicial ?? "");
  const [dataProducao, setDataProducao] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarProducao();

  function fechar() {
    setErro(null);
    setQuantidade("1");
    setObservacao("");
    registrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    const quantidadeNumero = Number(quantidade);
    if (!representanteId) return setErro("Selecione o representante.");
    if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0)
      return setErro("Quantidade deve ser um número inteiro maior que zero.");
    if (!dataProducao || dataProducao > hojeISO())
      return setErro("Informe uma data de produção válida.");
    try {
      await registrar.mutateAsync({
        representanteId,
        dataProducao,
        quantidade: quantidadeNumero,
        observacao,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar a produção.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Registrar produção (contratos Serasa)"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={registrar.isPending} rotulo="Registrar" />}
    >
      {representantes.length === 0 ? (
        <Alert tone="warning" title="Nenhum representante cadastrado nesta supervisão.">
          Cadastre um representante antes de registrar produção.
        </Alert>
      ) : (
        <form id="w2k-form" onSubmit={enviar} className="flex flex-col gap-3">
          {erro ? <Alert tone="error" title={erro} /> : null}
          <Field label="Representante" htmlFor="prod-rep">
            <Select
              id="prod-rep"
              value={representanteId}
              onChange={(event) => setRepresentanteId(event.target.value)}
              required
            >
              <option value="">Selecione...</option>
              {representantes.map((representante) => (
                <option key={representante.id} value={representante.id}>
                  {representante.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data da produção" htmlFor="prod-data">
            <Input
              id="prod-data"
              type="date"
              value={dataProducao}
              max={hojeISO()}
              onChange={(event) => setDataProducao(event.target.value)}
              required
            />
          </Field>
          <Field label="Quantidade de contratos" htmlFor="prod-qtd">
            <Input
              id="prod-qtd"
              type="number"
              min={1}
              step={1}
              value={quantidade}
              onChange={(event) => setQuantidade(event.target.value)}
              required
            />
          </Field>
          <Field label="Observação (opcional)" htmlFor="prod-obs">
            <Input
              id="prod-obs"
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}

export function DialogMeta({
  open,
  onClose,
  supervisorId,
  periodo,
}: {
  open: boolean;
  onClose: () => void;
  supervisorId?: string | undefined;
  periodo: string;
}) {
  const [indicador, setIndicador] = useState<Meta["indicador"]>("contratos_mes");
  const [valor, setValor] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState(limitesDoPeriodo(periodo).inicio);
  const [vigenciaFim, setVigenciaFim] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const cadastrar = useCadastrarMeta();

  function fechar() {
    setValor("");
    setVigenciaFim("");
    setErro(null);
    cadastrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    const valorNumero = Number(valor);
    if (!supervisorId) return setErro("Contexto de supervisão indisponível.");
    if (!Number.isFinite(valorNumero) || valorNumero < 0)
      return setErro("Informe um valor de meta válido.");
    if (!vigenciaInicio) return setErro("Informe o início da vigência.");
    if (vigenciaFim && vigenciaFim < vigenciaInicio)
      return setErro("O fim da vigência não pode ser anterior ao início.");
    try {
      await cadastrar.mutateAsync({
        supervisorId,
        indicador,
        valor: valorNumero,
        vigenciaInicio,
        vigenciaFim: vigenciaFim || null,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cadastrar a meta.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Cadastrar meta"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={cadastrar.isPending} rotulo="Cadastrar meta" />}
    >
      <form id="w2k-form" onSubmit={enviar} className="flex flex-col gap-3">
        {erro ? <Alert tone="error" title={erro} /> : null}
        <Alert tone="info" title="Metas não são sobrescritas.">
          Cada cadastro cria uma nova vigência; o histórico anterior é preservado.
        </Alert>
        <Field label="Indicador" htmlFor="meta-indicador">
          <Select
            id="meta-indicador"
            value={indicador}
            onChange={(event) => setIndicador(event.target.value as Meta["indicador"])}
          >
            <option value="contratos_mes">Contratos do mês</option>
            <option value="representantes_ativos">Representantes ativos (absoluto)</option>
          </Select>
        </Field>
        <Field label="Valor" htmlFor="meta-valor">
          <Input
            id="meta-valor"
            type="number"
            min={0}
            step={1}
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            required
          />
        </Field>
        <Field label="Início da vigência" htmlFor="meta-inicio">
          <Input
            id="meta-inicio"
            type="date"
            value={vigenciaInicio}
            onChange={(event) => setVigenciaInicio(event.target.value)}
            required
          />
        </Field>
        <Field
          label="Fim da vigência (opcional)"
          htmlFor="meta-fim"
          hint="Em branco = vigência aberta."
        >
          <Input
            id="meta-fim"
            type="date"
            value={vigenciaFim}
            onChange={(event) => setVigenciaFim(event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
