import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "../../../lib/auth/access";
import { createAdminClient } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

const patientColumns = "id, full_name, birth_date, therapy_type, diagnosis, session_frequency, plan_sessions, sessions_done, sessions_scheduled, progress, district, address";
const optionalText = (maxLength: number) => z.preprocess((value) => typeof value === "string" ? value.trim() || undefined : value, z.string().max(maxLength).optional());
const patientSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  birth_date: z.preprocess((value) => typeof value === "string" ? value.trim() || undefined : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  therapy_type: z.enum(["Física / Deportiva", "Neurológica"]),
  diagnosis: optionalText(500),
  session_frequency: z.enum(["1/semana", "2/semana", "3/semana", "Según evolución"]),
  plan_sessions: z.coerce.number().int().min(1).max(100),
  district: optionalText(100),
  address: optionalText(250),
}).strict();

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

async function clinician() {
  const { supabase, userId, role } = await getAccessContext();
  return { supabase, userId, allowed: role === "physio" };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return response({ error: "Solicitud no permitida." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return response({ error: "Formato no válido." }, 415);
  const parsed = patientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Revisa los datos del paciente." }, 400);

  const { id } = await context.params;
  try {
    const { supabase, userId, allowed } = await clinician();
    if (!userId) return response({ error: "Tu sesión ha vencido." }, 401);
    if (!allowed) return response({ error: "Función disponible solo para fisioterapeutas." }, 403);
    const { data, error } = await supabase.from("patients").update(parsed.data).eq("id", id).eq("owner_id", userId).is("archived_at", null).select(patientColumns).maybeSingle();
    if (error) return response({ error: "No se pudieron guardar los cambios." }, 500);
    if (!data) return response({ error: "No se encontró el paciente." }, 404);

    const admin = createAdminClient();
    await admin.from("patient_portal_summaries").update({ display_name: data.full_name, therapy_type: data.therapy_type, plan_sessions: data.plan_sessions }).eq("patient_id", id);
    return response({ patient: data });
  } catch {
    return response({ error: "No se pudo actualizar el registro." }, 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return response({ error: "Solicitud no permitida." }, 403);
  const { id } = await context.params;
  try {
    const { supabase, userId, allowed } = await clinician();
    if (!userId) return response({ error: "Tu sesión ha vencido." }, 401);
    if (!allowed) return response({ error: "Función disponible solo para fisioterapeutas." }, 403);
    const archivedAt = new Date().toISOString();
    const { data, error } = await supabase.from("patients").update({ archived_at: archivedAt }).eq("id", id).eq("owner_id", userId).is("archived_at", null).select("id").maybeSingle();
    if (error) return response({ error: "No se pudo eliminar el paciente." }, 500);
    if (!data) return response({ error: "No se encontró el paciente." }, 404);

    await supabase.from("appointments").update({ status: "Cancelada" }).eq("patient_id", id).eq("owner_id", userId).in("status", ["Programada", "Reprogramar"]);
    const admin = createAdminClient();
    await Promise.all([
      admin.from("patient_portal_accounts").update({ enabled: false }).eq("patient_id", id),
      admin.from("patient_portal_summaries").update({ is_published: false, published_at: null }).eq("patient_id", id),
    ]);
    return response({ deleted: true });
  } catch {
    return response({ error: "No se pudo eliminar el registro." }, 503);
  }
}

