import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "../../lib/auth/access";

export const dynamic = "force-dynamic";

const columns = "id, patient_id, therapy_type, responses, status, created_at, updated_at";
const evaluationSchema = z.object({
  patient_id: z.string().uuid(),
  therapy_type: z.enum(["Física / Deportiva", "Neurológica"]),
  responses: z.array(z.string().trim().max(4000)).length(11),
}).strict();

function noStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function clinician() {
  const { supabase, userId, role } = await getAccessContext();
  return { supabase, userId, allowed: role === "physio" };
}

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patient_id");
  if (!patientId || !z.string().uuid().safeParse(patientId).success) return noStore({ error: "Paciente no válido." }, 400);
  try {
    const { supabase, userId, allowed } = await clinician();
    if (!userId) return noStore({ error: "Tu sesión ha vencido." }, 401);
    if (!allowed) return noStore({ error: "Función disponible solo para fisioterapeutas." }, 403);
    const { data, error } = await supabase.from("initial_evaluations").select(columns).eq("patient_id", patientId).eq("owner_id", userId).maybeSingle();
    if (error) return noStore({ error: "No se pudo cargar la evaluación." }, 500);
    return noStore({ evaluation: data ?? null });
  } catch {
    return noStore({ error: "Las evaluaciones no están disponibles temporalmente." }, 503);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return noStore({ error: "Solicitud no permitida." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return noStore({ error: "Formato no válido." }, 415);
  const parsed = evaluationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStore({ error: "Revisa las respuestas de la evaluación." }, 400);

  try {
    const { supabase, userId, allowed } = await clinician();
    if (!userId) return noStore({ error: "Tu sesión ha vencido." }, 401);
    if (!allowed) return noStore({ error: "Función disponible solo para fisioterapeutas." }, 403);
    const { data: patient } = await supabase.from("patients").select("id, sessions_scheduled").eq("id", parsed.data.patient_id).eq("owner_id", userId).is("archived_at", null).maybeSingle();
    if (!patient) return noStore({ error: "No se encontró ese paciente." }, 404);
    if (patient.sessions_scheduled < 1) return noStore({ error: "Agenda primero una sesión para habilitar la evaluación." }, 409);

    const { data, error } = await supabase.from("initial_evaluations").upsert({ ...parsed.data, owner_id: userId, status: "Borrador" }, { onConflict: "patient_id" }).select(columns).single();
    if (error || !data) return noStore({ error: "No se pudo guardar la evaluación." }, 500);
    return noStore({ evaluation: data });
  } catch {
    return noStore({ error: "No se pudo guardar la evaluación de forma segura." }, 503);
  }
}

