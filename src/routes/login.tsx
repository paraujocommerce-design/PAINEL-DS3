import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Window, Field, Input, ClassicButton, Alert, StatusBar } from "@/components/w2k";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel de Gestão DS3" },
      { name: "description", content: "Acesso restrito ao Painel de Gestão DS3." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Login,
});

function Login() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") void navigate({ to: "/", replace: true });
  }, [status, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Window title="Painel de Gestão DS3 — Acesso">
          {status === "unconfigured" ? (
            <Alert tone="error" title="Backend não configurado">
              Defina as variáveis de ambiente do projeto Supabase para habilitar o acesso.
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="E-mail" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Senha" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? <Alert tone="error" title={error} /> : null}

            <div className="flex justify-end">
              <ClassicButton
                type="submit"
                variant="primary"
                disabled={submitting || status === "unconfigured" || status === "loading"}
              >
                {submitting ? "Entrando..." : "Entrar"}
              </ClassicButton>
            </div>
          </form>

          <p className="mt-3 text-xs text-muted-foreground">
            Acesso restrito. Não há cadastro público: o usuário é criado pelo administrador
            diretamente no Supabase.
          </p>
        </Window>
        <StatusBar items={[status === "loading" ? "Verificando sessão..." : "Pronto"]} />
      </div>
    </div>
  );
}
