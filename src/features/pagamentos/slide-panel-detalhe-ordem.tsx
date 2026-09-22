import { useState } from "react";
import { ClassicButton, Alert, LoadingState } from "@/components/w2k";
import { SlidePanel } from "@/components/slide-panel";
import type { OrdemPagamento } from "./api";
import {
  useDecidirAutorizacao,
  usePagarOrdem,
  useReabrirOrdem,
  useAcaoOrdem,
} from "./api";

interface SlidePanelDetalheOrdemProps {
  isOpen: boolean;
  onClose: () => void;
  ordem: OrdemPagamento | null;
  onRefresh?: () => void;
}

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function SlidePanelDetalheOrdem({
  isOpen,
  onClose,
  ordem,
  onRefresh,
}: SlidePanelDetalheOrdemProps) {
  const [tab, setTab] = useState<"resumo" | "autorizacoes" | "pagamento">(
    "resumo"
  );
  const [motivo, setMotivo] = useState("");

  const decidirAut = useDecidirAutorizacao();
  const pagar = usePagarOrdem();
  const reabrir = useReabrirOrdem();
  const acaoOrdem = useAcaoOrdem();

  if (!ordem || !isOpen) return null;

  const handleReabrir = async () => {
    if (!motivo) {
      alert("Informe o motivo da reabertura");
      return;
    }
    await reabrir.mutateAsync({
      ordem_id: ordem.id,
      motivo,
    });
    setMotivo("");
    onRefresh?.();
  };

  const footerButtons = (
    <div className="flex gap-2">
      <ClassicButton onClick={onClose} variant="default">
        Fechar
      </ClassicButton>
      {ordem.status === "aberta" && (
        <ClassicButton variant="primary">
          Fechar ordem
        </ClassicButton>
      )}
      {ordem.status === "fechada" && (
        <ClassicButton variant="primary">
          Autorizar
        </ClassicButton>
      )}
      {ordem.status === "paga" && (
        <ClassicButton variant="default">
          Reabrir
        </ClassicButton>
      )}
    </div>
  );

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Ordem #${ordem.id.slice(0, 8)}`}
      footer={footerButtons}
      width="lg"
    >
      {/* Resumo rápido */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded p-4 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Representante</div>
            <div className="font-bold">
              {ordem.representante_codigo} — {ordem.representante_nome}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="font-bold">{ordem.status.toUpperCase()}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Valor total</div>
            <div className="font-bold text-lg">{moeda(ordem.total_liquido)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Data ordem</div>
            <div className="font-bold">{ordem.data_ordem}</div>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 border-b dark:border-gray-800">
        {["resumo", "autorizacoes", "pagamento"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${
              tab === t
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "resumo" && "Resumo"}
            {t === "autorizacoes" && "Autorizações"}
            {t === "pagamento" && "Pagamento"}
          </button>
        ))}
      </div>

      {/* Conteúdo por aba */}
      {tab === "resumo" && (
        <div className="space-y-3">
          <div>
            <h3 className="font-bold mb-2">Itens da ordem</h3>
            <div className="text-sm space-y-1 bg-gray-50 dark:bg-gray-900 p-3 rounded">
              {ordem.itens || "0"} itens — {moeda(ordem.total_liquido)}
            </div>
          </div>
          {ordem.status === "aberta" && (
            <Alert variant="info">
              Ordem em montagem. Use "Editar" para adicionar itens.
            </Alert>
          )}
          {ordem.status === "fechada" && (
            <Alert variant="warning">
              Esperando autorizações. Veja a aba "Autorizações".
            </Alert>
          )}
          {ordem.status === "paga" && (
            <Alert variant="success">
              Ordem já foi paga. {ordem.data_pagamento || ""}
            </Alert>
          )}
        </div>
      )}

      {tab === "autorizacoes" && (
        <div className="space-y-3">
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Histórico de autorizações para esta ordem.
            </p>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs">
              <div>Operação: {ordem.autorizacoes_concedidas > 0 ? "✓ Autorizada" : "— Pendente"}</div>
              <div>Supervisão: {ordem.autorizacoes_concedidas > 0 ? "✓ Autorizada" : "— Pendente"}</div>
              <div>Admin: {ordem.liberada_para_pagamento ? "✓ Autorizada" : "— Pendente"}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "pagamento" && (
        <div className="space-y-3">
          {ordem.status === "paga" ? (
            <div>
              <h3 className="font-bold mb-2">Pagamento realizado</h3>
              <div className="text-sm space-y-1 bg-gray-50 dark:bg-gray-900 p-3 rounded">
                <div>Data: {ordem.data_pagamento || "—"}</div>
                <div>Valor: {moeda(ordem.valor_pago || 0)}</div>
                <div>Forma: {ordem.forma_pagamento || "—"}</div>
              </div>
            </div>
          ) : ordem.status === "fechada" ? (
            <Alert variant="warning">
              Ordem precisa de autorização antes de pagar.
            </Alert>
          ) : (
            <Alert variant="info">
              Feche a ordem para iniciar o processo de pagamento.
            </Alert>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
