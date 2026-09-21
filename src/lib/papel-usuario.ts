import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Papel do usuário logado.
 * Só o administrador pode excluir registros em definitivo — a operação
 * trabalha com cancelamento rastreável.
 */
export function usePapelUsuario() {
  const { session } = useAuth();
  const usuarioId = session?.user?.id;

  const consulta = useQuery({
    queryKey: ["papel-usuario", usuarioId ?? ""],
    enabled: Boolean(usuarioId && supabase),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase!
        .from("user_roles")
        .select("role")
        .eq("user_id", usuarioId!);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ role: string }>).map((linha) => linha.role);
    },
  });

  const papeis = consulta.data ?? [];
  return {
    papeis,
    ehAdmin: papeis.includes("admin"),
    carregando: consulta.isLoading,
  };
}
