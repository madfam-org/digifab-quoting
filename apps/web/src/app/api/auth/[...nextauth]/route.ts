/**
 * NextAuth API route handler.
 *
 * All configuration lives in @/lib/auth.ts (Janua OIDC provider).
 * This file re-exports the GET/POST handlers for the App Router.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
