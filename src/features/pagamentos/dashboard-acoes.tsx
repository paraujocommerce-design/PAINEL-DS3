import {
  Alert,
  ClassicButton,
  EmptyState,
  LoadingState,
  Panel,
  Toolbar,
  IndicatorSlot,
  Window,
} from "@/components/w2k";
import { usePapelUsuario } from "@/lib/papel-usuario";
import {
  useAutorizacoesPendentes,
  useOrdensProntasParaPagar,
  useOrdensAbertasOperacao,
} from "./api";

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function DashboardAcoes({
  onAbrirOrdem,
}: {
  onAbrirOrdem: (ordemId: string) => void;
}) {
  const papel = usePapelUsuario();
  const autPendentes = useAutorizacoesPendentes();
  const ordensParaPagar = useOrdensProntasParaPagar();
  const ordensAbertas = useOrdensAbertasOperacao();

  if (!papel) return <LoadingState />;

  return (
    <Window title="Próximas ações" className="h-full">
      {papel === "supervisao" && (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <h2 className="text-sm font-bold">
              {autPendentes.data?.length ?? 0} autorização(ões) pendente(s)
            </h2>
          </Toolbar>
          <Panel>
            {autPendentes.isLoading ? (
              <LoadingState />
            ) : (autPendentes.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhuma ordem esperando sua autorização."
                description="Todas as ordens fechadas já foram autorizadas ou recusadas."
              />
            ) : (
              <div className="space-y-2">
                {(autPendentes.data ?? []).map((a) => (
                  <div
                    key={a.ordem_id}
                    className="border rounded p-3 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                    onClick={() => onAbrirOrdem(a.ordem_id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm">
                          {a.representante_codigo} — {a.representante_nome}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatarData(a.data_ordem)} • {a.total_itens} itens
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {moeda(a.total_valor)}
                        </div>
                        <ClassicButton
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbrirOrdem(a.ordem_id);
                          }}
                        >
                          Autorizar
                        </ClassicButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {papel === "admin" && (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <h2 className="text-sm font-bold">
              {ordensParaPagar.data?.filter((o) => o.pode_pagar).length ?? 0} ordem(ns) pronta(s)
            </h2>
          </Toolbar>
          <Panel>
            {ordensParaPagar.isLoading ? (
              <LoadingState />
            ) : (ordensParaPagar.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhuma ordem pronta para pagamento."
                description="Todas as ordens estão abertas ou precisam de autorização."
              />
            ) : (
              <div className="space-y-2">
                {(ordensParaPagar.data ?? []).map((o) => (
                  <div
                    key={o.id}
                    className={`border rounded p-3 cursor-pointer ${
                      o.pode_pagar
                        ? "hover:bg-green-50 dark:hover:bg-green-900/20"
                        : "opacity-50"
                    }`}
                    onClick={() => onAbrirOrdem(o.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm">
                          {o.representante_codigo} — {o.representante_nome}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatarData(o.data_ordem)} • {o.total_itens} itens
                        </div>
                        <div className="text-xs text-yellow-600">
                          {o.situacao}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {moeda(o.total_valor)}
                        </div>
                        {o.pode_pagar && (
                          <ClassicButton
                            size="sm"
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAbrirOrdem(o.id);
                            }}
                          >
                            Pagar
                          </ClassicButton>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {papel === "operacao" && (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <h2 className="text-sm font-bold">
              {ordensAbertas.data?.length ?? 0} ordem(ns) em andamento
            </h2>
          </Toolbar>
          <Panel>
            {ordensAbertas.isLoading ? (
              <LoadingState />
            ) : (ordensAbertas.data ?? []).length === 0 ? (
              <EmptyState
                title="Nenhuma ordem aberta."
                description="Todas as ordens foram fechadas ou canceladas."
              />
            ) : (
              <div className="space-y-2">
                {(ordensAbertas.data ?? []).map((o) => (
                  <div
                    key={o.id}
                    className="border rounded p-3 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                    onClick={() => onAbrirOrdem(o.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm">
                          {o.representante_codigo} — {o.representante_nome}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatarData(o.data_ordem)} • {o.total_itens} itens
                        </div>
                        {o.autorizacoes_exigidas > 0 && (
                          <div className="text-xs text-blue-600">
                            {o.autorizacoes_pendentes}/{o.autorizacoes_exigidas} autorizações pendentes
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {moeda(o.total_valor)}
                        </div>
                        <ClassicButton
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbrirOrdem(o.id);
                          }}
                        >
                          Editar
                        </ClassicButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </Window>
  );
}
