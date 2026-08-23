import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getPublicCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("La conexión segura no está configurada.");
  }

  return { url, key };
}

export function createClient() {
  const { url, key } = getPublicCredentials();
  return createBrowserClient(url, key);
}

export function createImplicitClient() {
  const { url, key } = getPublicCredentials();
  return createSupabaseClient(url, key, {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: true,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

