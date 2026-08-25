import { createFileRoute, notFound } from "@tanstack/react-router";
import { RepresentantesModule } from "@/features/representantes/representantes-module";
import { findSupervisor } from "@/lib/navigation";

export const Route = createFileRoute("/representantes/$supervisor")({
  loader: ({ params }) => {
    const supervisor = findSupervisor(params.supervisor);
    if (!supervisor) throw notFound();
    return { supervisor };
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `Representantes ${loaderData.supervisor.label} — Painel de Gestão DS3`
      : "Supervisão indisponível — Painel de Gestão DS3";
    const description = loaderData
      ? `Gestão de representantes sob a supervisão de ${loaderData.supervisor.label}.`
      : "Supervisão não encontrada.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(loaderData ? [] : [{ name: "robots", content: "noindex" }]),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: RepresentantesRoute,
  errorComponent: SupervisorErro,
  notFoundComponent: SupervisorNaoEncontrado,
});

function RepresentantesRoute() {
  const { supervisor } = Route.useLoaderData();
  return <RepresentantesModule supervisor={supervisor} />;
}

function SupervisorNaoEncontrado() {
  return (
    <div className="w2k-in bg-input p-6 text-sm">
      Supervisão não encontrada. Verifique o endereço informado.
    </div>
  );
}

function SupervisorErro() {
  return (
    <div className="w2k-in bg-input p-6 text-sm">
      Não foi possível carregar a supervisão. Tente novamente.
    </div>
  );
}
