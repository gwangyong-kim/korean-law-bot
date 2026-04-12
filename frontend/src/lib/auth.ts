import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      // 회사 도메인 제한
      if (ALLOWED_DOMAIN && profile?.hd !== ALLOWED_DOMAIN) {
        return false;
      }
      return true;
    },
  },
});
