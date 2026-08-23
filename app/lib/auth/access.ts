import { createClient } from "../supabase/server";

export type AppRole = "physio" | "patient";

function isAppRole(value: unknown): value is AppRole {
  return value === "physio" || value === "patient";
}

export async function getAccessContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (!userId) {
    return { supabase, userId: null, role: null, fullName: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    supabase,
    userId,
    role: isAppRole(profile?.role) ? profile.role : null,
    fullName: typeof profile?.display_name === "string" ? profile.display_name : null,
  };
}

