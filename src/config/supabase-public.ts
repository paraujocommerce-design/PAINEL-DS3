/**
 * Configuração PÚBLICA e versionada do projeto Supabase próprio da DS3.
 *
 * Somente valores públicos (URL + publishable/anon key) podem existir aqui.
 * A service_role key NUNCA deve ser adicionada neste arquivo nem em qualquer
 * código do frontend.
 *
 * Esta configuração é a fonte persistente usada quando as variáveis de
 * ambiente VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão definidas.
 */
export const SUPABASE_PUBLIC_CONFIG = {
  url: "https://izvgsxmfazbwudwgcsdr.supabase.co",
  anonKey: "sb_publishable_t9VTTzTw9Mqb8HKJvXNehQ_l_fmg_CE",
} as const;
