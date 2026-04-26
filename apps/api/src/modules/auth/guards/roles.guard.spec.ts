import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { USER_ROLES } from '@cotiza/shared';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let tenantContext: TenantContextService;

  const mockExecutionContext = (user?: {
    id: string;
    email: string;
    roles?: string[];
  }): ExecutionContext =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getCurrentUserRoles: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when no roles are required', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);
      const context = mockExecutionContext();

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when empty roles array is required', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);
      const context = mockExecutionContext();

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.ADMIN]);
      const context = mockExecutionContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should return true when user has required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.MANAGER] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when user has higher role (hierarchy)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.CUSTOMER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.ADMIN] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when admin requires manager role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.ADMIN] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return true when manager requires operator role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.OPERATOR]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.MANAGER] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user lacks required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.ADMIN]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.CUSTOMER] };
      const context = mockExecutionContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(/Access denied/);
    });

    it('should throw ForbiddenException when customer requires manager role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.CUSTOMER] };
      const context = mockExecutionContext(user);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should use roles from both JWT and tenant context', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.CUSTOMER] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle multiple required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        USER_ROLES.MANAGER,
        USER_ROLES.OPERATOR,
      ]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.OPERATOR] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle user with multiple roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.SUPPORT]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([]);

      const user = {
        id: 'user-1',
        email: 'test@example.com',
        roles: [USER_ROLES.CUSTOMER, USER_ROLES.SUPPORT],
      };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deduplicate roles from multiple sources', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([USER_ROLES.MANAGER]);
      (tenantContext.getCurrentUserRoles as jest.Mock).mockReturnValue([
        USER_ROLES.MANAGER,
        USER_ROLES.MANAGER,
      ]);

      const user = { id: 'user-1', email: 'test@example.com', roles: [USER_ROLES.MANAGER] };
      const context = mockExecutionContext(user);

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
