import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessContext } from "../../../../lib/auth/access";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

const patientIdSchema = z.string().uuid();
const inviteSchema = z.object({ email: z.string().trim().email().max(254) }).strict();

type OwnedPatient = {
  id: string;
  full_name: string;
  therapy_type: "Física / Deportiva" | "Neurológica";
  plan_sessions: number;
  sessions_done: number;
  sessions_scheduled: number;
  progress: number;
};

type AuthorizationResult =
  | { ok: true; patient: OwnedPatient; physioUserId: string }
  | { ok: false; response: NextResponse };

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

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

async function authorizePatient(rawPatientId: string): Promise<AuthorizationResult> {
  const parsedId = patientIdSchema.safeParse(rawPatientId);
  if (!parsedId.success) {
    return { ok: false, response: noStore({ error: "Paciente no válido." }, 400) };
  }

  const { supabase, userId, role } = await getAccessContext();
  if (!userId) {
    return { ok: false, response: noStore({ error: "Tu sesión ha vencido. Inicia sesión nuevamente." }, 401) };
  }
  if (role !== "physio") {
    return { ok: false, response: noStore({ error: "Esta función está disponible solo para fisioterapeutas." }, 403) };
  }

  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, therapy_type, plan_sessions, sessions_done, sessions_scheduled, progress")
    .eq("id", parsedId.data)
    .eq("owner_id", userId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    return { ok: false, response: noStore({ error: "No se pudo verificar la ficha del paciente." }, 503) };
  }
  if (!data) {
    return { ok: false, response: noStore({ error: "No se encontró ese paciente en tu cuenta." }, 404) };
  }

  return { ok: true, patient: data as OwnedPatient, physioUserId: userId };
}

async function loadAccount(patientId: string) {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("patient_portal_accounts")
    .select("patient_id, portal_user_id, enabled, linked_at")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) throw new Error("No se pudo consultar el acceso del portal.");
  return { admin, account };
}

async function publishSummary(patient: OwnedPatient, admin: ReturnType<typeof createAdminClient>) {
  const { error } = await admin.from("patient_portal_summaries").upsert(
    {
      patient_id: patient.id,
      display_name: patient.full_name,
      therapy_type: patient.therapy_type,
      plan_sessions: patient.plan_sessions,
      sessions_done: patient.sessions_done,
      sessions_scheduled: patient.sessions_scheduled,
      progress_percent: patient.progress,
      is_published: true,
    },
    { onConflict: "patient_id" },
  );

  if (error) throw new Error("No se pudo publicar el resumen del portal.");
}

async function accountResponse(patientId: string) {
  const { admin, account } = await loadAccount(patientId);
  if (!account) return { linked: false, enabled: false, email: null, summaryPublished: false };

  const [userResult, summaryResult] = await Promise.all([
    admin.auth.admin.getUserById(account.portal_user_id),
    admin.from("patient_portal_summaries").select("is_published").eq("patient_id", patientId).maybeSingle(),
  ]);

  if (summaryResult.error) throw new Error("No se pudo consultar el resumen del portal.");

  return {
    linked: true,
    enabled: Boolean(account.enabled),
    email: userResult.error ? null : userResult.data.user?.email ?? null,
    linkedAt: account.linked_at,
    summaryPublished: Boolean(summaryResult.data?.is_published),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authorization = await authorizePatient(id);
    if (!authorization.ok) return authorization.response;
    return noStore(await accountResponse(authorization.patient.id));
  } catch {
    return noStore({ error: "El acceso del paciente no está disponible temporalmente." }, 503);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStore({ error: "Solicitud no permitida." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return noStore({ error: "Formato de solicitud no válido." }, 415);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStore({ error: "Los datos de la invitación no son válidos." }, 400);
  }

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return noStore({ error: "Escribe un correo electrónico válido." }, 400);

  try {
    const { id } = await params;
    const authorization = await authorizePatient(id);
    if (!authorization.ok) return authorization.response;

    const email = normalizedEmail(parsed.data.email);
    const { admin, account } = await loadAccount(authorization.patient.id);

    if (account) {
      const { data, error } = await admin.auth.admin.getUserById(account.portal_user_id);
      const linkedEmail = data.user?.email ? normalizedEmail(data.user.email) : null;
      if (error || !linkedEmail) {
        return noStore({ error: "El vínculo existente necesita revisión antes de continuar." }, 409);
      }
      if (linkedEmail !== email) {
        return noStore({ error: "Este paciente ya está vinculado a otro correo. El cambio de cuenta requiere una revisión segura." }, 409);
      }

      await publishSummary(authorization.patient, admin);
      if (!account.enabled) {
        const { error: enableError } = await admin
          .from("patient_portal_accounts")
          .update({ enabled: true, linked_by: authorization.physioUserId })
          .eq("patient_id", authorization.patient.id)
          .eq("portal_user_id", account.portal_user_id);
        if (enableError) throw new Error("No se pudo reactivar el vínculo del portal.");
      }

      return noStore({
        ...(await accountResponse(authorization.patient.id)),
        message: account.enabled ? "El acceso ya estaba activo; el resumen fue actualizado." : "El acceso del paciente fue reactivado.",
        invitationSent: false,
      });
    }

    const redirectTo = new URL("/set-password", request.url).toString();
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: authorization.patient.full_name },
    });

    if (inviteError || !invitation.user) {
      const status = inviteError?.status === 429 ? 429 : inviteError?.status === 400 || inviteError?.status === 422 ? 409 : 503;
      const message = status === 429
        ? "Se alcanzó temporalmente el límite de correos. Espera unos minutos antes de intentarlo otra vez."
        : status === 409
          ? "Ese correo ya pertenece a una cuenta y no puede vincularse automáticamente. Revisa el acceso antes de continuar."
          : "No se pudo enviar la invitación en este momento.";
      return noStore({ error: message }, status);
    }

    const portalUserId = invitation.user.id;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", portalUserId)
      .maybeSingle();
    if (profileError) throw new Error("No se pudo verificar el perfil invitado.");
    if (profile && profile.role !== "patient") {
      return noStore({ error: "La cuenta indicada no puede usarse como portal de paciente." }, 409);
    }
    if (!profile) {
      const { error: insertProfileError } = await admin.from("profiles").insert({
        user_id: portalUserId,
        role: "patient",
        display_name: authorization.patient.full_name,
      });
      if (insertProfileError) throw new Error("No se pudo preparar el perfil del paciente.");
    } else {
      const { error: updateProfileError } = await admin
        .from("profiles")
        .update({ display_name: authorization.patient.full_name })
        .eq("user_id", portalUserId)
        .eq("role", "patient");
      if (updateProfileError) throw new Error("No se pudo preparar el perfil del paciente.");
    }

    const { error: linkError } = await admin.from("patient_portal_accounts").insert({
      patient_id: authorization.patient.id,
      portal_user_id: portalUserId,
      enabled: true,
      linked_by: authorization.physioUserId,
    });
    if (linkError) {
      return noStore({ error: "La cuenta fue creada, pero el vínculo necesita revisión antes de reenviar la invitación." }, 409);
    }

    await publishSummary(authorization.patient, admin);
    return noStore({
      ...(await accountResponse(authorization.patient.id)),
      message: "Invitación enviada. El paciente podrá crear su contraseña desde el correo recibido.",
      invitationSent: true,
    }, 201);
  } catch {
    return noStore({ error: "No se pudo completar la invitación de forma segura." }, 503);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStore({ error: "Solicitud no permitida." }, 403);

  try {
    const { id } = await params;
    const authorization = await authorizePatient(id);
    if (!authorization.ok) return authorization.response;
    const { admin, account } = await loadAccount(authorization.patient.id);
    if (!account) return noStore({ linked: false, enabled: false, message: "El paciente no tenía un acceso activo." });

    const { error: disableError } = await admin
      .from("patient_portal_accounts")
      .update({ enabled: false, linked_by: authorization.physioUserId })
      .eq("patient_id", authorization.patient.id)
      .eq("portal_user_id", account.portal_user_id);
    if (disableError) throw new Error("No se pudo desactivar el vínculo.");

    const { error: unpublishError } = await admin
      .from("patient_portal_summaries")
      .update({ is_published: false })
      .eq("patient_id", authorization.patient.id);
    if (unpublishError) throw new Error("No se pudo retirar el resumen publicado.");

    return noStore({
      ...(await accountResponse(authorization.patient.id)),
      message: "Acceso desactivado. La cuenta sigue existiendo, pero ya no puede ver el resumen.",
    });
  } catch {
    return noStore({ error: "No se pudo desactivar el acceso del paciente." }, 503);
  }
}

