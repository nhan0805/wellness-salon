import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@/src/server/db';
import { verifySecret } from '@/src/server/security';

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const secureCookies = process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_SECURE !== 'false';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: secureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: '/' },
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const user = await prisma.authUser.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user?.isActive) return null;
        const valid = await verifySecret(user.passwordHash, parsed.data.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: 'ADMIN' | 'STATION' }).role;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion;
      }
      if (token.sub) {
        const current = await prisma.authUser.findUnique({ where: { id: token.sub }, select: { role: true, isActive: true, sessionVersion: true } });
        if (!current?.isActive || (token.sessionVersion !== undefined && token.sessionVersion !== current.sessionVersion)) {
          token.invalid = true;
          token.role = undefined;
        } else {
          token.role = current.role;
          token.sessionVersion = current.sessionVersion;
          token.invalid = false;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        session.user.role = token.invalid ? undefined as never : token.role as 'ADMIN' | 'STATION';
      }
      return session;
    },
  },
  pages: { signIn: '/sign-in' },
});
