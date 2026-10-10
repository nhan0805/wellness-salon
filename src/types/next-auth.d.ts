import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User { role: 'ADMIN' | 'STATION'; }
  interface Session { user: { id?: string; email?: string | null; role: 'ADMIN' | 'STATION' }; }
}

declare module 'next-auth/jwt' {
  interface JWT { role?: 'ADMIN' | 'STATION'; }
}
