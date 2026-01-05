import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { prisma } from "./prisma";
import type { Adapter } from "next-auth/adapters";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Allow sign in
      console.log("SignIn callback - user:", user?.email);
      return true;
    },
    async redirect({ url, baseUrl }) {
      // After sign in, go to profile to set username (middleware will handle redirect)
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return `${baseUrl}/profile`;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // Fetch fresh user data from database to get username
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id as string },
          select: { role: true, username: true, apiKey: true },
        });
        token.id = user.id as string;
        token.role = dbUser?.role ?? 1;
        token.username = dbUser?.username ?? null;
        token.apiKey = dbUser?.apiKey ?? null;
      }
      // Handle session update (when user sets username)
      if (trigger === "update" && session) {
        token.username = session.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as number;
        session.user.username = token.username as string | null;
        session.user.apiKey = token.apiKey as string | null;
      }
      return session;
    },
  },
});
