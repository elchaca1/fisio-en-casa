import { redirect } from "next/navigation";
import ClinicianDashboard from "./clinician-dashboard";
import { getAccessContext } from "./lib/auth/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId, role } = await getAccessContext();

  if (!userId) redirect("/sign-in");
  if (role === "patient") redirect("/portal");

  if (role !== "physio") {
    return (
      <main className="access-state">
        <section>
          <span aria-hidden="true">✦</span>
          <p>CUENTA PROTEGIDA</p>
          <h1>Tu acceso aún no está configurado</h1>
          <p>La cuenta existe, pero todavía no tiene un perfil autorizado. Solicita al administrador que complete la activación.</p>
          <form action="/auth/signout" method="post"><button type="submit">Cerrar sesión</button></form>
        </section>
      </main>
    );
  }

  return <ClinicianDashboard />;
}

