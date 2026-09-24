import { useState } from "react";
import {
  ClassicButton,
  EmptyState,
  LoadingState,
  Panel,
  Toolbar,
  Window,
} from "@/components/w2k";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface SaldoRepresentante {
  representante_id: string;
  representante_codigo: string;
  representante_nome: string;
  total_a_receber: number;
  total_pago: number;
  saldo_devedor: number;
  saldo_liquido: number;
}

interface ExtratoBlocos {
  data_ordem: string;
  descricao: string;
  tipo: "crédito" | "débito";
  valor: number;
  status: string;
}

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export function SaldoRepresentante({
  representanteId,
}: {
  representanteId: string;
}) {
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "abertos" | "pagos">(
    "todos"
  );

  // Query para saldo geral
  const saldoQuery = useQuery({
    queryKey: ["saldo-representante", representanteId],
    queryFn: async () => {
      if (!representanteId) return null;
      const { data, error } = await supabase
        .from("v_saldo_representante_detalhado")
        .select("*")
        .eq("representante_id", representanteId)
        .single();
      if (error) throw error;
      return data as SaldoRepresentante;
    },
    enabled: !!representanteId,
  });

  // Query para extrato de movimentações
  const extratoQuery = useQuery({
    queryKey: ["extrato-representante", representanteId, filtroStatus],
    queryFn: async () => {
      if (!representanteId) return [];
      const { data, error } = await supabase
        .from("v_relatorio_pagamento")
        .select("*")
        .eq("representante_id", representanteId)
        .order("data_referencia", { ascending: false });
      if (error) throw error;

      return (data || []).map((item: any) => ({
        data_ordem: item.data_referencia,
        descricao:
          `${item.rubrica} - ${item.codigo_contrato || "Manual"}`.trim(),
        tipo: item.valor_liquido < 0 ? ("débito" as const) : ("crédito" as const),
        valor: Math.abs(item.valor_liquido),
        status: item.status || "registrado",
      }));
    },
    enabled: !!representanteId,
  });

  if (saldoQuery.isLoading) {
    return (
      <Window title="Saldo do representante" className="h-full">
        <LoadingState />
      </Window>
    );
  }

  if (!saldoQuery.data || !representanteId) {
    return (
      <Window title="Saldo do representante" className="h-full">
        <Panel>
          <EmptyState
            title="Representante não encontrado"
            description="Selecione um representante para visualizar o saldo"
          />
        </Panel>
      </Window>
    );
  }

  const saldo = saldoQuery.data;
  const extrato = extratoQuery.data || [];

  return (
    <Window title={`Saldo — ${saldo.representante_codigo} ${saldo.representante_nome}`} className="h-full">
      <Toolbar>
        <h2 className="text-sm font-bold">Resumo financeiro</h2>
      </Toolbar>

      <Panel>
        {/* Três blocos de resumo */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Bloco 1: Total a Receber */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-4">
            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">
              Total a Receber
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-2">
              {moeda(saldo.total_a_receber)}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Premiações e rubricas
            </div>
          </div>

          {/* Bloco 2: Total Pago */}
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-4">
            <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">
              Total Pago
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300 mt-2">
              {moeda(saldo.total_pago)}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              Já liquidado
            </div>
          </div>

          {/* Bloco 3: Saldo Atual */}
          <div
            className={`border-2 rounded p-4 ${
              saldo.saldo_liquido >= 0
                ? "bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800"
                : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
            }`}
          >
            <div className={`text-xs font-bold uppercase ${
              saldo.saldo_liquido >= 0
                ? "text-purple-600 dark:text-purple-400"
                : "text-red-600 dark:text-red-400"
            }`}>
              Saldo Atual
            </div>
            <div className={`text-2xl font-bold mt-2 ${
              saldo.saldo_liquido >= 0
                ? "text-purple-700 dark:text-purple-300"
                : "text-red-700 dark:text-red-300"
            }`}>
              {moeda(saldo.saldo_liquido)}
            </div>
            <div className={`text-xs mt-1 ${
              saldo.saldo_liquido >= 0
                ? "text-purple-600 dark:text-purple-400"
                : "text-red-600 dark:text-red-400"
            }`}>
              {saldo.saldo_devedor > 0
                ? `R$ ${moeda(saldo.saldo_devedor)} em débito`
                : "Sem débitos"}
            </div>
          </div>
        </div>

        {/* Filtro de status */}
        <div className="flex gap-2 mb-4 border-b pb-4 dark:border-gray-800">
          <button
            onClick={() => setFiltroStatus("todos")}
            className={`px-3 py-1 text-sm font-medium rounded ${
              filtroStatus === "todos"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-800 text-muted-foreground"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroStatus("abertos")}
            className={`px-3 py-1 text-sm font-medium rounded ${
              filtroStatus === "abertos"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-800 text-muted-foreground"
            }`}
          >
            Abertos
          </button>
          <button
            onClick={() => setFiltroStatus("pagos")}
            className={`px-3 py-1 text-sm font-medium rounded ${
              filtroStatus === "pagos"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-800 text-muted-foreground"
            }`}
          >
            Pagos
          </button>
        </div>

        {/* Extrato em linguagem simples */}
        <div>
          <h3 className="text-sm font-bold mb-3">Extrato de movimentações</h3>

          {extratoQuery.isLoading ? (
            <LoadingState />
          ) : extrato.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação"
              description="Não há registros para este filtro"
            />
          ) : (
            <div className="space-y-2">
              {extrato.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-3 border rounded hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {item.descricao}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatarData(item.data_ordem)} • {item.status}
                    </div>
                  </div>
                  <div
                    className={`text-right font-bold ml-4 ${
                      item.tipo === "crédito"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.tipo === "crédito" ? "+" : "-"} {moeda(item.valor)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </Window>
  );
}
