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
  const isProfilePage = request.nextUrl.pathname.startsWith("/profile");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  // Skip middleware for API routes (except checking)
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && token) {
    // If user has no username, redirect to profile
    if (!token.username) {
      return NextResponse.redirect(new URL("/profile", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protect profile page - require authentication
  if (isProfilePage && !token) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  // Protect dashboard routes
  if (isDashboardPage) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    // If user has no username, redirect to profile
    if (!token.username) {
      return NextResponse.redirect(new URL("/profile", request.url));
    }
  }

  // Protect admin routes - require role 9
  if (isAdminPage) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
    // If user has no username, redirect to profile first
    if (!token.username) {
      return NextResponse.redirect(new URL("/profile", request.url));
    }
    if (token.role !== 9) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/:path*", "/profile/:path*"],
};
