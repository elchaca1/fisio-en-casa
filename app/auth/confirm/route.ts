import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getPublicCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function safeRedirect(request: NextRequest, pathname: string) {
  const url = new URL(pathname, request.url);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const typeValue = request.nextUrl.searchParams.get("type");
  const type: EmailOtpType | null = typeValue === "invite" || typeValue === "recovery" ? typeValue : null;
  const credentials = getPublicCredentials();

  if (!credentials || !tokenHash || !type) {
    return safeRedirect(request, "/sign-in?link=invalid");
  }

  let response = safeRedirect(request, "/set-password");
  const supabase = createServerClient(credentials.url, credentials.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = safeRedirect(request, "/set-password");
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return safeRedirect(request, "/sign-in?link=invalid");
  }

  return response;
}

