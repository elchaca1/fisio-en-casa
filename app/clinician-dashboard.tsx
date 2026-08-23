"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

type Therapy = "Física / Deportiva" | "Neurológica";
type Patient = { id: string; name: string; initials: string; birthDate: string | null; age: number | null; therapy: Therapy; diagnosis: string; frequency: string; plan: number; done: number; scheduled: number; progress: number; district: string; address: string; color: string };
type PatientRecord = { id: string; full_name: string; birth_date: string | null; therapy_type: Therapy; diagnosis: string | null; session_frequency: string; plan_sessions: number; sessions_done: number; sessions_scheduled: number; progress: number; district: string | null; address: string | null };
type AppointmentStatus = "Programada" | "Realizada" | "Cancelada" | "Reprogramar";
type AppointmentRecord = { id: string; patient_id: string; starts_at: string; ends_at: string; duration_minutes: number; session_number: number; status: AppointmentStatus; patients: { full_name: string; therapy_type: Therapy; district: string | null; address: string | null } | { full_name: string; therapy_type: Therapy; district: string | null; address: string | null }[] };
type Appointment = { id: string; patientId: string; patientName: string; therapy: Therapy; district: string; address: string; startsAt: string; endsAt: string; duration: number; sessionNumber: number; status: AppointmentStatus };

const colors = ["lilac", "blue", "peach", "mint"];
const nav = ["Inicio", "Pacientes", "Agenda", "Evaluaciones"];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
function ageFromDate(value: string | null) { if (!value) return null; const birth = new Date(`${value}T12:00:00`); const now = new Date(); let age = now.getFullYear() - birth.getFullYear(); if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--; return age >= 0 && age <= 130 ? age : null; }
function toPatient(record: PatientRecord): Patient { return { id: record.id, name: record.full_name, initials: initials(record.full_name), birthDate: record.birth_date, age: ageFromDate(record.birth_date), therapy: record.therapy_type, diagnosis: record.diagnosis || "Diagnóstico pendiente de registrar", frequency: record.session_frequency, plan: record.plan_sessions, done: record.sessions_done, scheduled: record.sessions_scheduled, progress: record.progress, district: record.district || "No registrado", address: record.address || "No registrada", color: colors[record.full_name.length % colors.length] }; }

const evaluationQuestions: Record<Therapy, string[]> = {
  "Física / Deportiva": [
    "¿Cuándo comenzó la lesión o el problema y cómo ocurrió?",
    "¿Cuánto dolor presenta actualmente del 0 al 10?",
    "¿Dónde siente el dolor y cómo lo describiría: punzante, quemante, presión, rigidez u otro?",
    "¿Qué movimiento, actividad o posición aumenta el dolor o la molestia?",
    "¿Qué movimientos o actividades no puede realizar, o realiza con dificultad, desde que empezó el problema?",
    "¿Hay algo que disminuya el dolor o mejore sus síntomas, como reposo, movimiento, frío, calor o medicamentos?",
    "¿Ha recibido previamente algún diagnóstico, examen, tratamiento, fisioterapia, infiltración o cirugía por este problema?",
    "¿Tiene antecedentes médicos, lesiones anteriores o enfermedades que puedan influir en su recuperación?",
    "Antes de esta lesión, ¿qué nivel de actividad tenía y qué actividades, trabajo o deporte realizaba normalmente?",
    "¿Cuál es la principal actividad o capacidad que desea recuperar con la terapia?",
    "Observaciones o notas adicionales",
  ],
  "Neurológica": [
    "¿Cuándo ocurrió el evento neurológico o cuándo comenzaron los síntomas?",
    "¿Cuál fue el diagnóstico médico y qué ocurrió durante ese evento?",
    "¿Qué lado o partes del cuerpo están actualmente más afectadas?",
    "¿Presenta dolor actualmente? Si es así, ¿dónde y cuánto del 0 al 10?",
    "¿Qué dificultad tiene actualmente para mover brazos, piernas, tronco o mantener una postura?",
    "¿Puede sentarse, ponerse de pie, realizar transferencias y caminar? ¿Cuánta ayuda necesita?",
    "¿Ha tenido problemas de equilibrio, caídas, mareos, rigidez, espasticidad o movimientos involuntarios?",
    "¿Ha presentado cambios en sensibilidad, habla, comprensión, visión, memoria o capacidad para seguir instrucciones?",
    "Antes del evento, ¿qué actividades realizaba independientemente y cuáles necesita ayuda para realizar actualmente?",
    "¿Cuál es la función más importante que el paciente o la familia quieren recuperar primero?",
    "Observaciones o notas adicionales",
  ],
};
function toAppointment(record: AppointmentRecord): Appointment { const details = Array.isArray(record.patients) ? record.patients[0] : record.patients; return { id: record.id, patientId: record.patient_id, patientName: details?.full_name || "Paciente", therapy: details?.therapy_type || "Neurológica", district: details?.district || "Distrito no registrado", address: details?.address || "Dirección no registrada", startsAt: record.starts_at, endsAt: record.ends_at, duration: record.duration_minutes, sessionNumber: record.session_number, status: record.status }; }
function Avatar({ patient }: { patient: Patient }) { return <span className={`avatar ${patient.color}`}>{patient.initials}</span>; }
function Progress({ value }: { value: number }) { return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} /></div>; }
function formatTime(value: string) { return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" }).format(new Date(value)); }
function formatAppointmentDate(value: string) { return new Intl.DateTimeFormat("es-PE", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value)); }

export default function ClinicianDashboard() {
  const [view, setView] = useState("Inicio");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [tab, setTab] = useState("Resumen");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null);
  const [appointmentPatient, setAppointmentPatient] = useState<Patient | null>(null);
  const [agendaMode, setAgendaMode] = useState<"Día" | "Semana">("Día");
  const [evalType, setEvalType] = useState<Therapy>("Neurológica");
  const [interview, setInterview] = useState(false);
  const [question, setQuestion] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => Array(11).fill(""));

  const loadWorkspace = async () => {
    setLoading(true); setError("");
    try { const [patientsResponse, appointmentsResponse] = await Promise.all([fetch("/api/patients", { cache: "no-store" }), fetch("/api/appointments", { cache: "no-store" })]); const [patientsBody, appointmentsBody] = await Promise.all([patientsResponse.json(), appointmentsResponse.json()]); if (!patientsResponse.ok) throw new Error(patientsBody.error || "No se pudo cargar la lista."); if (!appointmentsResponse.ok) throw new Error(appointmentsBody.error || "No se pudo cargar la agenda."); setPatients((patientsBody.patients as PatientRecord[]).map(toPatient)); setAppointments((appointmentsBody.appointments as AppointmentRecord[]).map(toAppointment)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar el espacio de trabajo."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadWorkspace(); }, []);
  const visiblePatients = useMemo(() => patients.filter((patient) => `${patient.name} ${patient.diagnosis} ${patient.therapy}`.toLowerCase().includes(query.toLowerCase())), [patients, query]);
  const goPatient = (patient: Patient) => { setSelected(patient); setTab("Resumen"); setView("Ficha"); };
  const openEvaluation = (patient: Patient) => { setSelected(patient); setEvalType(patient.therapy); setInterview(false); setFinished(false); setQuestion(0); setAnswers(Array(11).fill("")); setView("Evaluaciones"); };
  const questions = evaluationQuestions[evalType];

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">✦</span><span>Fisio<span>EnCasa</span></span></div><p className="side-label">OPERACIÓN PRIVADA</p>{nav.map((name) => <button key={name} onClick={() => { setView(name); setInterview(false); }} className={view === name ? "nav active" : "nav"}><span>{name === "Inicio" ? "⌂" : name === "Pacientes" ? "♧" : name === "Agenda" ? "▣" : "◌"}</span>{name}</button>)}<div className="side-bottom"><Link className="nav" style={{ textDecoration: "none" }} href="/set-password"><span>⚙</span>Contraseña y seguridad</Link><button className="nav" onClick={() => { void fetch("/auth/signout", { method: "POST" }).finally(() => window.location.assign("/sign-in")); }}><span>↗</span>Cerrar sesión</button><div className="profile"><span className="avatar tiny blue">JM</span><div><b>Espacio privado</b><small>Fisioterapeuta</small></div><span>●</span></div></div></aside>
    <section className="content"><header className="topbar"><button className="mobile-logo" onClick={() => setView("Inicio")}>✦</button><div className="crumb">{view === "Ficha" && selected ? <><button onClick={() => setView("Pacientes")}>Pacientes</button><span>/</span><b>{selected.name}</b></> : <b>{view}</b>}</div><div className="top-actions"><button className="icon-btn" aria-label="Buscar">⌕</button><button className="primary" onClick={() => setModalOpen(true)}>＋ <span>Nuevo paciente</span></button></div></header>
      {view === "Inicio" && <Dashboard patients={patients} appointments={appointments} onPatient={goPatient} onNew={() => setModalOpen(true)} onAgenda={() => setView("Agenda")} />}
      {view === "Pacientes" && <Patients list={visiblePatients} total={patients.length} loading={loading} error={error} query={query} setQuery={setQuery} onPatient={goPatient} onNew={() => setModalOpen(true)} onRetry={() => void loadWorkspace()} />}
      {view === "Ficha" && selected && <PatientFile patient={selected} appointment={appointments.find((item) => item.patientId === selected.id) || null} tab={tab} setTab={setTab} onSchedule={() => setAppointmentPatient(selected)} onEvaluate={() => openEvaluation(selected)} onEdit={() => setEditingPatient(selected)} onDelete={() => setDeletingPatient(selected)} />}
      {view === "Agenda" && <Agenda mode={agendaMode} setMode={setAgendaMode} appointments={appointments} patients={patients} onSchedule={setAppointmentPatient} />}
      {view === "Evaluaciones" && <Evaluation patient={selected} eligiblePatients={patients.filter((patient) => patient.scheduled > 0)} onChoose={openEvaluation} interview={interview} setInterview={setInterview} type={evalType} setType={setEvalType} question={question} setQuestion={setQuestion} questions={questions} finished={finished} setFinished={setFinished} answers={answers} setAnswers={setAnswers} />}
    </section>
    <nav className="bottom-nav">{nav.map((name) => <button key={name} className={view === name ? "active" : ""} onClick={() => setView(name)}><span>{name === "Inicio" ? "⌂" : name === "Pacientes" ? "♧" : name === "Agenda" ? "▣" : "◌"}</span>{name}</button>)}</nav>
    {modalOpen && <NewPatientModal onClose={() => setModalOpen(false)} onCreated={(record) => { const patient = toPatient(record); setPatients((current) => [patient, ...current]); setSelected(patient); setModalOpen(false); setView("Ficha"); }} />}
    {editingPatient && <EditPatientModal patient={editingPatient} onClose={() => setEditingPatient(null)} onUpdated={(record) => { const updated = toPatient(record); setPatients((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setEditingPatient(null); }} />}
    {deletingPatient && <DeletePatientModal patient={deletingPatient} onClose={() => setDeletingPatient(null)} onDeleted={() => { const id = deletingPatient.id; setPatients((current) => current.filter((item) => item.id !== id)); setAppointments((current) => current.filter((item) => item.patientId !== id)); setSelected(null); setDeletingPatient(null); setView("Pacientes"); }} />}
    {appointmentPatient && <AppointmentModal patient={appointmentPatient} onClose={() => setAppointmentPatient(null)} onCreated={(record) => { const appointment = toAppointment(record); setAppointments((current) => [...current, appointment].sort((a, b) => a.startsAt.localeCompare(b.startsAt))); setPatients((current) => current.map((patient) => patient.id === appointment.patientId ? { ...patient, scheduled: Math.min(patient.scheduled + 1, patient.plan) } : patient)); setSelected((current) => current?.id === appointment.patientId ? { ...current, scheduled: Math.min(current.scheduled + 1, current.plan) } : current); setAppointmentPatient(null); setTab("Resumen"); setView("Ficha"); }} />}
  </main>;
}

function Dashboard({ patients, appointments, onPatient, onNew, onAgenda }: { patients: Patient[]; appointments: Appointment[]; onPatient: (patient: Patient) => void; onNew: () => void; onAgenda: () => void }) {
  const followUps = patients.filter((patient) => patient.scheduled === 0).slice(0, 2);
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const todayAppointments = appointments.filter((item) => new Date(item.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === todayKey);
  return <div className="page"><div className="welcome"><div><p className="eyebrow">ESPACIO CLÍNICO PRIVADO</p><h1>Buen día <span>👋</span></h1><p>Los registros de pacientes están protegidos por tu sesión.</p></div><button className="primary" onClick={onNew}>＋ Registrar paciente</button></div><div className="stats"><Stat icon="♧" value={String(patients.length)} label="Pacientes activos" tone="purple"/><Stat icon="▣" value={String(todayAppointments.length)} label="Atenciones hoy" tone="blue"/><Stat icon="✓" value={String(appointments.length)} label="Sesiones agendadas" tone="mint"/><Stat icon="!" value={String(followUps.length)} label="Seguimientos pendientes" tone="peach"/></div><div className="two-cols"><section className="card agenda-card"><div className="section-head"><div><h2>Agenda de hoy</h2><p>Citas guardadas en tu agenda privada</p></div><button className="text-btn" onClick={onAgenda}>Ver agenda →</button></div>{todayAppointments.length ? todayAppointments.slice(0, 4).map((item) => <button className="appointment" key={item.id} onClick={onAgenda}><b>{formatTime(item.startsAt)}</b><span className="appt-line"/><div><strong>{item.patientName}</strong><small>{item.therapy} · Sesión {item.sessionNumber}</small></div><em className="pill">{item.status}</em></button>) : <div className="blank-panel"><span>▣</span><b>No hay atenciones programadas hoy</b><p>Abre la ficha de un paciente para agendar su primera sesión.</p><button className="new-appointment" onClick={onAgenda}>＋ Abrir agenda</button></div>}</section><section className="card follow-card"><div className="section-head"><div><h2>Necesitan seguimiento</h2><p>Pacientes sin próxima cita</p></div><button className="text-btn" onClick={onAgenda}>Ver agenda →</button></div>{followUps.length ? followUps.map((patient) => <button className="follow" key={patient.id} onClick={() => onPatient(patient)}><Avatar patient={patient}/><div><strong>{patient.name}</strong><small>Listo para agendar su primera sesión</small></div><span>›</span></button>) : <div className="empty-follow">Todos los pacientes tienen al menos una sesión agendada.</div>}<div className="tip"><span>✦</span><p><b>Flujo clínico</b><br/>La evaluación inicial se habilita después de agendar al paciente.</p></div></section></div></div>;
}
function Stat({ icon, value, label, tone }: { icon: string; value: string; label: string; tone: string }) { return <div className="stat card"><span className={`stat-icon ${tone}`}>{icon}</span><div><b>{value}</b><p>{label}</p></div></div>; }

function Patients({ list, total, loading, error, query, setQuery, onPatient, onNew, onRetry }: { list: Patient[]; total: number; loading: boolean; error: string; query: string; setQuery: (value: string) => void; onPatient: (patient: Patient) => void; onNew: () => void; onRetry: () => void }) {
  return <div className="page"><div className="title-row"><div><p className="eyebrow">GESTIÓN CLÍNICA PRIVADA</p><h1>Pacientes</h1><p>Administra únicamente los pacientes registrados en tu cuenta.</p></div><button className="primary" onClick={onNew}>＋ Nuevo paciente</button></div><div className="toolbar"><label className="search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, diagnóstico..."/></label><button className="filter">♙ Datos protegidos</button></div>{error && <div className="inline-error"><b>Error al cargar.</b><span>{error}</span><button onClick={onRetry}>Reintentar</button></div>}<div className="patient-table card"><div className="table-head"><span>Paciente</span><span>Tratamiento</span><span>Próxima sesión</span><span>Progreso</span><span></span></div>{loading ? <div className="empty-table">Cargando registros privados…</div> : list.length ? list.map((patient) => <button className="patient-row" onClick={() => onPatient(patient)} key={patient.id}><div className="patient-name"><Avatar patient={patient}/><span><strong>{patient.name}</strong><small>{patient.age === null ? "Edad no registrada" : `${patient.age} años`} · {patient.therapy}</small></span></div><div><strong>{patient.diagnosis}</strong><small>{patient.frequency}</small></div><div><strong>{patient.scheduled ? "Cita programada" : "Sin próxima cita"}</strong><small>{patient.district}</small></div><div className="row-progress"><b>{patient.progress}%</b><Progress value={patient.progress}/></div><span className="chevron">›</span></button>) : <div className="empty-table"><span>♧</span><b>Aún no hay pacientes registrados</b><p>Usa “Nuevo paciente” para crear el primer registro real.</p><button className="primary" onClick={onNew}>＋ Registrar paciente</button></div>}</div><p className="table-count">{loading ? "" : `Mostrando ${list.length} de ${total} pacientes registrados`}</p></div>;
}

function PatientFile({ patient, appointment, tab, setTab, onSchedule, onEvaluate, onEdit, onDelete }: { patient: Patient; appointment: Appointment | null; tab: string; setTab: (value: string) => void; onSchedule: () => void; onEvaluate: () => void; onEdit: () => void; onDelete: () => void }) {
  const tabs = ["Resumen", "Evaluación inicial", "Sesiones", "Evolución", "Progreso"];
  const evaluationEnabled = patient.scheduled > 0;
  return <div className="page"><div className="file-header"><Avatar patient={patient}/><div><p className="eyebrow">REGISTRO PRIVADO</p><h1>{patient.name}</h1><p>{patient.age === null ? "Edad no registrada" : `${patient.age} años`} · {patient.therapy}</p></div><div className="file-header-actions"><button className="secondary" onClick={onEdit}>✎ Editar</button>{evaluationEnabled ? <button className="primary file-action" onClick={onEvaluate}>◌ Iniciar evaluación</button> : <button className="primary file-action" onClick={onSchedule}>＋ Agendar primera sesión</button>}</div></div><div className="workflow-steps"><span className="done">✓ Paciente registrado</span><span className={evaluationEnabled ? "done" : "current"}>{evaluationEnabled ? "✓ Sesión agendada" : "2 Agendar sesión"}</span><span className={evaluationEnabled ? "current" : "locked"}>{evaluationEnabled ? "3 Evaluación habilitada" : "🔒 Evaluación"}</span></div><div className="tabs">{tabs.map((name) => { const locked = name === "Evaluación inicial" && !evaluationEnabled; return <button disabled={locked} title={locked ? "Agenda primero una sesión" : undefined} onClick={() => locked ? undefined : name === "Evaluación inicial" ? onEvaluate() : setTab(name)} className={`${tab === name ? "selected" : ""}${locked ? " locked" : ""}`} key={name}>{locked ? "🔒 " : ""}{name}</button>; })}</div>{tab === "Resumen" ? <><div className="file-grid"><section className="card info"><h2>Resumen clínico</h2><dl><div><dt>Diagnóstico referido</dt><dd>{patient.diagnosis}</dd></div><div><dt>Zona de atención</dt><dd>{patient.district}</dd></div><div><dt>Dirección</dt><dd>{patient.address}</dd></div><div><dt>Frecuencia acordada</dt><dd>{patient.frequency}</dd></div></dl></section><section className="card plan"><h2>Plan de sesiones</h2><div className="big-progress"><b>{patient.done}<small> / {patient.plan}</small></b><span>sesiones realizadas</span><Progress value={patient.plan ? (patient.done / patient.plan) * 100 : 0}/></div><div className="plan-breakdown"><span><b>{patient.done}</b>Realizadas</span><span><b>{patient.scheduled}</b>Agendadas</span><span><b>{Math.max(patient.plan - patient.done - patient.scheduled, 0)}</b>Pendientes</span></div><div className="next-session"><span>▣</span><p><small>PRÓXIMA SESIÓN</small><b>{appointment ? formatAppointmentDate(appointment.startsAt) : "Sin próxima cita"}</b><em>{appointment ? `${appointment.duration} minutos · ${appointment.district}` : "Agenda la primera sesión para habilitar la evaluación."}</em></p></div>{!appointment && <button className="schedule-inline" onClick={onSchedule}>＋ Agendar ahora</button>}</section></div><section className="card evolution-preview"><div className="section-head"><div><h2>Evaluación inicial</h2><p>{evaluationEnabled ? "Ya puedes comenzar la entrevista guiada" : "Pendiente de agendamiento"}</p></div>{evaluationEnabled && <button className="text-btn" onClick={onEvaluate}>Comenzar →</button>}</div><p>{evaluationEnabled ? "La evaluación quedará como borrador pendiente de validación profesional." : "Por orden operativo, primero programa la atención y luego realiza la evaluación clínica."}</p></section><PatientPortalAccess patient={patient}/><button className="danger-text" onClick={onDelete}>Eliminar paciente</button></> : <PendingCard title={tab} patient={patient}/> }</div>;
}

type PortalAccessStatus = {
  linked: boolean;
  enabled: boolean;
  email: string | null;
  summaryPublished?: boolean;
  message?: string;
};

function PatientPortalAccess({ patient }: { patient: Patient }) {
  const [status, setStatus] = useState<PortalAccessStatus | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/patients/${encodeURIComponent(patient.id)}/portal-access`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    void fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo consultar el acceso.");
        if (active) {
          const nextStatus = body as PortalAccessStatus;
          setStatus(nextStatus);
          setEmail(nextStatus.email || "");
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "No se pudo consultar el acceso.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [endpoint]);

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo enviar la invitación.");
      const nextStatus = body as PortalAccessStatus;
      setStatus(nextStatus);
      setEmail(nextStatus.email || email);
      setMessage(nextStatus.message || "Acceso actualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo desactivar el acceso.");
      const nextStatus = body as PortalAccessStatus;
      setStatus(nextStatus);
      setMessage(nextStatus.message || "Acceso desactivado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo desactivar el acceso.");
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="card portal-access-card">
    <div className="portal-access-heading"><span aria-hidden="true">⌾</span><div><p className="eyebrow">PORTAL DE SOLO LECTURA</p><h2>Acceso del paciente</h2></div>{status?.linked && <em className={status.enabled ? "portal-status active" : "portal-status"}>{status.enabled ? "Activo" : "Desactivado"}</em>}</div>
    <p className="portal-access-copy">El paciente verá únicamente su resumen publicado, próxima sesión, progreso y actividades indicadas. Nunca verá diagnósticos, dirección ni notas clínicas internas.</p>
    {loading ? <p className="portal-loading">Consultando acceso…</p> : <>
      {status?.linked && <div className="portal-linked"><small>CORREO VINCULADO</small><b>{status.email || "Correo no disponible"}</b><span>{status.enabled ? "El paciente puede ingresar o restablecer su contraseña desde la pantalla de acceso." : "El resumen no está visible hasta reactivar este acceso."}</span></div>}
      {(!status?.linked || !status.enabled) && <form className="portal-invite-form" onSubmit={invite}>
        <label>Correo electrónico del paciente<input type="email" autoComplete="email" required maxLength={254} value={email} readOnly={Boolean(status?.linked)} onChange={(event) => setEmail(event.target.value)} placeholder="paciente@correo.com" /></label>
        <button className="primary" type="submit" disabled={submitting || !email}>{submitting ? "Procesando…" : status?.linked ? "Reactivar acceso" : "Enviar invitación"}</button>
      </form>}
      {status?.linked && status.enabled && <button className="portal-revoke" type="button" disabled={submitting} onClick={() => void revoke()}>{submitting ? "Procesando…" : "Desactivar acceso"}</button>}
    </>}
    {message && <p className="portal-access-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="portal-dni-note"><b>No se usa el DNI para iniciar sesión.</b> El acceso se protege con un correo personal y una contraseña creada por el paciente.</p>
  </section>;
}

function PendingCard({ title, patient }: { title: string; patient: Patient }) { return <><section className="card evaluation-card"><span className="file-icon">◌</span><h2>{title}</h2><p>{title === "Evolución" || title === "Progreso" ? "El progreso se registra al completar las sesiones clínicas." : "Esta sección se habilitará después del registro inicial."}</p></section>{(title === "Evolución" || title === "Progreso") && <section className="card progress-card"><p className="disclaimer">El progreso representa metas funcionales individuales y no garantiza recuperación.</p>{["Equilibrio", "Marcha", "Transferencias", "Coordinación", "Independencia funcional"].map((name) => <div className="goal" key={name}><span>{name}</span><Progress value={patient.progress}/><b>{patient.progress}%</b></div>)}</section>}</>; }

function Agenda({ mode, setMode, appointments, patients, onSchedule }: { mode: "Día" | "Semana"; setMode: (value: "Día" | "Semana") => void; appointments: Appointment[]; patients: Patient[]; onSchedule: (patient: Patient) => void }) {
  const [patientId, setPatientId] = useState("");
  const schedule = () => { const patient = patients.find((item) => item.id === patientId) || patients[0]; if (patient) onSchedule(patient); };
  return <div className="page"><div className="title-row"><div><p className="eyebrow">PROGRAMACIÓN REAL</p><h1>Agenda</h1><p>Las citas se guardan en tu cuenta y el sistema evita cruces de horario.</p></div></div><div className="agenda-booking"><label>Paciente<select value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Selecciona un paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label><button className="primary" disabled={!patients.length || !patientId} onClick={schedule}>＋ Agendar sesión</button></div><div className="agenda-controls"><div className="segmented"><button className={mode === "Día" ? "on" : ""} onClick={() => setMode("Día")}>Próximas</button><button className={mode === "Semana" ? "on" : ""} onClick={() => setMode("Semana")}>Semana</button></div><span className="agenda-count">{appointments.length} {appointments.length === 1 ? "cita activa" : "citas activas"}</span></div><section className="card real-agenda">{appointments.length ? appointments.map((item) => <article className="real-appointment" key={item.id}><div className="appointment-date"><b>{formatTime(item.startsAt)}</b><small>{new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" }).format(new Date(item.startsAt))}</small></div><div><h3>{item.patientName}</h3><p>{item.therapy} · Sesión {item.sessionNumber} · {item.duration} min</p><small>{item.district} · {item.address}</small></div><em className="pill">{item.status}</em></article>) : <div className="agenda-empty"><span>▣</span><h2>Aún no hay sesiones agendadas</h2><p>Selecciona un paciente arriba para programar su primera atención.</p></div>}</section><section className="card agenda-notice"><span>✓</span><p><b>Evaluación por orden clínico</b><br/>Al guardar la primera cita, la evaluación inicial de ese paciente se habilita automáticamente.</p></section></div>;
}

function Evaluation({ patient, eligiblePatients, onChoose, interview, setInterview, type, setType, question, setQuestion, questions, finished, setFinished, answers, setAnswers }: { patient: Patient | null; eligiblePatients: Patient[]; onChoose: (patient: Patient) => void; interview: boolean; setInterview: (value: boolean) => void; type: Therapy; setType: (value: Therapy) => void; question: number; setQuestion: (value: number) => void; questions: string[]; finished: boolean; setFinished: (value: boolean) => void; answers: string[]; setAnswers: (value: string[]) => void }) {
  const updateAnswer = (value: string) => setAnswers(answers.map((answer, index) => index === question ? value : answer));
  const chooseType = (value: Therapy) => { setType(value); setQuestion(0); setAnswers(Array(11).fill("")); };

  if (!patient || patient.scheduled === 0) return <div className="page eval-start"><p className="eyebrow">EVALUACIÓN INICIAL</p><h1>Selecciona un paciente agendado</h1><p>Solo se habilitan pacientes que ya tienen al menos una sesión programada.</p>{eligiblePatients.length ? <div className="eligible-patients">{eligiblePatients.map((item) => <button className="card" key={item.id} onClick={() => onChoose(item)}><Avatar patient={item}/><span><b>{item.name}</b><small>{item.therapy} · {item.scheduled} sesión agendada</small></span><em>Evaluar →</em></button>)}</div> : <section className="card evaluation-locked"><span>🔒</span><h2>No hay pacientes habilitados</h2><p>Registra un paciente y agenda su primera sesión para comenzar la evaluación.</p></section>}</div>;
  if (!interview) return <div className="page eval-start"><p className="eyebrow">EVALUACIÓN INICIAL · {patient.name.toUpperCase()}</p><h1>Entrevista guiada</h1><p>Selecciona la modalidad antes de comenzar. Cada evaluación contiene 10 preguntas clínicas y una observación opcional.</p><div className="eval-options"><button className={type === "Física / Deportiva" ? "chosen" : ""} onClick={() => chooseType("Física / Deportiva")}><span>♧</span><b>Física / Deportiva</b><small>Lesión, dolor, limitaciones y retorno a la actividad.</small></button><button className={type === "Neurológica" ? "chosen" : ""} onClick={() => chooseType("Neurológica")}><span>◌</span><b>Neurológica</b><small>Evento neurológico, movilidad, equilibrio e independencia.</small></button></div><button className="primary large" onClick={() => { setInterview(true); setQuestion(0); setFinished(false); }}>Comenzar evaluación →</button><p className="simulation-note">Las respuestas permanecen como borrador local; la grabación y la transcripción continúan simuladas.</p></div>;
  if (finished) return <div className="page draft"><span className="draft-icon">✓</span><p className="eyebrow">EVALUACIÓN FINALIZADA</p><h1>Borrador de ficha listo</h1><p>Organizado a partir de la entrevista. Debe revisarse y validarse profesionalmente antes de incorporarlo a la ficha clínica.</p><section className="card draft-answers"><h2>Evaluación · {type}</h2>{questions.slice(0, 10).map((item, index) => <div className="draft-answer" key={item}><b>{index + 1}. {item}</b><p>{answers[index] || "Sin respuesta registrada"}</p></div>)}<div className="draft-observations"><b>Observaciones o notas adicionales</b><p>{answers[10] || "Sin observaciones adicionales"}</p></div><em className="pill orange">Pendiente de validación profesional</em></section><button className="primary large" onClick={() => { setInterview(false); setFinished(false); }}>Nueva evaluación</button></div>;
  const optional = question === 10;
  return <div className="page interview"><div className="interview-top"><button className="back" onClick={() => setInterview(false)}>← Salir</button><span>{type}</span><b>{question + 1} de {questions.length}</b></div><Progress value={((question + 1) / questions.length) * 100}/><p className="eyebrow">PREGUNTA {question + 1} {optional && <strong className="optional-tag">OPCIONAL</strong>}</p><h1>{questions[question]}{optional && <small className="optional-copy">Registra cualquier información relevante no incluida anteriormente.</small>}</h1><div className="recording"><button className="mic" aria-label="Simular grabación" onClick={() => updateAnswer(answers[question] || "Respuesta obtenida mediante transcripción simulada.")}>●</button><div><b>Grabación simulada</b><small>Presiona el micrófono para simular una transcripción</small></div><span>00:00</span></div><label className="transcript"><span>RESPUESTA / TRANSCRIPCIÓN SIMULADA</span><textarea value={answers[question]} onChange={(event) => updateAnswer(event.target.value)} placeholder={optional ? "Escribe observaciones o notas adicionales (opcional)…" : "Escribe la respuesta o utiliza la grabación simulada…"}/></label><div className="interview-actions"><button className="secondary" disabled={!question} onClick={() => setQuestion(question - 1)}>← Anterior</button><button className="secondary" onClick={() => { updateAnswer("No aplica"); if (question < questions.length - 1) setQuestion(question + 1); }}>No aplica</button><button className="primary" onClick={() => question === questions.length - 1 ? setFinished(true) : setQuestion(question + 1)}>{question === questions.length - 1 ? "Generar borrador de ficha" : "Siguiente →"}</button></div></div>;
}

function defaultAppointmentValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AppointmentModal({ patient, onClose, onCreated }: { patient: Patient; onClose: () => void; onCreated: (record: AppointmentRecord) => void }) {
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("60");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setStartsAt(defaultAppointmentValue()); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const parsedStart = new Date(startsAt);
      if (Number.isNaN(parsedStart.getTime())) throw new Error("Selecciona una fecha y hora válidas.");
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patient_id: patient.id, starts_at: parsedStart.toISOString(), duration_minutes: Number(duration) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la cita.");
      onCreated(body.appointment as AppointmentRecord);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la cita."); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop" role="presentation"><section className="patient-modal appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title"><div className="modal-head"><div><p className="eyebrow">AGENDA PRIVADA</p><h2 id="appointment-title">Agendar a {patient.name}</h2></div><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button></div><div className="appointment-patient"><Avatar patient={patient}/><div><b>{patient.therapy}</b><small>{patient.district} · {patient.address}</small></div></div><form onSubmit={submit} className="patient-form"><label>Fecha y hora<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)}/></label><label>Duración estimada<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="45">45 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option><option value="120">120 minutos</option></select></label><p className="appointment-rule">Al guardar esta primera cita se habilitará automáticamente la evaluación inicial del paciente. Si el horario se cruza con otra sesión, la app lo rechazará.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving || !startsAt}>{saving ? "Guardando…" : "Guardar cita y habilitar evaluación"}</button></div></form></section></div>;
}

function EditPatientModal({ patient, onClose, onUpdated }: { patient: Patient; onClose: () => void; onUpdated: (record: PatientRecord) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar los cambios.");
      onUpdated(body.patient as PatientRecord);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios."); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation"><section className="patient-modal" role="dialog" aria-modal="true" aria-labelledby="edit-patient-title"><div className="modal-head"><div><p className="eyebrow">RESUMEN CLÍNICO</p><h2 id="edit-patient-title">Editar paciente</h2></div><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button></div><p className="privacy-copy">Modifica únicamente los datos necesarios del registro de {patient.name}.</p><form onSubmit={submit} className="patient-form"><label>Nombre completo<input name="full_name" required autoComplete="off" maxLength={120} defaultValue={patient.name}/></label><div className="form-grid"><label>Fecha de nacimiento<input name="birth_date" type="date" defaultValue={patient.birthDate || ""}/></label><label>Tipo de terapia<select name="therapy_type" defaultValue={patient.therapy}><option>Neurológica</option><option>Física / Deportiva</option></select></label></div><label>Diagnóstico médico referido <span>opcional</span><textarea name="diagnosis" maxLength={500} rows={3} defaultValue={patient.diagnosis === "Diagnóstico pendiente de registrar" ? "" : patient.diagnosis}/></label><div className="form-grid"><label>Frecuencia semanal<select name="session_frequency" defaultValue={patient.frequency}><option>1/semana</option><option>2/semana</option><option>3/semana</option><option>Según evolución</option></select></label><label>Plan de sesiones<input name="plan_sessions" type="number" min="1" max="100" defaultValue={patient.plan} required/></label></div><div className="form-grid"><label>Distrito <span>opcional</span><input name="district" maxLength={100} defaultValue={patient.district === "No registrado" ? "" : patient.district}/></label><label>Dirección <span>opcional</span><input name="address" maxLength={250} defaultValue={patient.address === "No registrada" ? "" : patient.address}/></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div></form></section></div>;
}

function DeletePatientModal({ patient, onClose, onDeleted }: { patient: Patient; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar el paciente.");
      onDeleted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo eliminar el paciente."); setDeleting(false); }
  };
  return <div className="modal-backdrop" role="presentation"><section className="patient-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-patient-title"><div className="modal-head"><div><p className="eyebrow">CONFIRMACIÓN NECESARIA</p><h2 id="delete-patient-title">Eliminar paciente</h2></div><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button></div><div className="delete-copy"><p>¿Deseas retirar a <b>{patient.name}</b> de tus pacientes activos?</p><p>Sus citas activas se cancelarán y su acceso al portal quedará deshabilitado. El registro se archivará de forma segura para conservar trazabilidad clínica.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="delete-actions"><button className="secondary" onClick={onClose} disabled={deleting}>Conservar paciente</button><button className="danger" onClick={() => void remove()} disabled={deleting}>{deleting ? "Eliminando…" : "Sí, eliminar paciente"}</button></div></section></div>;
}

function NewPatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (record: PatientRecord) => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(""); try { const response = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar el paciente."); onCreated(body.patient as PatientRecord); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el paciente."); } finally { setSaving(false); } };
  return <div className="modal-backdrop" role="presentation"><section className="patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-patient-title"><div className="modal-head"><div><p className="eyebrow">REGISTRO PROTEGIDO</p><h2 id="new-patient-title">Nuevo paciente</h2></div><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button></div><p className="privacy-copy">Registra solo la información necesaria para la atención. Este registro se guarda en tu cuenta privada y no se comparte con otros usuarios.</p><form onSubmit={submit} className="patient-form"><label>Nombre completo<input name="full_name" required autoComplete="off" maxLength={120} placeholder="Nombres y apellidos"/></label><div className="form-grid"><label>Fecha de nacimiento<input name="birth_date" type="date" max={new Date().toISOString().slice(0, 10)}/></label><label>Tipo de terapia<select name="therapy_type" defaultValue="Neurológica"><option>Neurológica</option><option>Física / Deportiva</option></select></label></div><label>Diagnóstico médico referido <span>opcional</span><textarea name="diagnosis" maxLength={500} rows={3} placeholder="Información clínica necesaria para la atención"/></label><div className="form-grid"><label>Frecuencia semanal<select name="session_frequency" defaultValue="2/semana"><option>1/semana</option><option>2/semana</option><option>3/semana</option><option>Según evolución</option></select></label><label>Plan de sesiones<input name="plan_sessions" type="number" min="1" max="100" defaultValue="12" required/></label></div><div className="form-grid"><label>Distrito <span>opcional</span><input name="district" autoComplete="off" maxLength={100}/></label><label>Dirección <span>opcional</span><input name="address" autoComplete="off" maxLength={250} placeholder="Solo si es necesaria para la visita"/></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar paciente"}</button></div></form></section></div>;
}

