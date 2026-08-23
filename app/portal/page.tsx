import { redirect } from "next/navigation";
import { getAccessContext } from "../lib/auth/access";
import "./portal.css";

export const dynamic = "force-dynamic";

type PortalSummary = {
  display_name: string;
  therapy_type: string;
  plan_sessions: number | null;
  sessions_done: number | null;
  sessions_scheduled: number | null;
  progress_percent: number | null;
  progress_disclaimer: string;
  next_session_at: string | null;
  therapist_message: string | null;
  home_program: string | null;
  updated_at: string;
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 100));
}

function formatAppointment(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(date);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeZone: "America/Lima",
  }).format(date);
}

export default async function PatientPortalPage() {
  const { supabase, userId, role, fullName } = await getAccessContext();

  if (!userId) redirect("/sign-in");
  if (role === "physio") redirect("/");

  if (role !== "patient") {
    return <PortalState title="Tu acceso aún no está configurado" message="Pide a tu fisioterapeuta que complete la activación de tu portal." />;
  }

  const { data } = await supabase
    .from("patient_portal_summaries")
    .select("display_name, therapy_type, plan_sessions, sessions_done, sessions_scheduled, progress_percent, progress_disclaimer, next_session_at, therapist_message, home_program, updated_at")
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
  const summary = data as PortalSummary | null;

  const name = summary?.display_name || fullName || "Paciente";
  const progress = clampProgress(summary?.progress_percent ?? 0);
  const appointment = formatAppointment(summary?.next_session_at ?? null);
  const planSessions = summary?.plan_sessions ?? 0;
  const sessionsDone = summary?.sessions_done ?? 0;
  const sessionsScheduled = summary?.sessions_scheduled ?? 0;
  const pending = Math.max(planSessions - sessionsDone - sessionsScheduled, 0);

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <div className="portal-brand"><span aria-hidden="true">✦</span><b>Fisio<span>EnCasa</span></b></div>
        <form action="/auth/signout" method="post"><button type="submit">Cerrar sesión</button></form>
      </header>

      <div className="portal-content">
        <div className="portal-welcome">
          <div>
            <p className="portal-eyebrow">MI INFORMACIÓN</p>
            <h1>Hola, {name}</h1>
            <p>Este es tu resumen compartido por tu fisioterapeuta.</p>
          </div>
          <span className="read-only-badge">Solo lectura</span>
        </div>

        {!summary ? (
          <PortalState title="Tu resumen todavía no está disponible" message="Tu acceso está activo. Cuando el fisioterapeuta publique información aprobada, aparecerá aquí." embedded />
        ) : (
          <>
            <section className="portal-card next-appointment">
              <span className="portal-card-icon" aria-hidden="true">▣</span>
              <div>
                <p>PRÓXIMA SESIÓN</p>
                <h2>{appointment ?? "Aún no hay una sesión programada"}</h2>
                <small>{summary.therapy_type}</small>
              </div>
            </section>

            <section className="portal-card portal-progress-card">
              <div className="portal-section-heading">
                <div><p>EVOLUCIÓN FUNCIONAL</p><h2>Progreso general</h2></div>
                <b>{progress}%</b>
              </div>
              <div className="portal-progress" role="progressbar" aria-label="Progreso funcional" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
              <p className="portal-disclaimer">{summary.progress_disclaimer}</p>
            </section>

            <section className="portal-card">
              <div className="portal-section-heading"><div><p>PLAN ACTUAL</p><h2>Sesiones</h2></div></div>
              <div className="session-stats">
                <div><b>{sessionsDone}</b><span>Realizadas</span></div>
                <div><b>{sessionsScheduled}</b><span>Agendadas</span></div>
                <div><b>{pending}</b><span>Pendientes</span></div>
              </div>
              <p className="session-total">Plan acordado: <b>{planSessions} sesiones</b></p>
            </section>

            {summary.therapist_message && (
              <section className="portal-card portal-copy-card">
                <p>MENSAJE DE TU FISIOTERAPEUTA</p>
                <h2>Indicaciones compartidas</h2>
                <div>{summary.therapist_message}</div>
              </section>
            )}

            {summary.home_program && (
              <section className="portal-card portal-copy-card home-program">
                <p>PROGRAMA EN CASA</p>
                <h2>Actividades indicadas</h2>
                <div>{summary.home_program}</div>
              </section>
            )}

            <p className="portal-updated">Actualizado por tu fisioterapeuta {formatUpdatedAt(summary.updated_at)}</p>
          </>
        )}

        <section className="portal-privacy">
          <span aria-hidden="true">⌾</span>
          <p><b>Tu información está protegida.</b><br />Este portal muestra únicamente el resumen que tu fisioterapeuta decidió compartir contigo. No permite modificar la historia clínica.</p>
        </section>
      </div>
    </main>
  );
}

function PortalState({ title, message, embedded = false }: { title: string; message: string; embedded?: boolean }) {
  const content = (
    <section className="portal-state-card">
      <span aria-hidden="true">✦</span>
      <h1>{title}</h1>
      <p>{message}</p>
      {!embedded && <form action="/auth/signout" method="post"><button type="submit">Cerrar sesión</button></form>}
    </section>
  );
  return embedded ? content : <main className="portal-shell portal-centered">{content}</main>;
}

