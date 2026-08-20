import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do projeto próprio da DS3.
 *
 * Exige VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (env vars, nunca hardcoded
 * no código-fonte). Sem elas, `isSupabaseConfigured` fica false e a aplicação
 * cai no estado "unconfigured" em vez de assumir um projeto Supabase por engano.
 * Nunca importar ou expor a service_role key no frontend.
 */
const envUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const envAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

const url = envUrl?.trim();
const anonKey = envAnonKey?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
