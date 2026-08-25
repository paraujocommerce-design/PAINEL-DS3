import { createFileRoute, redirect } from "@tanstack/react-router";
import { SUPERVISORES } from "@/lib/navigation";

export const Route = createFileRoute("/representantes/")({
  beforeLoad: () => {
    throw redirect({
      to: "/representantes/$supervisor",
      params: { supervisor: SUPERVISORES[0].slug },
    });
  },
});
