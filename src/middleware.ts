import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  const path = request.nextUrl.pathname;
  
  // Debug logging
  console.log("Middleware:", path, "Token:", token ? "exists" : "null", "Username:", token?.username);

  // Protect dashboard - just check if logged in
  if (path.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    // Skip username check for now - let user access dashboard
  }

  // Protect profile - just check if logged in  
  if (path.startsWith("/profile")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
  }

  // Protect admin - check role
  if (path.startsWith("/admin")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    if (token.role !== 9) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Redirect logged-in users away from auth pages
  if (path.startsWith("/auth") && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/:path*", "/profile/:path*"],
};
