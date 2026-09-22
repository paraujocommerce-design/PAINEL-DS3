import { useState } from "react";
import {
  Alert,
  ClassicButton,
  Field,
  Input,
  LoadingState,
  Select,
  Toolbar,
  ToolbarSeparator,
  Window,
} from "@/components/w2k";
import { useRepresentantes, useRubricas } from "./api";
import {
  useContratosAguardando,
  useSaldoRepresentante,
  useCriarOrdemCompleta,
  type ContratoAguardando,
} from "./api-wizard";

type Passo = 1 | 2 | 3 | 4;

export function WizardNovaOrdem({
  aberto,
  onFechar,
  onCriada,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (ordemId: string) => void;
}) {
  const [passo, setPasso] = useState<Passo>(1);
  const [representanteId, setRepresentanteId] = useState("");
  const [dataOrdem, setDataOrdem] = useState(hoje());
  const [contratosMarcados, setContratosMarcados] = useState<Set<string>>(
    new Set()
  );
  const [rubricas, setRubricas] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);

  const representantes = useRepresentantes();
  const rubricas_db = useRubricas();
  const contratos = useContratosAguardando(representanteId);
  const saldo = useSaldoRepresentante(representanteId);
  const criar = useCriarOrdemCompleta();

  function hoje(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function avancar() {
    if (passo === 1) {
      if (!representanteId) {
        setErro("Escolha o representante.");
        return;
      }
      setErro(null);
      setPasso(2);
    } else if (passo === 2) {
      setErro(null);
      setPasso(3);
    } else if (passo === 3) {
      setErro(null);
      setPasso(4);
    }
  }

  function voltar() {
    setErro(null);
    setPasso(Math.max(1, passo - 1) as Passo);
  }

  async function salvar() {
    try {
      setErro(null);
      await criar.mutateAsync({
        representanteId,
        dataOrdem,
        contratoIds: Array.from(contratosMarcados),
        rubricas,
      });
      onFechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Erro ao criar ordem.");
    }
  }

  if (!aberto) return null;

  return (
    <Window
      title={`Nova ordem — Passo ${passo} de 4`}
      className="h-full max-h-[90vh]"
    >
      {erro && <Alert tone="error" title={erro} />}

      {passo === 1 && (
        <div className="flex flex-col gap-3">
          <Field label="Representante">
            <Select
              value={representanteId}
              onChange={(e) => setRepresentanteId(e.target.value)}
            >
              <option value="">Escolha...</option>
              {(representantes.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo} — {r.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dia da ordem">
            <Input
              type="date"
              value={dataOrdem}
              onChange={(e) => setDataOrdem(e.target.value)}
            />
          </Field>
        </div>
      )}

      {passo === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold">
            Contratos aguardando pagamento de {representanteId}
          </p>
          {contratos.isLoading ? (
            <LoadingState />
          ) : (contratos.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum contrato.</p>
          ) : (
            <div className="max-h-[40vh] overflow-auto space-y-1 border rounded p-2">
              {contratos.data?.map((c) => (
                <label key={c.id} className="flex items-start gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={contratosMarcados.has(c.id)}
                    onChange={(e) => {
                      const novo = new Set(contratosMarcados);
                      if (e.target.checked) novo.add(c.id);
                      else novo.delete(c.id);
                      setContratosMarcados(novo);
                    }}
                  />
                  <span className="flex-1 text-sm">
                    <strong>{c.codigo_contrato}</strong> — {c.nome_fantasia}
                    {c.pos_venda_pendente && (
                      <span className="block text-xs text-orange-600">
                        ⚠ Pós-venda pendente (só adiantamento)
                      </span>
                    )}
                    {c.premiavel && (
                      <span className="block text-xs text-green-600">
                        R$ {c.valor_disponivel_premiacao.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {passo === 3 && (
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto">
          <p className="text-sm font-bold">Rubricas</p>
          <div className="space-y-2">
            {(rubricas_db.data ?? [])
              .filter((r) => !r.automatica)
              .map((r) => (
                <Field key={r.codigo} label={r.rotulo}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rubricas[r.codigo] ?? 0}
                    onChange={(e) =>
                      setRubricas({
                        ...rubricas,
                        [r.codigo]: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
              ))}
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="flex flex-col gap-3">
          <p className="font-bold">Resumo</p>
          <div className="space-y-1 text-sm">
            <p>
              <strong>Representante:</strong>{" "}
              {(representantes.data ?? []).find((r) => r.id === representanteId)
                ?.nome || "—"}
            </p>
            <p>
              <strong>Data:</strong> {dataOrdem}
            </p>
            <p>
              <strong>Contratos selecionados:</strong> {contratosMarcados.size}
            </p>
            <p className="mt-2">
              <strong>Saldo a receber:</strong> R${" "}
              {(saldo.data?.saldo_a_receber ?? 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      )}

      <Toolbar className="mt-4 justify-between">
        <div>
          <ClassicButton onClick={onFechar}>Cancelar</ClassicButton>
        </div>
        <div className="flex gap-2">
          {passo > 1 && <ClassicButton onClick={voltar}>← Voltar</ClassicButton>}
          {passo < 4 ? (
            <ClassicButton variant="primary" onClick={avancar}>
              Próximo →
            </ClassicButton>
          ) : (
            <ClassicButton
              variant="primary"
              onClick={() => void salvar()}
              disabled={criar.isPending}
            >
              {criar.isPending ? "Salvando..." : "Criar ordem"}
            </ClassicButton>
          )}
        </div>
      </Toolbar>
    </Window>
  );
}
