import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "../../lib/auth/access";

export const dynamic = "force-dynamic";

const appointmentColumns = "id, patient_id, starts_at, ends_at, duration_minutes, session_number, status, patients!inner(full_name, therapy_type, district, address)";

const appointmentSchema = z.object({
  patient_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  duration_minutes: z.coerce.number().int().min(30).max(240),
}).strict();

function noStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

async function clinicianContext() {
  const { supabase, userId, role } = await getAccessContext();
  return { supabase, userId, allowed: role === "physio" };
}

export async function GET() {
  try {
    const { supabase, userId, allowed } = await clinicianContext();
    if (!userId) return noStore({ error: "Tu sesión ha vencido. Inicia sesión nuevamente." }, 401);
    if (!allowed) return noStore({ error: "Esta función está disponible solo para fisioterapeutas." }, 403);

    const { data, error } = await supabase
      .from("appointments")
      .select(appointmentColumns)
      .eq("owner_id", userId)
      .in("status", ["Programada", "Reprogramar"])
      .order("starts_at", { ascending: true });

    if (error) return noStore({ error: "No se pudo cargar la agenda." }, 500);
    return noStore({ appointments: data ?? [] });
  } catch {
    return noStore({ error: "La agenda no está disponible temporalmente." }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStore({ error: "Solicitud no permitida." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return noStore({ error: "Formato de solicitud no válido." }, 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStore({ error: "Los datos de la cita no son válidos." }, 400);
  }

  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return noStore({ error: "Revisa la fecha, hora y duración de la cita." }, 400);

  const startsAt = new Date(parsed.data.starts_at);
  if (startsAt.getTime() < Date.now() - 60_000) {
    return noStore({ error: "La cita debe programarse para una fecha futura." }, 400);
  }
  const endsAt = new Date(startsAt.getTime() + parsed.data.duration_minutes * 60_000);

  try {
    const { supabase, userId, allowed } = await clinicianContext();
    if (!userId) return noStore({ error: "Tu sesión ha vencido. Inicia sesión nuevamente." }, 401);
    if (!allowed) return noStore({ error: "Esta función está disponible solo para fisioterapeutas." }, 403);

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("id", parsed.data.patient_id)
      .eq("owner_id", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (patientError) return noStore({ error: "No se pudo verificar el paciente." }, 503);
    if (!patient) return noStore({ error: "No se encontró ese paciente en tu cuenta." }, 404);

    const { data: conflict, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("owner_id", userId)
      .in("status", ["Programada", "Reprogramar"])
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .limit(1)
      .maybeSingle();
    if (conflictError) return noStore({ error: "No se pudo verificar la disponibilidad del horario." }, 503);
    if (conflict) return noStore({ error: "Ese horario se cruza con otra sesión de tu agenda." }, 409);

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        owner_id: userId,
        patient_id: parsed.data.patient_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        duration_minutes: parsed.data.duration_minutes,
      })
      .select(appointmentColumns)
      .single();

    if (error || !data) {
      const overlaps = error?.code === "23P01";
      return noStore({ error: overlaps ? "Ese horario se cruza con otra sesión de tu agenda." : "No se pudo guardar la cita." }, overlaps ? 409 : 500);
    }

    return noStore({ appointment: data }, 201);
  } catch {
    return noStore({ error: "No se pudo registrar la cita de forma segura." }, 503);
  }
}

