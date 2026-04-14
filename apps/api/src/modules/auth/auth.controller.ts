import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JanuaAuthGuard } from './guards/janua-auth.guard';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';
import { RefreshTokenDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import {
  UnauthorizedResponseDto,
  ValidationErrorResponseDto,
  ConflictResponseDto,
} from '../../common/dto/api-response.dto';
import { User } from '@cotiza/shared';
import { Public } from './decorators/public.decorator';
import { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user?: User;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account with the provided information. Email must be unique within the tenant.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    type: ValidationErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Email already exists',
    type: ConflictResponseDto,
  })
  @ApiHeader({
    name: 'X-Tenant-ID',
    description: 'Optional tenant identifier for multi-tenant registration',
    required: false,
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(JanuaAuthGuard)
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user',
    description: 'Authenticates a user with email and password, returns JWT tokens for API access',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access and refresh tokens',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
    type: UnauthorizedResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    type: ValidationErrorResponseDto,
  })
  @ApiHeader({
    name: 'X-Tenant-ID',
    description: 'Optional tenant identifier for multi-tenant login',
    required: false,
  })
  async login(@Request() req: Express.Request, @Body() _loginDto: LoginDto) {
    const user = req.user as User;
    return this.authService.login(user);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for new access and refresh tokens',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
    type: UnauthorizedResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
    type: ValidationErrorResponseDto,
  })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidates the current access token, preventing further API access',
  })
  @ApiResponse({
    status: 204,
    description: 'Logout successful, token invalidated',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication token',
    type: UnauthorizedResponseDto,
  })
  async logout(@Request() req: AuthenticatedRequest) {
    const token = req.headers?.authorization?.replace('Bearer ', '');
    await this.authService.logout(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user session',
    description: 'Returns the current authenticated user information',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user session data',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication token',
    type: UnauthorizedResponseDto,
  })
  async getSession(@Request() req: AuthenticatedRequest) {
    const user = req.user as User;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        tenantId: user.tenantId,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(JanuaAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the current authenticated user profile information (supports Janua JWT tokens)',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user profile data',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing authentication token',
    type: UnauthorizedResponseDto,
  })
  async getMe(@Request() req: AuthenticatedRequest) {
    const user = req.user as any; // JanuaUser type from strategy
    return {
      id: user.id,
      email: user.email,
      name: user.name || null,
      roles: user.roles,
      tenantId: user.tenantId,
    };
  }

  @Post('_log')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Log authentication events',
    description: 'Used by frontend to log authentication-related events for analytics',
  })
  @ApiResponse({
    status: 204,
    description: 'Event logged successfully',
  })
  async logEvent(@Body() _eventData: Record<string, unknown>) {
    // This is a placeholder for frontend analytics
    // In production, you might want to send this to your analytics service
    return;
  }
}
