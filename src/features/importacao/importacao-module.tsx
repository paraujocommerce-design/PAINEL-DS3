import { useMemo, useState } from "react";
import {
  Alert,
  ClassicButton,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Panel,
  Progress,
  StatusBar,
  Table,
  Tabs,
  Window,
} from "@/components/w2k";
import {
  COLUNAS_OFICIAIS,
  analisarLinhas,
  hashSha256,
  validarCabecalho,
  type CelulaBruta,
  type ResultadoAnalise,
} from "./dominio";
import {
  buscarChavesExistentes,
  loteJaConfirmado,
  useConfirmarImportacao,
  useLinhasLote,
  useLotes,
  useRepresentantesIndice,
  type ResumoConfirmacao,
} from "./api";

const ETAPAS = [
  "Arquivo",
  "Validação de estrutura",
  "Análise de linhas",
  "Prévia e duplicidades",
  "Confirmação",
  "Log",
] as const;

type Arquivo = { nome: string; tamanho: number; hash: string };

function statusRotulo(status: string) {
  if (status === "nova") return "Nova";
  if (status === "duplicada") return "Duplicada";
  if (status === "importada") return "Importada";
  if (status === "rejeitada") return "Rejeitada";
  return status;
}

export function ImportacaoModule() {
  const [aba, setAba] = useState("importar");
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null);
  const [erroEstrutura, setErroEstrutura] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [resumo, setResumo] = useState<ResumoConfirmacao | null>(null);
  const [loteSelecionado, setLoteSelecionado] = useState<string | null>(null);

  const representantes = useRepresentantesIndice();
  const lotes = useLotes();
  const linhasLote = useLinhasLote(loteSelecionado);
  const confirmar = useConfirmarImportacao();

  const etapaAtual = resumo ? 5 : analise ? 3 : arquivo ? 1 : 0;

  function limpar() {
    setArquivo(null);
    setAnalise(null);
    setErroEstrutura(null);
    setResumo(null);
  }

  async function selecionarArquivo(file: File) {
    limpar();
    setProcessando(true);
    try {
      const buffer = await file.arrayBuffer();
      const hash = await hashSha256(buffer);

      const jaImportado = await loteJaConfirmado(hash);
      if (jaImportado) {
        setErroEstrutura(
          `Este arquivo já foi importado e confirmado em ${new Date(
            jaImportado.concluido_em ?? jaImportado.iniciado_em,
          ).toLocaleString("pt-BR")} (lote "${jaImportado.nome_arquivo}").`,
        );
        setArquivo({ nome: file.name, tamanho: file.size, hash });
        return;
      }

      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const linhas = (await readXlsxFile(file)) as unknown as CelulaBruta[][];
      if (linhas.length === 0) {
        setErroEstrutura("A planilha está vazia.");
        setArquivo({ nome: file.name, tamanho: file.size, hash });
        return;
      }

      const cabecalho = validarCabecalho(linhas[0] ?? []);
      if (!cabecalho.ok) {
        setErroEstrutura(
          `Estrutura incompatível. Colunas ausentes: ${cabecalho.faltando.join(", ")}.`,
        );
        setArquivo({ nome: file.name, tamanho: file.size, hash });
        return;
      }

      const corpo = linhas.slice(1);
      const indiceCodigo = cabecalho.indices["Código do contrato"] ?? -1;
      const codigos = corpo
        .map((linha) => String(linha[indiceCodigo] ?? "").trim())
        .filter((codigo) => codigo !== "");
      const existentes = await buscarChavesExistentes(codigos);

      const resultado = await analisarLinhas(
        corpo,
        cabecalho.indices,
        representantes.data ?? [],
        existentes,
      );

      setArquivo({ nome: file.name, tamanho: file.size, hash });
      setAnalise(resultado);
    } catch (erro) {
      setErroEstrutura(erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarImportacao() {
    if (!arquivo || !analise) return;
    const retorno = await confirmar.mutateAsync({
      nomeArquivo: arquivo.nome,
      hashArquivo: arquivo.hash,
      tamanhoBytes: arquivo.tamanho,
      totalLinhas: analise.total,
      linhas: analise.linhas,
    });
    setResumo(retorno);
    setLoteSelecionado(retorno.lote_id);
  }

  const previa = useMemo(
    () =>
      (analise?.linhas ?? []).map((linha) => ({
        linha: linha.numero_linha,
        status: statusRotulo(linha.status),
        representante: linha.representante_nome ?? "—",
        contrato: linha.payload?.codigo_contrato ?? "—",
        data: linha.payload?.data_venda ?? "—",
        premiavel: linha.payload === null ? "—" : linha.payload.premiavel ? "Sim" : "Não",
        motivo: linha.motivo_rejeicao ?? "—",
      })),
    [analise],
  );

  return (
    <Window title="Importação — Representantes" className="h-full">
      <Tabs
        items={[
          { value: "importar", label: "Importar" },
          { value: "historico", label: "Histórico de lotes" },
        ]}
        value={aba}
        onChange={setAba}
      >
        {aba === "importar" ? (
          <div className="flex flex-col gap-[3px] overflow-auto">
            <Panel title="Etapas">
              <ol className="flex flex-wrap gap-[3px]">
                {ETAPAS.map((etapa, index) => (
                  <li
                    key={etapa}
                    className={
                      index <= etapaAtual
                        ? "w2k-out px-2 py-[3px] text-xs font-bold"
                        : "w2k-out px-2 py-[3px] text-xs text-muted-foreground"
                    }
                  >
                    {index + 1}. {etapa}
                  </li>
                ))}
              </ol>
              {processando ? (
                <div className="mt-3 max-w-sm">
                  <Progress label="Analisando arquivo..." />
                </div>
              ) : null}
            </Panel>

            <Panel title="1. Arquivo (.xlsx)">
              <Field
                label="Selecionar planilha"
                htmlFor="arquivo-importacao"
                hint={`Colunas obrigatórias: ${COLUNAS_OFICIAIS.join(", ")}.`}
              >
                <Input
                  id="arquivo-importacao"
                  type="file"
                  accept=".xlsx"
                  disabled={processando || representantes.isLoading}
                  onChange={(evento) => {
                    const file = evento.target.files?.[0];
                    if (file) void selecionarArquivo(file);
                  }}
                />
              </Field>
              {arquivo ? (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {arquivo.nome} — {arquivo.tamanho} bytes — sha256 {arquivo.hash.slice(0, 16)}…
                </p>
              ) : null}
            </Panel>

            {representantes.isError ? (
              <Alert tone="error" title="Falha ao carregar representantes">
                {(representantes.error as Error).message}
              </Alert>
            ) : null}

            {erroEstrutura ? (
              <Alert tone="error" title="Importação bloqueada">
                {erroEstrutura}
              </Alert>
            ) : null}

            {analise ? (
              <>
                <Panel title="2. Prévia e duplicidades">
                  <div className="mb-2 flex flex-wrap gap-3 text-xs">
                    <span>
                      Total analisado: <strong>{analise.total}</strong>
                    </span>
                    <span>
                      Novas: <strong>{analise.novas}</strong>
                    </span>
                    <span>
                      Duplicadas: <strong>{analise.duplicadas}</strong>
                    </span>
                    <span>
                      Rejeitadas: <strong>{analise.rejeitadas}</strong>
                    </span>
                  </div>
                  <Table
                    caption="Prévia das linhas analisadas"
                    columns={[
                      { key: "linha", label: "Linha", align: "right" },
                      { key: "status", label: "Status" },
                      { key: "representante", label: "Representante" },
                      { key: "contrato", label: "Contrato" },
                      { key: "data", label: "Data da venda" },
                      { key: "premiavel", label: "Premiável" },
                      { key: "motivo", label: "Motivo" },
                    ]}
                    rows={previa}
                    emptyMessage="Nenhuma linha de dados na planilha."
                  />
                </Panel>

                <Panel title="3. Confirmação">
                  <Alert tone="warning" title="A gravação é definitiva e rastreável">
                    Somente linhas válidas e não duplicadas são gravadas. Duplicadas e rejeitadas
                    ficam registradas no log do lote, sem alterar dados existentes.
                  </Alert>
                  <div className="mt-2 flex gap-[3px]">
                    <ClassicButton
                      variant="primary"
                      disabled={confirmar.isPending || analise.novas === 0}
                      onClick={() => void confirmarImportacao()}
                    >
                      {confirmar.isPending ? "Gravando..." : `Confirmar ${analise.novas} linha(s)`}
                    </ClassicButton>
                    <ClassicButton onClick={limpar} disabled={confirmar.isPending}>
                      Cancelar
                    </ClassicButton>
                  </div>
                  {confirmar.isError ? (
                    <Alert tone="error" title="Falha na gravação">
                      {(confirmar.error as Error).message}
                    </Alert>
                  ) : null}
                </Panel>
              </>
            ) : null}

            {resumo ? (
              <Alert tone="info" title="Importação concluída">
                Importadas: {resumo.importadas} · Duplicadas: {resumo.duplicadas} · Rejeitadas:{" "}
                {resumo.rejeitadas}. Lote registrado no histórico.
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="mt-[3px] flex flex-col gap-[3px]">
            <Panel title="Lotes de importação">
              {lotes.isLoading ? (
                <LoadingState />
              ) : lotes.isError ? (
                <Alert tone="error" title="Falha ao carregar lotes">
                  {(lotes.error as Error).message}
                </Alert>
              ) : (lotes.data ?? []).length === 0 ? (
                <EmptyState
                  title="Nenhuma importação registrada."
                  description="Nenhum arquivo foi processado até o momento."
                />
              ) : (
                <Table
                  caption="Histórico de lotes"
                  columns={[
                    { key: "arquivo", label: "Arquivo" },
                    { key: "status", label: "Status" },
                    { key: "total", label: "Linhas", align: "right" },
                    { key: "importadas", label: "Importadas", align: "right" },
                    { key: "duplicadas", label: "Duplicadas", align: "right" },
                    { key: "rejeitadas", label: "Rejeitadas", align: "right" },
                    { key: "quando", label: "Concluído em" },
                    { key: "acao", label: "" },
                  ]}
                  rows={(lotes.data ?? []).map((lote) => ({
                    arquivo: lote.nome_arquivo,
                    status: lote.status,
                    total: lote.total_linhas,
                    importadas: lote.linhas_importadas,
                    duplicadas: lote.linhas_duplicadas,
                    rejeitadas: lote.linhas_rejeitadas,
                    quando: lote.concluido_em
                      ? new Date(lote.concluido_em).toLocaleString("pt-BR")
                      : "—",
                    acao: (
                      <ClassicButton onClick={() => setLoteSelecionado(lote.id)}>
                        Detalhar
                      </ClassicButton>
                    ),
                  }))}
                />
              )}
            </Panel>

            {loteSelecionado ? (
              <Panel title="Linhas do lote">
                {linhasLote.isLoading ? (
                  <LoadingState />
                ) : (
                  <Table
                    caption="Linhas do lote selecionado"
                    columns={[
                      { key: "linha", label: "Linha", align: "right" },
                      { key: "status", label: "Status" },
                      { key: "chave", label: "Chave de negócio" },
                      { key: "motivo", label: "Motivo" },
                    ]}
                    rows={(linhasLote.data ?? []).map((linha) => ({
                      linha: linha.numero_linha,
                      status: statusRotulo(linha.status),
                      chave: linha.chave_negocio ?? "—",
                      motivo: linha.motivo_rejeicao ?? "—",
                    }))}
                    emptyMessage="Nenhuma linha registrada neste lote."
                  />
                )}
              </Panel>
            ) : null}
          </div>
        )}
      </Tabs>

      <StatusBar
        items={[
          arquivo ? `Arquivo: ${arquivo.nome}` : "Nenhum arquivo selecionado",
          analise ? `${analise.novas} nova(s) de ${analise.total}` : "Sem análise",
          "Frente: Representantes",
        ]}
      />
    </Window>
  );
}
