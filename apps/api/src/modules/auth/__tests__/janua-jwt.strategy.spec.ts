import { UnauthorizedException } from '@nestjs/common';

/**
 * We cannot instantiate JanuaJwtStrategy directly in a unit test because
 * PassportStrategy's constructor calls passport-jwt internals that require
 * a real secretOrKeyProvider. Instead we test the `validate` method in
 * isolation by importing the class and calling validate() on a partially
 * constructed instance (prototype-level).
 *
 * For the JWKS integration (constructor wiring) we rely on integration /
 * smoke tests that hit a running Janua instance.
 */

// Mock jwks-rsa before importing strategy (avoids native dependency resolution)
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

// --------------------------------------------------------------------------
// Import the strategy and its types
// --------------------------------------------------------------------------
import {
  JanuaJwtStrategy,
  JanuaJWTPayload,
  JanuaUser,
} from '../strategies/janua-jwt.strategy';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function buildPayload(overrides: Partial<JanuaJWTPayload> = {}): JanuaJWTPayload {
  return {
    sub: 'user-001',
    email: 'test@madfam.io',
    iss: 'janua',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

/**
 * Because PassportStrategy wires up passport-jwt in the constructor, and
 * that constructor tries to resolve the JWKS provider immediately, we
 * build a lightweight instance that only has the `validate` method bound
 * to the correct prototype. This lets us exercise the pure validation
 * logic without network calls.
 */
function createStrategyForValidation(): JanuaJwtStrategy {
  // We use Object.create to get an object whose prototype is the strategy
  // class, then manually attach a logger so the validate() log calls work.
  const instance = Object.create(JanuaJwtStrategy.prototype) as JanuaJwtStrategy;
  // Attach a silent logger
  (instance as any).logger = {
    log: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };
  return instance;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('JanuaJwtStrategy', () => {
  let strategy: JanuaJwtStrategy;

  beforeEach(() => {
    strategy = createStrategyForValidation();
  });

  // ---------- Happy path ----------

  describe('validate - successful authentication', () => {
    it('should return a JanuaUser for a valid Janua payload with issuer "janua"', async () => {
      const payload = buildPayload({ iss: 'janua' });
      const user: JanuaUser = await strategy.validate(payload);

      expect(user).toEqual({
        id: 'user-001',
        email: 'test@madfam.io',
        tenantId: null,
        roles: ['user'],
        permissions: [],
        active: true,
      });
    });

    it('should accept issuer "https://janua.dev"', async () => {
      const payload = buildPayload({ iss: 'https://janua.dev' });
      const user = await strategy.validate(payload);
      expect(user.id).toBe('user-001');
    });

    it('should accept issuer "http://localhost:8001"', async () => {
      const payload = buildPayload({ iss: 'http://localhost:8001' });
      const user = await strategy.validate(payload);
      expect(user.id).toBe('user-001');
    });

    it('should accept issuer "https://auth.madfam.io" (new RS256 issuer)', async () => {
      const payload = buildPayload({ iss: 'https://auth.madfam.io' });
      const user = await strategy.validate(payload);
      expect(user.id).toBe('user-001');
    });

    it('should map org_id to tenantId', async () => {
      const payload = buildPayload({ org_id: 'tenant-abc' });
      const user = await strategy.validate(payload);
      expect(user.tenantId).toBe('tenant-abc');
    });

    it('should default tenantId to null when org_id is missing', async () => {
      const payload = buildPayload();
      delete payload.org_id;
      const user = await strategy.validate(payload);
      expect(user.tenantId).toBeNull();
    });

    it('should use provided roles from payload', async () => {
      const payload = buildPayload({ roles: ['admin', 'operator'] });
      const user = await strategy.validate(payload);
      expect(user.roles).toEqual(['admin', 'operator']);
    });

    it('should default roles to ["user"] when not provided', async () => {
      const payload = buildPayload();
      delete payload.roles;
      const user = await strategy.validate(payload);
      expect(user.roles).toEqual(['user']);
    });

    it('should use provided permissions from payload', async () => {
      const payload = buildPayload({ permissions: ['quotes:read', 'quotes:write'] });
      const user = await strategy.validate(payload);
      expect(user.permissions).toEqual(['quotes:read', 'quotes:write']);
    });

    it('should default permissions to empty array when not provided', async () => {
      const payload = buildPayload();
      delete payload.permissions;
      const user = await strategy.validate(payload);
      expect(user.permissions).toEqual([]);
    });

    it('should always set active to true', async () => {
      const user = await strategy.validate(buildPayload());
      expect(user.active).toBe(true);
    });
  });

  // ---------- Failure cases ----------

  describe('validate - missing subject', () => {
    it('should throw UnauthorizedException when sub is empty', async () => {
      const payload = buildPayload({ sub: '' });
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('missing user identifier');
    });

    it('should throw UnauthorizedException when sub is undefined', async () => {
      const payload = buildPayload();
      (payload as any).sub = undefined;
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validate - invalid issuer', () => {
    it('should throw UnauthorizedException for an unknown issuer', async () => {
      const payload = buildPayload({ iss: 'https://evil.example.com' });
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('incorrect issuer');
    });

    it('should throw for empty issuer string', async () => {
      const payload = buildPayload({ iss: '' });
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------- Interface contracts ----------

  describe('JanuaJWTPayload interface', () => {
    it('should preserve all standard claims', () => {
      const payload = buildPayload({
        sub: 'u-123',
        email: 'a@b.com',
        org_id: 'org-1',
        roles: ['r'],
        permissions: ['p'],
        iss: 'janua',
        iat: 1000,
        exp: 2000,
      });

      expect(payload.sub).toBe('u-123');
      expect(payload.email).toBe('a@b.com');
      expect(payload.org_id).toBe('org-1');
      expect(payload.roles).toEqual(['r']);
      expect(payload.permissions).toEqual(['p']);
      expect(payload.iss).toBe('janua');
      expect(payload.iat).toBe(1000);
      expect(payload.exp).toBe(2000);
    });
  });
});
