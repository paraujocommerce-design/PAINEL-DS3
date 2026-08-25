import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "unconfigured";

type AuthValue = {
  status: AuthStatus;
  session: Session | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Mensagens de erro claras, sem expor detalhes internos do provedor. */
function friendlyError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (normalized.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (normalized.includes("too many")) return "Muitas tentativas. Aguarde e tente novamente.";
  if (normalized.includes("failed to fetch") || normalized.includes("network"))
    return "Não foi possível conectar ao servidor de autenticação.";
  return "Não foi possível autenticar. Tente novamente.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const status: AuthStatus = !isSupabaseConfigured
      ? "unconfigured"
      : !ready
        ? "loading"
        : session
          ? "authenticated"
          : "unauthenticated";

    return {
      status,
      session,
      email: session?.user.email ?? null,
      signIn: async (email, password) => {
        if (!supabase) return { error: "Backend não configurado." };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? friendlyError(error.message) : null };
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    };
  }, [ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return context;
}
