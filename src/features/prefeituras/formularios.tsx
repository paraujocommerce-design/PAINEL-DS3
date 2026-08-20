import { useState, type FormEvent } from "react";
import { Dialog, ClassicButton, Field, Input, Select, Alert } from "@/components/w2k";
import {
  useAbrirOportunidade,
  useCadastrarMetaPrefeitura,
  useCancelarContrato,
  useContatosPrefeitura,
  useContratosValidosPrefeitura,
  useCriarPrefeitura,
  useDefinirProximoPasso,
  useGanharOportunidade,
  useMoverEtapa,
  usePerderOportunidade,
  useReabrirOportunidade,
  useRegistrarContato,
  useRegistrarInteracao,
  useRegistrarRenovacao,
  type Contrato,
  type MetaPrefeitura,
  type Oportunidade,
  type Prefeitura,
} from "./api";
import {
  OPCOES_ESPERA,
  ROTULO_ETAPA,
  TIPOS_INTERACAO,
  etapasSelecionaveis,
  formatarData,
  hojeISO,
  limitesDoPeriodo,
  ordemEtapa,
  type Etapa,
  type TipoEspera,
} from "./dominio";

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
      <ClassicButton
        type="submit"
        form="w2k-form-prefeituras"
        variant="primary"
        disabled={enviando}
      >
        {enviando ? "Salvando..." : rotulo}
      </ClassicButton>
    </>
  );
}

function Formulario({
  onSubmit,
  children,
  erro,
}: {
  onSubmit: (event: FormEvent) => void;
  children: React.ReactNode;
  erro: string | null;
}) {
  return (
    <form id="w2k-form-prefeituras" onSubmit={onSubmit} className="flex flex-col gap-2">
      {erro ? (
        <Alert tone="error" title="Não foi possível concluir">
          {erro}
        </Alert>
      ) : null}
      {children}
    </form>
  );
}

/**
 * Campos do próximo movimento.
 * Estado de espera: em andamento (sem espera), aguardando interno ou externo.
 */
function CamposProximoMovimento({
  proximoPasso,
  setProximoPasso,
  prazo,
  setPrazo,
  tipoEspera,
  setTipoEspera,
  dependencia,
  setDependencia,
}: {
  proximoPasso: string;
  setProximoPasso: (valor: string) => void;
  prazo: string;
  setPrazo: (valor: string) => void;
  tipoEspera: TipoEspera | null;
  setTipoEspera: (valor: TipoEspera | null) => void;
  dependencia: string;
  setDependencia: (valor: string) => void;
}) {
  return (
    <>
      <Field
        label="Próximo passo"
        htmlFor="proximo-passo"
        hint="Obrigatório: toda oportunidade aberta tem um movimento definido."
      >
        <Input
          id="proximo-passo"
          value={proximoPasso}
          onChange={(event) => setProximoPasso(event.target.value)}
        />
      </Field>
      <Field label="Prazo / próxima verificação" htmlFor="prazo">
        <Input
          id="prazo"
          type="date"
          value={prazo}
          onChange={(event) => setPrazo(event.target.value)}
        />
      </Field>
      <Field
        label="Situação"
        htmlFor="tipo-espera"
        hint="Em andamento não é espera: só marque aguardando quando houver dependência real."
      >
        <Select
          id="tipo-espera"
          value={tipoEspera ?? ""}
          onChange={(event) => {
            const valor = event.target.value;
            setTipoEspera(valor === "" ? null : (valor as TipoEspera));
            if (valor !== "externa") setDependencia("");
          }}
        >
          {OPCOES_ESPERA.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
            </option>
          ))}
        </Select>
      </Field>
      {tipoEspera === "externa" ? (
        <Field
          label="Dependência externa"
          htmlFor="dependencia"
          hint="Aguardando externo exige a dependência registrada e uma data de verificação."
        >
          <Input
            id="dependencia"
            value={dependencia}
            onChange={(event) => setDependencia(event.target.value)}
          />
        </Field>
      ) : null}
    </>
  );
}

export function DialogNovaPrefeitura({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [uf, setUf] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarPrefeitura();

  function fechar() {
    setNome("");
    setUf("");
    setObservacao("");
    setErro(null);
    criar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome da prefeitura.");
    if (!/^[A-Za-z]{2}$/.test(uf.trim())) return setErro("Informe a UF com duas letras.");
    try {
      await criar.mutateAsync({ nome, uf, observacao });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cadastrar.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Cadastrar prefeitura"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={criar.isPending} rotulo="Cadastrar" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <Field label="Nome do município" htmlFor="nome-prefeitura">
          <Input
            id="nome-prefeitura"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
          />
        </Field>
        <Field
          label="UF"
          htmlFor="uf-prefeitura"
          hint="Municípios homônimos em UFs diferentes são permitidos."
        >
          <Input
            id="uf-prefeitura"
            maxLength={2}
            value={uf}
            onChange={(event) => setUf(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Observação" htmlFor="obs-prefeitura">
          <Input
            id="obs-prefeitura"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogNovaOportunidade({
  open,
  onClose,
  prefeituras,
  responsavelNome,
}: {
  open: boolean;
  onClose: () => void;
  prefeituras: Prefeitura[];
  responsavelNome: string;
}) {
  const [prefeituraId, setPrefeituraId] = useState("");
  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [proximoPasso, setProximoPasso] = useState("");
  const [prazo, setPrazo] = useState(hojeISO());
  const [tipoEspera, setTipoEspera] = useState<TipoEspera | null>(null);
  const [dependencia, setDependencia] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const abrir = useAbrirOportunidade();

  function fechar() {
    setPrefeituraId("");
    setProximoPasso("");
    setDependencia("");
    setErro(null);
    abrir.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!prefeituraId) return setErro("Selecione a prefeitura.");
    if (!proximoPasso.trim()) return setErro("Informe o próximo passo.");
    try {
      await abrir.mutateAsync({
        prefeituraId,
        proximoPasso,
        prazo,
        tipoEspera,
        dependenciaExterna: dependencia,
        dataEntrada,
      });

      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível abrir a oportunidade.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Abrir oportunidade (nova prefeitura)"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={abrir.isPending} rotulo="Abrir" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <Field label="Prefeitura" htmlFor="oportunidade-prefeitura">
          <Select
            id="oportunidade-prefeitura"
            value={prefeituraId}
            onChange={(event) => setPrefeituraId(event.target.value)}
          >
            <option value="">Selecione</option>
            {prefeituras.map((prefeitura) => (
              <option key={prefeitura.id} value={prefeitura.id}>
                {prefeitura.nome} — {prefeitura.uf}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável">
          <Input value={responsavelNome} readOnly />
        </Field>
        <Field label="Data de entrada no funil" htmlFor="data-entrada">
          <Input
            id="data-entrada"
            type="date"
            value={dataEntrada}
            onChange={(event) => setDataEntrada(event.target.value)}
          />
        </Field>
        <CamposProximoMovimento
          proximoPasso={proximoPasso}
          setProximoPasso={setProximoPasso}
          prazo={prazo}
          setPrazo={setPrazo}
          tipoEspera={tipoEspera}
          setTipoEspera={setTipoEspera}
          dependencia={dependencia}
          setDependencia={setDependencia}
        />
        <p className="text-xs text-muted-foreground">
          A oportunidade entra em PROSPECÇÃO. A etapa CONTRATO só é alcançada pelo fechamento.
        </p>
      </Formulario>
    </Dialog>
  );
}

export function DialogMoverEtapa({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa | "">("");
  const [proximoPasso, setProximoPasso] = useState("");
  const [prazo, setPrazo] = useState(hojeISO());
  const [tipoEspera, setTipoEspera] = useState<TipoEspera | null>(null);
  const [dependencia, setDependencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const mover = useMoverEtapa();
  const contatos = useContatosPrefeitura(oportunidade?.prefeitura_id ?? null);

  const atual = oportunidade ? ordemEtapa(oportunidade.etapa_atual) : 0;
  const retrocesso = etapa ? ordemEtapa(etapa) < atual : false;
  const decisores = (contatos.data ?? []).filter(
    (contato) => contato.decisor && contato.ativo,
  ).length;

  function fechar() {
    setEtapa("");
    setProximoPasso("");
    setDependencia("");
    setMotivo("");
    setErro(null);
    mover.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    if (!etapa) return setErro("Selecione a etapa.");
    if (!proximoPasso.trim()) return setErro("Informe o próximo passo.");
    if (retrocesso && !motivo.trim()) return setErro("Retrocesso exige motivo registrado.");
    try {
      await mover.mutateAsync({
        oportunidadeId: oportunidade.id,
        etapaNova: etapa,
        proximoPasso,
        prazo,
        tipoEspera,
        dependenciaExterna: dependencia,
        motivo,
        ocorridoEm,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível mover a etapa.");
    }
  }

  const opcoes = etapasSelecionaveis().filter(
    (item) => ordemEtapa(item) <= atual + 1 && item !== oportunidade?.etapa_atual,
  );

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Mover etapa — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={mover.isPending} rotulo="Registrar movimento" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <Field label="Etapa atual">
          <Input
            value={oportunidade ? ROTULO_ETAPA[oportunidade.etapa_atual as Etapa] : ""}
            readOnly
          />
        </Field>
        <Field
          label="Nova etapa"
          htmlFor="nova-etapa"
          hint="O funil avança uma etapa por vez; retrocesso é permitido com motivo."
        >
          <Select
            id="nova-etapa"
            value={etapa}
            onChange={(event) => setEtapa(event.target.value as Etapa)}
          >
            <option value="">Selecione</option>
            {opcoes.map((item) => (
              <option key={item} value={item}>
                {ROTULO_ETAPA[item]}
              </option>
            ))}
          </Select>
        </Field>
        {etapa === "decisor" && decisores === 0 ? (
          <Alert tone="warning" title="Decisor não identificado">
            A etapa DECISOR exige pelo menos um decisor cadastrado para esta prefeitura.
          </Alert>
        ) : null}
        <Field label="Data do movimento" htmlFor="data-movimento">
          <Input
            id="data-movimento"
            type="date"
            value={ocorridoEm}
            onChange={(event) => setOcorridoEm(event.target.value)}
          />
        </Field>
        {retrocesso ? (
          <Field label="Motivo do retrocesso" htmlFor="motivo-retrocesso">
            <Input
              id="motivo-retrocesso"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
            />
          </Field>
        ) : null}
        <CamposProximoMovimento
          proximoPasso={proximoPasso}
          setProximoPasso={setProximoPasso}
          prazo={prazo}
          setPrazo={setPrazo}
          tipoEspera={tipoEspera}
          setTipoEspera={setTipoEspera}
          dependencia={dependencia}
          setDependencia={setDependencia}
        />
      </Formulario>
    </Dialog>
  );
}

export function DialogProximoPasso({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [proximoPasso, setProximoPasso] = useState("");
  const [prazo, setPrazo] = useState(hojeISO());
  const [tipoEspera, setTipoEspera] = useState<TipoEspera | null>(null);
  const [dependencia, setDependencia] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const definir = useDefinirProximoPasso();

  function fechar() {
    setProximoPasso("");
    setDependencia("");
    setErro(null);
    definir.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    if (!proximoPasso.trim()) return setErro("Informe o próximo passo.");
    try {
      await definir.mutateAsync({
        oportunidadeId: oportunidade.id,
        proximoPasso,
        prazo,
        tipoEspera,
        dependenciaExterna: dependencia,
        ocorridoEm,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível atualizar.");
    }
  }

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Próximo movimento — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={definir.isPending} rotulo="Atualizar" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          A alteração não sobrescreve o histórico: o próximo passo anterior fica registrado nas
          movimentações.
        </p>
        <Field label="Próximo passo atual">
          <Input value={oportunidade?.proximo_passo ?? "—"} readOnly />
        </Field>
        <Field label="Prazo atual">
          <Input value={formatarData(oportunidade?.prazo ?? null)} readOnly />
        </Field>
        <Field label="Data da atualização" htmlFor="data-proximo-passo">
          <Input
            id="data-proximo-passo"
            type="date"
            value={ocorridoEm}
            onChange={(event) => setOcorridoEm(event.target.value)}
          />
        </Field>
        <CamposProximoMovimento
          proximoPasso={proximoPasso}
          setProximoPasso={setProximoPasso}
          prazo={prazo}
          setPrazo={setPrazo}
          tipoEspera={tipoEspera}
          setTipoEspera={setTipoEspera}
          dependencia={dependencia}
          setDependencia={setDependencia}
        />
      </Formulario>
    </Dialog>
  );
}

export function DialogFechamento({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [dataContrato, setDataContrato] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const ganhar = useGanharOportunidade();

  function fechar() {
    setObservacao("");
    setErro(null);
    ganhar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    try {
      await ganhar.mutateAsync({ oportunidadeId: oportunidade.id, dataContrato, observacao });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar o contrato.");
    }
  }

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Fechar contrato — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={ganhar.isPending} rotulo="Registrar contrato" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          O fechamento move a oportunidade para CONTRATO, encerra o funil e registra o contrato novo
          na mesma operação.
        </p>
        <Field label="Data do contrato" htmlFor="data-contrato">
          <Input
            id="data-contrato"
            type="date"
            value={dataContrato}
            onChange={(event) => setDataContrato(event.target.value)}
          />
        </Field>
        <Field label="Observação" htmlFor="obs-contrato">
          <Input
            id="obs-contrato"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogPerda({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const perder = usePerderOportunidade();

  function fechar() {
    setMotivo("");
    setErro(null);
    perder.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    if (!motivo.trim()) return setErro("Perda exige motivo registrado.");
    try {
      await perder.mutateAsync({ oportunidadeId: oportunidade.id, motivo, ocorridoEm });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar a perda.");
    }
  }

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Registrar perda — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={perder.isPending} rotulo="Registrar perda" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <Field
          label="Motivo da perda"
          htmlFor="motivo-perda"
          hint="O histórico é preservado: a oportunidade pode ser reaberta depois."
        >
          <Input
            id="motivo-perda"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
        <Field label="Data" htmlFor="data-perda">
          <Input
            id="data-perda"
            type="date"
            value={ocorridoEm}
            onChange={(event) => setOcorridoEm(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogReabertura({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");
  const [prazo, setPrazo] = useState(hojeISO());
  const [tipoEspera, setTipoEspera] = useState<TipoEspera | null>(null);
  const [dependencia, setDependencia] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const reabrir = useReabrirOportunidade();

  function fechar() {
    setMotivo("");
    setProximoPasso("");
    setDependencia("");
    setErro(null);
    reabrir.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    if (!motivo.trim()) return setErro("Informe o motivo da reabertura.");
    if (!proximoPasso.trim()) return setErro("Informe o próximo passo.");
    try {
      await reabrir.mutateAsync({
        oportunidadeId: oportunidade.id,
        motivo,
        proximoPasso,
        prazo,
        tipoEspera,
        dependenciaExterna: dependencia,
        ocorridoEm,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível reabrir.");
    }
  }

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Reabrir oportunidade — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={reabrir.isPending} rotulo="Reabrir" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          A reabertura não apaga a perda: ela entra no histórico como novo movimento.
        </p>
        <Field label="Motivo da reabertura" htmlFor="motivo-reabertura">
          <Input
            id="motivo-reabertura"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
        <Field label="Data" htmlFor="data-reabertura">
          <Input
            id="data-reabertura"
            type="date"
            value={ocorridoEm}
            onChange={(event) => setOcorridoEm(event.target.value)}
          />
        </Field>
        <CamposProximoMovimento
          proximoPasso={proximoPasso}
          setProximoPasso={setProximoPasso}
          prazo={prazo}
          setPrazo={setPrazo}
          tipoEspera={tipoEspera}
          setTipoEspera={setTipoEspera}
          dependencia={dependencia}
          setDependencia={setDependencia}
        />
      </Formulario>
    </Dialog>
  );
}

export function DialogInteracao({
  oportunidade,
  onClose,
}: {
  oportunidade: Oportunidade | null;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<string>("contato");
  const [descricao, setDescricao] = useState("");
  const [ocorridoEm, setOcorridoEm] = useState(hojeISO());
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarInteracao();

  function fechar() {
    setDescricao("");
    setErro(null);
    registrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!oportunidade) return;
    if (!descricao.trim()) return setErro("Descreva a interação.");
    try {
      await registrar.mutateAsync({
        oportunidadeId: oportunidade.id,
        tipo,
        descricao,
        ocorridoEm,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar.");
    }
  }

  return (
    <Dialog
      open={Boolean(oportunidade)}
      title={`Registrar interação — ${oportunidade?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={registrar.isPending} rotulo="Registrar" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          Interação não é etapa: proposta comercial é registro relevante, não avanço automático do
          funil.
        </p>
        <Field label="Tipo" htmlFor="tipo-interacao">
          <Select
            id="tipo-interacao"
            value={tipo}
            onChange={(event) => setTipo(event.target.value)}
          >
            {TIPOS_INTERACAO.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data" htmlFor="data-interacao">
          <Input
            id="data-interacao"
            type="date"
            value={ocorridoEm}
            onChange={(event) => setOcorridoEm(event.target.value)}
          />
        </Field>
        <Field label="Descrição" htmlFor="descricao-interacao">
          <Input
            id="descricao-interacao"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogContato({
  prefeituraId,
  prefeituraNome,
  onClose,
}: {
  prefeituraId: string | null;
  prefeituraNome: string;
  onClose: () => void;
}) {
  const [nome, setNome] = useState("");
  const [funcao, setFuncao] = useState("");
  const [decisor, setDecisor] = useState(true);
  const [contato, setContato] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarContato();

  function fechar() {
    setNome("");
    setFuncao("");
    setContato("");
    setDecisor(true);
    setErro(null);
    registrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!prefeituraId) return;
    if (!nome.trim()) return setErro("Informe o nome do contato.");
    try {
      await registrar.mutateAsync({ prefeituraId, nome, funcao, decisor, contato });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar o contato.");
    }
  }

  return (
    <Dialog
      open={Boolean(prefeituraId)}
      title={`Contatos e decisores — ${prefeituraNome}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={registrar.isPending} rotulo="Registrar" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <Field label="Nome" htmlFor="nome-contato">
          <Input id="nome-contato" value={nome} onChange={(event) => setNome(event.target.value)} />
        </Field>
        <Field label="Função" htmlFor="funcao-contato">
          <Input
            id="funcao-contato"
            value={funcao}
            onChange={(event) => setFuncao(event.target.value)}
          />
        </Field>
        <Field
          label="Contato"
          htmlFor="canal-contato"
          hint="Telefone, e-mail ou outro canal informado."
        >
          <Input
            id="canal-contato"
            value={contato}
            onChange={(event) => setContato(event.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={decisor}
            onChange={(event) => setDecisor(event.target.checked)}
          />
          É decisor (pode haver mais de um)
        </label>
      </Formulario>
    </Dialog>
  );
}

export function DialogRenovacao({
  open,
  onClose,
  prefeituras,
}: {
  open: boolean;
  onClose: () => void;
  prefeituras: Prefeitura[];
}) {
  const [prefeituraId, setPrefeituraId] = useState("");
  const [dataContrato, setDataContrato] = useState(hojeISO());
  const [contratoAnteriorId, setContratoAnteriorId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const registrar = useRegistrarRenovacao();
  const contratosPrefeitura = useContratosValidosPrefeitura(prefeituraId || null);

  const anteriores = contratosPrefeitura.data ?? [];

  function fechar() {
    setPrefeituraId("");
    setContratoAnteriorId("");
    setObservacao("");
    setErro(null);
    registrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!prefeituraId) return setErro("Selecione a prefeitura.");
    if (!contratoAnteriorId)
      return setErro("Selecione o contrato anterior válido que está sendo renovado.");
    try {
      await registrar.mutateAsync({
        prefeituraId,
        dataContrato,
        contratoAnteriorId,
        observacao,
      });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível registrar a renovação.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Registrar renovação de contrato"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={registrar.isPending} rotulo="Registrar" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          Renovação não passa pelo funil de novas prefeituras e é contada separadamente. Exige o
          contrato anterior válido da mesma prefeitura, com data posterior a ele.
        </p>
        <Field label="Prefeitura" htmlFor="renovacao-prefeitura">
          <Select
            id="renovacao-prefeitura"
            value={prefeituraId}
            onChange={(event) => {
              setPrefeituraId(event.target.value);
              setContratoAnteriorId("");
            }}
          >
            <option value="">Selecione</option>
            {prefeituras.map((prefeitura) => (
              <option key={prefeitura.id} value={prefeitura.id}>
                {prefeitura.nome} — {prefeitura.uf}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data da renovação" htmlFor="renovacao-data">
          <Input
            id="renovacao-data"
            type="date"
            value={dataContrato}
            onChange={(event) => setDataContrato(event.target.value)}
          />
        </Field>
        <Field
          label="Contrato anterior"
          htmlFor="renovacao-anterior"
          hint="Obrigatório: mantém a cadeia de renovações rastreável. Um contrato só pode ter uma renovação válida."
        >
          <Select
            id="renovacao-anterior"
            value={contratoAnteriorId}
            onChange={(event) => setContratoAnteriorId(event.target.value)}
          >
            <option value="">Selecione</option>
            {anteriores.map((contrato) => (
              <option key={contrato.id} value={contrato.id}>
                {contrato.tipo === "nova" ? "Contrato novo" : "Renovação"} —{" "}
                {formatarData(contrato.data_contrato)}
              </option>
            ))}
          </Select>
        </Field>
        {prefeituraId && anteriores.length === 0 ? (
          <Alert tone="warning" title="Sem contrato válido">
            Esta prefeitura não possui contrato válido registrado: a renovação depende de um
            contrato anterior não cancelado.
          </Alert>
        ) : null}

        <Field label="Observação" htmlFor="renovacao-obs">
          <Input
            id="renovacao-obs"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogCancelarContrato({
  contrato,
  onClose,
}: {
  contrato: Contrato | null;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useCancelarContrato();

  function fechar() {
    setMotivo("");
    setErro(null);
    cancelar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    if (!contrato) return;
    if (!motivo.trim()) return setErro("Informe o motivo do cancelamento.");
    try {
      await cancelar.mutateAsync({ contratoId: contrato.id, motivo });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cancelar.");
    }
  }

  return (
    <Dialog
      open={Boolean(contrato)}
      title={`Cancelar contrato — ${contrato?.prefeitura_nome ?? ""}`}
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={cancelar.isPending} rotulo="Cancelar contrato" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          O contrato não é apagado: o cancelamento fica registrado com motivo e responsável.
        </p>
        <Field label="Motivo do cancelamento" htmlFor="motivo-cancelamento">
          <Input
            id="motivo-cancelamento"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}

export function DialogMetaPrefeitura({
  open,
  onClose,
  periodo,
}: {
  open: boolean;
  onClose: () => void;
  periodo: string;
}) {
  const [indicador, setIndicador] = useState<MetaPrefeitura["indicador"]>("novas_prefeituras_mes");
  const [valor, setValor] = useState("");
  const [vigencia, setVigencia] = useState(limitesDoPeriodo(periodo).inicio);
  const [erro, setErro] = useState<string | null>(null);
  const cadastrar = useCadastrarMetaPrefeitura();

  function fechar() {
    setValor("");
    setErro(null);
    cadastrar.reset();
    onClose();
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0)
      return setErro("A meta deve ser um número inteiro maior que zero.");
    try {
      await cadastrar.mutateAsync({ indicador, valor: numero, vigenciaInicio: vigencia });
      fechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível cadastrar a meta.");
    }
  }

  return (
    <Dialog
      open={open}
      title="Meta da frente Prefeituras"
      onClose={fechar}
      footer={<Rodape onClose={fechar} enviando={cadastrar.isPending} rotulo="Cadastrar meta" />}
    >
      <Formulario onSubmit={enviar} erro={erro}>
        <p className="text-xs text-muted-foreground">
          Metas desta frente são independentes das metas de Representantes. A vigência anterior é
          encerrada automaticamente, sem sobrescrever o histórico.
        </p>
        <Field label="Indicador" htmlFor="meta-indicador">
          <Select
            id="meta-indicador"
            value={indicador}
            onChange={(event) => setIndicador(event.target.value as MetaPrefeitura["indicador"])}
          >
            <option value="novas_prefeituras_mes">Novas prefeituras no mês</option>
            <option value="renovacoes_prefeituras_mes">Renovações no mês</option>
          </Select>
        </Field>
        <Field label="Valor" htmlFor="meta-valor">
          <Input
            id="meta-valor"
            type="number"
            min={1}
            step={1}
            value={valor}
            onChange={(event) => setValor(event.target.value)}
          />
        </Field>
        <Field label="Vigência a partir de" htmlFor="meta-vigencia">
          <Input
            id="meta-vigencia"
            type="date"
            value={vigencia}
            onChange={(event) => setVigencia(event.target.value)}
          />
        </Field>
      </Formulario>
    </Dialog>
  );
}
