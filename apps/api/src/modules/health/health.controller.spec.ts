import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

// Verifies the controller is reachable without auth (k8s startup/liveness/
// readiness probes hit /health unauthenticated). The global JanuaAuthGuard
// short-circuits when getAllAndOverride(IS_PUBLIC_KEY, [handler, class])
// returns true — so both class- and method-level @Public() must survive
// build-time decorator transforms.
describe('HealthController — @Public() metadata', () => {
  const reflector = new Reflector();

  it('class is decorated with @Public()', () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });

  it.each([
    ['check', HealthController.prototype.check],
    ['ready', HealthController.prototype.ready],
    ['detailed', HealthController.prototype.detailed],
  ])('%s handler is decorated with @Public()', (_name, handler) => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, handler)).toBe(true);
  });

  it('getAllAndOverride([handler, class]) resolves to true for /health', () => {
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      HealthController.prototype.check,
      HealthController,
    ]);
    expect(isPublic).toBe(true);
  });
});
