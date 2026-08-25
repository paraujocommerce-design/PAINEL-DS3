import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useState, type ReactNode } from "react";
import { MenuBar, StatusBar, Dialog, ClassicButton } from "@/components/w2k";
import { NAV_GROUPS, type NavLink as NavLinkItem } from "@/lib/navigation";

const activeProps = { className: "bg-primary text-primary-foreground font-bold" };

function NavEntry({ link, nested = false }: { link: NavLinkItem; nested?: boolean }) {
  return (
    <li>
      <Link
        to={link.to}
        params={link.params as never}
        activeOptions={{ exact: link.to === "/" }}
        activeProps={activeProps}
        className={`block px-2 py-[3px] text-sm hover:bg-accent hover:text-accent-foreground ${
          nested ? "pl-6" : ""
        }`}
      >
        {link.label}
      </Link>
      {link.children ? (
        <ul>
          {link.children.map((child) => (
            <NavEntry key={`${child.to}-${child.label}`} link={child} nested />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { email, signOut } = useAuth();
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-1">
      <div className="w2k-out flex min-h-0 flex-1 flex-col p-[3px]">
        <div className="w2k-titlebar flex items-center justify-between px-2 py-[3px]">
          <h1 className="text-sm font-bold tracking-tight">Painel de Gestão DS3</h1>
          <span className="text-xs">{email ?? "Sessão"}</span>
        </div>

        <div className="w2k-groove mt-[3px]">
          <MenuBar
            menus={[
              {
                label: "Arquivo",
                items: [
                  { label: "Importar", onSelect: () => navigate({ to: "/importacao" }) },
                  {
                    label: "Exportar",
                    onSelect: () =>
                      setNotice(
                        "Exportação ainda não definida. Formato, escopo e permissões dependem de decisão de negócio.",
                      ),
                  },
                  {
                    label: "Sair",
                    separatorBefore: true,
                    onSelect: () => {
                      void handleSignOut();
                    },
                  },
                ],
              },
            ]}
          />
        </div>

        <div className="mt-[3px] flex min-h-0 flex-1 flex-col gap-[3px] md:flex-row">
          <nav
            aria-label="Navegação principal"
            className="w2k-in w2k-scroll shrink-0 overflow-y-auto bg-surface p-1 md:w-56"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <ul>
                  {group.links.map((link) => (
                    <NavEntry key={link.to} link={link} />
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <main className="w2k-scroll min-h-0 flex-1 overflow-auto">{children}</main>
        </div>

        <StatusBar
          items={[
            "Fundação técnica. Sem dados comerciais registrados.",
            "Backend: Supabase",
            `Sessão: ${email ?? "—"}`,
          ]}
        />
      </div>

      <Dialog
        open={notice !== null}
        title="Ação não disponível"
        onClose={() => setNotice(null)}
        footer={<ClassicButton onClick={() => setNotice(null)}>OK</ClassicButton>}
      >
        {notice}
      </Dialog>
    </div>
  );
}
