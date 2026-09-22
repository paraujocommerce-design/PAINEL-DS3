import { useState } from "react";
import {
  Alert,
  ClassicButton,
  EmptyState,
  LoadingState,
  Panel,
  Toolbar,
  ToolbarSeparator,
  Window,
} from "@/components/w2k";
import { useOrdensPagamento, useRepresentantes } from "./api";
import { useContratosAguardando } from "./api-wizard";
import { OrdemDetalhe } from "./ordem-detalhe";
import { OrdemImagem } from "./ordem-imagem";
import { RelatorioPagamento } from "./relatorio";
import { WizardNovaOrdem } from "./wizard-nova-ordem";

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function periodoAtual(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}-01`;
}

export function PagamentosModule() {
  const [aba, setAba] = useState<"contratos" | "ordens">("contratos");
  const [representanteId, setRepresentanteId] = useState("");
  const [competencia, setCompetencia] = useState(periodoAtual());
  const [wizard, setWizard] = useState(false);
  const [ordemAbertaId, setOrdemAbertaId] = useState<string | null>(null);
  const [verImagem, setVerImagem] = useState(false);
  const [verRelatorio, setVerRelatorio] = useState(false);

  const representantes = useRepresentantes();
  const contratos = useContratosAguardando(representanteId);
  const ordens = useOrdensPagamento(competencia);

  if (ordemAbertaId && verImagem) {
    const ordem = (ordens.data ?? []).find((o) => o.id === ordemAbertaId);
    if (ordem) {
      return (
        <Window title="Pagamentos — ordem em imagem" className="h-full">
          <OrdemImagem ordem={ordem} onVoltar={() => setVerImagem(false)} />
        </Window>
      );
    }
  }

  if (ordemAbertaId && verRelatorio) {
    const ordem = (ordens.data ?? []).find((o) => o.id === ordemAbertaId);
    if (ordem) {
      return (
        <Window title="Pagamentos — relatório do representante" className="h-full">
          <RelatorioPagamento
            ordem={ordem}
            onVoltar={() => setVerRelatorio(false)}
          />
        </Window>
      );
    }
  }

  if (ordemAbertaId) {
    const ordem = (ordens.data ?? []).find((o) => o.id === ordemAbertaId);
    if (ordem) {
      return (
        <Window title="Pagamentos — detalhe da ordem" className="h-full">
          <OrdemDetalhe
            ordem={ordem}
            onVoltar={() => setOrdemAbertaId(null)}
            onImagem={() => setVerImagem(true)}
            onRelatorio={() => setVerRelatorio(true)}
          />
        </Window>
      );
    }
  }

  return (
    <>
      <Toolbar>
        <ClassicButton variant="primary" onClick={() => setWizard(true)}>
          Nova ordem
        </ClassicButton>
        <ToolbarSeparator />
        <div className="flex gap-2">
          <ClassicButton
            variant={aba === "contratos" ? "primary" : "default"}
            onClick={() => setAba("contratos")}
          >
            Contratos aguardando
          </ClassicButton>
          <ClassicButton
            variant={aba === "ordens" ? "primary" : "default"}
            onClick={() => setAba("ordens")}
          >
            Ordens criadas
          </ClassicButton>
        </div>
      </Toolbar>

      <Panel>
        {aba === "contratos" ? (
          <>
            <div className="mb-3 flex gap-2">
              <select
                value={representanteId}
                onChange={(e) => setRepresentanteId(e.target.value)}
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="">Todos os representantes</option>
                {(representantes.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} — {r.nome}
                  </option>
                ))}
              </select>
            </div>

            {contratos.isLoading ? (
              <LoadingState />
            ) : (contratos.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhum contrato aguardando."
                description="Todos os contratos já foram lançados em ordens."
              />
            ) : (
              <div className="space-y-1">
                {(contratos.data ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="border rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold">{c.codigo_contrato}</span>
                      <span className="text-sm">
                        {c.pos_venda_pendente ? "❌ Pendente" : "✓ OK"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {c.nome_fantasia}
                    </div>
                    {c.premiavel && (
                      <div className="text-sm text-green-600">
                        R${" "}
                        {c.valor_disponivel_premiacao.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-3">
              <input
                type="month"
                value={competencia.slice(0, 7)}
                onChange={(e) => setCompetencia(e.target.value + "-01")}
                className="rounded border px-2 py-1 text-sm"
              />
            </div>

            {ordens.isLoading ? (
              <LoadingState />
            ) : (ordens.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhuma ordem nesta competência."
                description="Use 'Nova ordem' para abrir uma."
              />
            ) : (
              <div className="space-y-1">
                {(ordens.data ?? []).map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setOrdemAbertaId(o.id)}
                    className="cursor-pointer border rounded p-2 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold">{formatarData(o.data_ordem)}</span>
                      <span className="text-sm">{o.status}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {o.representante_codigo} — {o.representante_nome}
                    </div>
                    <div className="text-sm">
                      {o.itens} itens — R${" "}
                      {o.total_liquido.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>

      <WizardNovaOrdem
        aberto={wizard}
        onFechar={() => setWizard(false)}
        onCriada={(id) => {
          setWizard(false);
          setOrdemAbertaId(id);
          setAba("ordens");
        }}
      />
    </>
  );
}
