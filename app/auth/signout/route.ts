import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function getPublicCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
  const credentials = getPublicCredentials();
  if (!credentials) return response;

  const supabase = createServerClient(credentials.url, credentials.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  await supabase.auth.signOut();
  return response;
}

