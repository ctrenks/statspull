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
      from: "Stats Fetch <noreply@statsfetch.com>",
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: number }).role;
        token.username = (user as { username: string | null }).username;
        token.apiKey = (user as { apiKey: string | null }).apiKey;
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
