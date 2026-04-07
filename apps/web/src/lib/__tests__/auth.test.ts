/**
 * Tests for the Janua OIDC auth configuration.
 *
 * We extract and exercise the NextAuth callbacks and the profile mapper
 * defined in authOptions without starting a real server or OAuth flow.
 */

// Set env vars before importing the module under test
process.env.JANUA_ISSUER = 'https://auth.madfam.io';
process.env.JANUA_CLIENT_ID = 'test-client-id';
process.env.JANUA_CLIENT_SECRET = 'test-client-secret';
process.env.NEXTAUTH_SECRET = 'test-secret';

import { authOptions } from '../auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the Janua provider config from authOptions */
function getProvider() {
  const provider = authOptions.providers[0] as any;
  expect(provider).toBeDefined();
  return provider;
}

function getJwtCallback() {
  return authOptions.callbacks!.jwt! as (params: any) => Promise<any>;
}

function getSessionCallback() {
  return authOptions.callbacks!.session! as (params: any) => Promise<any>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Janua OIDC authOptions', () => {
  // ---------- Provider configuration ----------

  describe('provider configuration', () => {
    it('should define a provider with id "janua"', () => {
      const provider = getProvider();
      expect(provider.id).toBe('janua');
    });

    it('should use type "oauth"', () => {
      expect(getProvider().type).toBe('oauth');
    });

    it('should point wellKnown to Janua issuer', () => {
      expect(getProvider().wellKnown).toBe(
        'https://auth.madfam.io/.well-known/openid-configuration',
      );
    });

    it('should request openid, profile, and email scopes', () => {
      const params = getProvider().authorization.params;
      expect(params.scope).toContain('openid');
      expect(params.scope).toContain('profile');
      expect(params.scope).toContain('email');
    });

    it('should use authorization code flow with PKCE', () => {
      const provider = getProvider();
      expect(provider.authorization.params.response_type).toBe('code');
      expect(provider.authorization.params.code_challenge_method).toBe('S256');
      expect(provider.checks).toContain('pkce');
      expect(provider.checks).toContain('state');
    });

    it('should request id_token', () => {
      expect(getProvider().idToken).toBe(true);
    });
  });

  // ---------- Profile mapper ----------

  describe('profile mapper', () => {
    const profileFn = () => getProvider().profile;

    it('should map sub to id', () => {
      const result = profileFn()({ sub: 'user-123', email: 'a@b.com' });
      expect(result.id).toBe('user-123');
    });

    it('should map email directly', () => {
      const result = profileFn()({ sub: 'u', email: 'test@madfam.io' });
      expect(result.email).toBe('test@madfam.io');
    });

    it('should use name when available', () => {
      const result = profileFn()({ sub: 'u', email: 'e', name: 'Jane Doe' });
      expect(result.name).toBe('Jane Doe');
    });

    it('should fall back to given_name + family_name', () => {
      const result = profileFn()({
        sub: 'u',
        email: 'e',
        given_name: 'Jane',
        family_name: 'Doe',
      });
      expect(result.name).toBe('Jane Doe');
    });

    it('should handle missing name fields gracefully', () => {
      const result = profileFn()({ sub: 'u', email: 'e' });
      expect(result.name).toBe('');
    });

    it('should map picture to image', () => {
      const result = profileFn()({
        sub: 'u',
        email: 'e',
        picture: 'https://img.example.com/avatar.png',
      });
      expect(result.image).toBe('https://img.example.com/avatar.png');
    });

    it('should default image to null', () => {
      const result = profileFn()({ sub: 'u', email: 'e' });
      expect(result.image).toBeNull();
    });

    it('should map role from profile.role', () => {
      const result = profileFn()({ sub: 'u', email: 'e', role: 'admin' });
      expect(result.role).toBe('admin');
    });

    it('should fall back to cotiza:role claim', () => {
      const result = profileFn()({
        sub: 'u',
        email: 'e',
        'cotiza:role': 'operator',
      });
      expect(result.role).toBe('operator');
    });

    it('should default role to "customer"', () => {
      const result = profileFn()({ sub: 'u', email: 'e' });
      expect(result.role).toBe('customer');
    });

    it('should map tenant_id', () => {
      const result = profileFn()({
        sub: 'u',
        email: 'e',
        tenant_id: 'tenant-xyz',
      });
      expect(result.tenantId).toBe('tenant-xyz');
    });

    it('should fall back to cotiza:tenant_id claim', () => {
      const result = profileFn()({
        sub: 'u',
        email: 'e',
        'cotiza:tenant_id': 'tenant-abc',
      });
      expect(result.tenantId).toBe('tenant-abc');
    });

    it('should default tenantId to "default"', () => {
      const result = profileFn()({ sub: 'u', email: 'e' });
      expect(result.tenantId).toBe('default');
    });
  });

  // ---------- JWT callback ----------

  describe('jwt callback', () => {
    const jwtCb = () => getJwtCallback();

    it('should populate token on initial sign-in', async () => {
      const result = await jwtCb()({
        token: { sub: 'u-1' },
        user: {
          id: 'user-001',
          email: 'test@madfam.io',
          name: 'Test User',
          role: 'admin',
          tenantId: 'tenant-1',
        },
        account: {
          access_token: 'at-123',
          refresh_token: 'rt-456',
          id_token: 'idt-789',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      expect(result.accessToken).toBe('at-123');
      expect(result.refreshToken).toBe('rt-456');
      expect(result.idToken).toBe('idt-789');
      expect(result.id).toBe('user-001');
      expect(result.role).toBe('admin');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    });

    it('should return existing token when not expired', async () => {
      const token = {
        sub: 'u-1',
        accessToken: 'at-existing',
        accessTokenExpiresAt: Date.now() + 60_000,
        role: 'customer',
        tenantId: 'default',
      };

      const result = await jwtCb()({
        token,
        user: undefined,
        account: undefined,
      });

      expect(result.accessToken).toBe('at-existing');
    });

    it('should default role to "customer" when user has no role', async () => {
      const result = await jwtCb()({
        token: {},
        user: { id: 'u', email: 'e', name: 'n' },
        account: { access_token: 'at', expires_at: Math.floor(Date.now() / 1000) + 3600 },
      });

      expect(result.role).toBe('customer');
    });

    it('should default tenantId to "default" when user has no tenantId', async () => {
      const result = await jwtCb()({
        token: {},
        user: { id: 'u', email: 'e', name: 'n' },
        account: { access_token: 'at', expires_at: Math.floor(Date.now() / 1000) + 3600 },
      });

      expect(result.tenantId).toBe('default');
    });
  });

  // ---------- Session callback ----------

  describe('session callback', () => {
    const sessionCb = () => getSessionCallback();

    it('should populate session from token', async () => {
      const session = {
        user: { id: '', role: '', tenantId: '' },
        accessToken: '',
        expires: '',
      };

      const token = {
        id: 'user-001',
        sub: 'user-001',
        role: 'admin',
        tenantId: 'tenant-xyz',
        accessToken: 'at-token',
      };

      const result = await sessionCb()({ session, token });

      expect(result.user.id).toBe('user-001');
      expect(result.user.role).toBe('admin');
      expect(result.user.tenantId).toBe('tenant-xyz');
      expect(result.accessToken).toBe('at-token');
    });

    it('should use sub as fallback for id', async () => {
      const session = {
        user: { id: '', role: '', tenantId: '' },
        accessToken: '',
        expires: '',
      };

      const token = {
        sub: 'sub-fallback',
        role: 'customer',
        tenantId: 'default',
        accessToken: 'at',
      };

      const result = await sessionCb()({ session, token });
      expect(result.user.id).toBe('sub-fallback');
    });

    it('should pass through error from token', async () => {
      const session = {
        user: { id: '', role: '', tenantId: '' },
        accessToken: '',
        expires: '',
      } as any;

      const token = {
        id: 'u',
        role: 'customer',
        tenantId: 'default',
        accessToken: 'at',
        error: 'RefreshAccessTokenError',
      };

      const result = await sessionCb()({ session, token });
      expect(result.error).toBe('RefreshAccessTokenError');
    });
  });

  // ---------- Session configuration ----------

  describe('session configuration', () => {
    it('should use JWT strategy', () => {
      expect(authOptions.session!.strategy).toBe('jwt');
    });

    it('should set maxAge to 7 days', () => {
      expect(authOptions.session!.maxAge).toBe(7 * 24 * 60 * 60);
    });
  });

  // ---------- Pages configuration ----------

  describe('pages configuration', () => {
    it('should set custom sign-in page', () => {
      expect(authOptions.pages!.signIn).toBe('/auth/login');
    });

    it('should set custom error page', () => {
      expect(authOptions.pages!.error).toBe('/auth/error');
    });
  });
});
