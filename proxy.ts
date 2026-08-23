import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getPublicCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function proxy(request: NextRequest) {
  const isPublicRoute = request.nextUrl.pathname === "/sign-in" || request.nextUrl.pathname.startsWith("/auth/");
  const credentials = getPublicCredentials();
  if (!credentials) {
    return isPublicRoute ? NextResponse.next({ request }) : NextResponse.redirect(new URL("/sign-in", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(credentials.url, credentials.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (signedIn && request.nextUrl.pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

