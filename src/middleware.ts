import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ 
    req: request,
    secret: process.env.NEXTAUTH_SECRET 
  });

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isDashboardPage = request.nextUrl.pathname.startsWith("/dashboard");

  // Redirect authenticated users away from auth pages
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protect dashboard routes
  if (isDashboardPage && !token) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  // Protect admin routes - require role 9
  if (isAdminPage) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    if (token.role !== 9) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/:path*"],
};
