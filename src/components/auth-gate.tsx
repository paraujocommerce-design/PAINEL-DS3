import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Window, Alert, LoadingState } from "@/components/w2k";
import { useAuth } from "@/lib/auth";

/**
 * Bloqueia toda a área privada. Nenhum conteúdo autenticado é renderizado
 * antes da confirmação da sessão.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") void navigate({ to: "/login", replace: true });
  }, [status, navigate]);

  if (status === "unconfigured") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg">
          <Window title="Configuração pendente">
            <Alert tone="error" title="Conexão com o Supabase não configurada">
              Informe VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do projeto Supabase da DS3 para
              habilitar autenticação e acesso ao sistema.
            </Alert>
          </Window>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <Window title="Painel de Gestão DS3">
            <LoadingState label="Verificando sessão..." />
          </Window>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
