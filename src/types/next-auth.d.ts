import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: number;
      apiKey: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: number;
    apiKey: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: number;
    apiKey: string | null;
  }
}

