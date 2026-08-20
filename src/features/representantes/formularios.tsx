import { useState, type FormEvent } from "react";
import { Dialog, ClassicButton, Field, Input, Select, Alert } from "@/components/w2k";
import { useCadastrarMeta, useCriarRepresentante, useRegistrarProducao, type Meta } from "./api";
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

export function DialogNovoRepresentante({
  open,
  onClose,
  supervisorId,
  supervisorLabel,
}: {
  open: boolean;
  onClose: () => void;
  supervisorId?: string | undefined;
  supervisorLabel: string;
}) {
  const [nome, setNome] = useState("");
  const [dataCadastro, setDataCadastro] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarRepresentante();

  function fechar() {
    setNome("");
    setObservacao("");
    setDataCadastro(hojeISO());
    setErro(null);
    criar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome do representante.");
    if (!supervisorId) return setErro("Contexto de supervisão indisponível.");
    try {
      await criar.mutateAsync({ nome, supervisorId, dataCadastro, observacao });
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
