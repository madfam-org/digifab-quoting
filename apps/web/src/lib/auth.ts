/**
 * NextAuth configuration for Cotiza Studio.
 *
 * Auth is handled by Janua (MADFAM's OIDC identity platform) via the
 * standard OpenID Connect Authorization Code flow with PKCE.
 *
 * Required env vars:
 *   JANUA_ISSUER          - e.g. https://auth.madfam.io
 *   JANUA_CLIENT_ID       - OAuth client ID registered in Janua
 *   JANUA_CLIENT_SECRET   - OAuth client secret
 *   NEXTAUTH_SECRET       - NextAuth encryption secret
 *   NEXTAUTH_URL          - Canonical app URL (for callback)
 */

import { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';

const JANUA_ISSUER = process.env.JANUA_ISSUER || 'https://auth.madfam.io';

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'janua',
      name: 'Janua',
      type: 'oauth',
      wellKnown: `${JANUA_ISSUER}/.well-known/openid-configuration`,
      clientId: process.env.JANUA_CLIENT_ID,
      clientSecret: process.env.JANUA_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid profile email',
          response_type: 'code',
          code_challenge_method: 'S256',
        },
      },
      checks: ['pkce', 'state'],
      idToken: true,
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name || `${profile.given_name ?? ''} ${profile.family_name ?? ''}`.trim(),
          image: profile.picture ?? null,
          role: profile.role ?? profile['cotiza:role'] ?? 'customer',
          tenantId: profile.tenant_id ?? profile['cotiza:tenant_id'] ?? 'default',
        };
      },
    },
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/auth/login',
    // Reuse the login page for error display — it already reads
    // ?error=<code> from the query string and renders an Alert.
    // Avoids the 404 that next-auth's default '/auth/error' redirect
    // produces when no dedicated error page exists.
    error: '/auth/login',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign-in: persist Janua tokens and profile claims
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token ?? '',
          refreshToken: account.refresh_token ?? '',
          idToken: account.id_token ?? '',
          accessTokenExpiresAt: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
          id: user.id,
          email: user.email ?? token.email,
          name: user.name ?? token.name,
          role: (user as any).role ?? 'customer',
          tenantId: (user as any).tenantId ?? 'default',
        };
      }

      // Return existing token if the access token has not expired
      if (Date.now() < (token.accessTokenExpiresAt as number ?? 0)) {
        return token;
      }

      // Access token expired -- attempt refresh via Janua token endpoint
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = (token.id ?? token.sub) as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
        session.accessToken = token.accessToken as string;
        session.error = token.error as string | undefined;
      }
      return session;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Refresh the Janua access token using the refresh_token grant.
 *
 * Falls back to the OIDC token endpoint discovered from the wellKnown URL,
 * or constructs it from the issuer if discovery is unavailable.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const refreshToken = token.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = `${JANUA_ISSUER}/oauth/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.JANUA_CLIENT_ID ?? '',
        client_secret: process.env.JANUA_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Janua token refresh failed (${response.status}): ${errorText}`);
    }

    const refreshed = await response.json();

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      idToken: refreshed.id_token ?? token.idToken,
      accessTokenExpiresAt: refreshed.expires_in
        ? Date.now() + refreshed.expires_in * 1000
        : Date.now() + 3600 * 1000,
      error: undefined,
    };
  } catch (error) {
    console.error('[cotiza/auth] Error refreshing Janua access token:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}
