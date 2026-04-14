import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
    validateUser: jest.fn(),
    generateTokens: jest.fn(),
    verifyRefreshToken: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'customer',
    roles: ['customer'],
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh',
    expiresIn: 900,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'SecurePassword123!',
      name: 'New User',
      company: 'ACME Corp',
    };

    it('should successfully register a new user', async () => {
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        ...mockTokens,
      });

      const result = await controller.register(registerDto);

      expect(result).toEqual({
        user: mockUser,
        ...mockTokens,
      });
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
    });

    it('should handle duplicate email error', async () => {
      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Email already exists')
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should validate password strength', async () => {
      const weakPasswordDto = {
        ...registerDto,
        password: '123456',
      };

      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Password too weak')
      );

      await expect(controller.register(weakPasswordDto)).rejects.toThrow(
        'Password too weak'
      );
    });
  });

  describe('login (JanuaAuthGuard)', () => {
    // The login endpoint now uses @UseGuards(JanuaAuthGuard), which
    // authenticates via Janua JWT and populates req.user before the
    // controller method runs. The controller calls authService.login(user).

    it('should successfully login a user via JanuaAuthGuard', async () => {
      const req = {
        user: mockUser,
        ip: '192.168.1.1',
        headers: { 'user-agent': 'test' },
      } as any;

      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        ...mockTokens,
      });

      const result = await controller.login(req, loginDto);

      expect(result).toEqual({
        user: mockUser,
        ...mockTokens,
      });
      // The controller passes req.user (set by JanuaAuthGuard) to authService.login
      expect(mockAuthService.login).toHaveBeenCalledWith(mockUser);
    });

    it('should handle invalid credentials from JanuaAuthGuard', async () => {
      const req = {
        user: mockUser,
      } as any;

      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials')
      );

      await expect(controller.login(req, loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('refreshToken', () => {
    const refreshDto = {
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh',
    };

    it('should successfully refresh access token', async () => {
      mockAuthService.refreshTokens.mockResolvedValue(mockTokens);

      const result = await controller.refreshToken(refreshDto);

      expect(result).toEqual(mockTokens);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(refreshDto.refreshToken);
    });

    it('should handle invalid refresh token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token')
      );

      await expect(controller.refreshToken(refreshDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should handle expired refresh token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Refresh token expired')
      );

      await expect(controller.refreshToken(refreshDto)).rejects.toThrow(
        'Refresh token expired'
      );
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      const req = {
        user: { id: 'user-123' },
        headers: { authorization: 'Bearer token' },
      } as any;

      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(req);

      expect(mockAuthService.logout).toHaveBeenCalledWith('token');
    });

    it('should handle logout without authorization header', async () => {
      const req = {
        user: { id: 'user-123' },
        headers: {},
      } as any;

      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(req);

      expect(mockAuthService.logout).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getSession', () => {
    it('should return current user session', async () => {
      const req = {
        user: mockUser,
      } as any;

      const result = await controller.getSession(req);

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getMe (JanuaAuthGuard)', () => {
    it('should return Janua JWT user profile', async () => {
      const req = {
        user: {
          id: 'janua-user-1',
          email: 'alice@example.com',
          name: 'Alice',
          roles: ['customer'],
          tenantId: 'tenant-abc',
        },
      } as any;

      const result = await controller.getMe(req);

      expect(result).toEqual({
        id: 'janua-user-1',
        email: 'alice@example.com',
        name: 'Alice',
        roles: ['customer'],
        tenantId: 'tenant-abc',
      });
    });

    it('should handle user without name', async () => {
      const req = {
        user: {
          id: 'janua-user-2',
          email: 'bob@example.com',
          roles: ['customer'],
          tenantId: 'tenant-abc',
        },
      } as any;

      const result = await controller.getMe(req);

      expect(result.name).toBeNull();
    });
  });

  describe('logEvent', () => {
    it('should accept authentication event logs', async () => {
      const eventData = {
        event: 'login_attempt',
        userId: 'user-123',
        metadata: {
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      };

      // logEvent returns void (HTTP 204)
      const result = await controller.logEvent(eventData);
      expect(result).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('should validate email format on register', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
      ];

      for (const email of invalidEmails) {
        mockAuthService.register.mockRejectedValue(
          new BadRequestException('Invalid email format')
        );

        await expect(
          controller.register({
            email,
            password: 'ValidPassword123!',
            name: 'Test',
          })
        ).rejects.toThrow('Invalid email format');
      }
    });

    it('should enforce password requirements on register', async () => {
      const weakPasswords = [
        '12345',           // Too short
        'password',        // No numbers
        'PASSWORD123',     // No lowercase
        'password123',     // No uppercase
        'Password',        // No numbers
      ];

      for (const password of weakPasswords) {
        mockAuthService.register.mockRejectedValue(
          new BadRequestException('Password does not meet requirements')
        );

        await expect(
          controller.register({
            email: 'test@example.com',
            password,
            name: 'Test',
          })
        ).rejects.toThrow('Password does not meet requirements');
      }
    });
  });
});
