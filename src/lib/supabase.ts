import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_CONFIG } from "@/config/supabase-public";

/**
 * Cliente Supabase do projeto próprio da DS3.
 *
 * Precedência: variáveis de ambiente (VITE_*) quando definidas; caso contrário,
 * a configuração pública versionada em src/config/supabase-public.ts.
 * Nunca importar ou expor a service_role key no frontend.
 */
const envUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const envAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

const url = envUrl?.trim() || SUPABASE_PUBLIC_CONFIG.url;
const anonKey = envAnonKey?.trim() || SUPABASE_PUBLIC_CONFIG.anonKey;

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
