import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "../../lib/auth/access";

export const dynamic = "force-dynamic";

const patientColumns = "id, full_name, birth_date, therapy_type, diagnosis, session_frequency, plan_sessions, sessions_done, sessions_scheduled, progress, district, address";

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().max(maxLength).optional(),
  );

function isValidPastDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getTime() <= today.getTime();
}

const patientSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    birth_date: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || undefined : value),
      z.string().refine(isValidPastDate, "Fecha de nacimiento no válida.").optional(),
    ),
    therapy_type: z.enum(["Física / Deportiva", "Neurológica"]),
    diagnosis: optionalText(500),
    session_frequency: z.enum(["1/semana", "2/semana", "3/semana", "Según evolución"]),
    plan_sessions: z.coerce.number().int().min(1).max(100),
    district: optionalText(100),
    address: optionalText(250),
  })
  .strict();

function noStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function getClinicianContext() {
  const { supabase, userId, role } = await getAccessContext();
  return { supabase, ownerId: userId, isPhysiotherapist: role === "physio" };
}

export async function GET() {
  try {
    const { supabase, ownerId, isPhysiotherapist } = await getClinicianContext();
    if (!ownerId) return noStore({ error: "Tu sesión ha vencido. Inicia sesión nuevamente." }, 401);
    if (!isPhysiotherapist) return noStore({ error: "Esta función está disponible solo para fisioterapeutas." }, 403);

    const { data, error } = await supabase
      .from("patients")
      .select(patientColumns)
      .eq("owner_id", ownerId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) return noStore({ error: "No se pudieron cargar los pacientes." }, 500);
    return noStore({ patients: data ?? [] });
  } catch {
    return noStore({ error: "El registro privado no está disponible temporalmente." }, 503);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStore({ error: "Solicitud no permitida." }, 403);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return noStore({ error: "Formato de solicitud no válido." }, 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStore({ error: "Los datos del formulario no son válidos." }, 400);
  }

  const parsed = patientSchema.safeParse(input);
  if (!parsed.success) {
    return noStore({ error: "Revisa los campos obligatorios del formulario." }, 400);
  }

  try {
    const { supabase, ownerId, isPhysiotherapist } = await getClinicianContext();
    if (!ownerId) return noStore({ error: "Tu sesión ha vencido. Inicia sesión nuevamente." }, 401);
    if (!isPhysiotherapist) return noStore({ error: "Esta función está disponible solo para fisioterapeutas." }, 403);

    const { data, error } = await supabase
      .from("patients")
      .insert({ ...parsed.data, owner_id: ownerId })
      .select(patientColumns)
      .single();

    if (error || !data) return noStore({ error: "No se pudo guardar el paciente. Inténtalo otra vez." }, 500);
    return noStore({ patient: data }, 201);
  } catch {
    return noStore({ error: "El registro privado no está disponible temporalmente." }, 503);
  }
}

