import { Module, Provider } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { TenantModule } from '../tenant/tenant.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JanuaJwtStrategy } from './strategies/janua-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JanuaAuthGuard } from './guards/janua-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Build the list of auth providers.
 * LocalStrategy is only registered when ENABLE_LOCAL_AUTH === 'true'.
 */
function buildAuthProviders(): Provider[] {
  const providers: Provider[] = [
    AuthService,
    JwtStrategy,
    JanuaJwtStrategy,
    JwtAuthGuard,
    JanuaAuthGuard,
    RolesGuard,
  ];

  if (process.env.ENABLE_LOCAL_AUTH === 'true') {
    providers.push(LocalStrategy);
  }

  return providers;
}

@Module({
  imports: [
    UsersModule,
    TenantModule,
    PassportModule.register({ defaultStrategy: 'janua-jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Prefer Janua secret, fallback to local jwt.secret
        secret: config.get('JANUA_JWT_SECRET') || config.get('jwt.secret'),
        signOptions: {
          expiresIn: config.get('jwt.accessTokenExpiry') || '1h',
          issuer: 'janua',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: buildAuthProviders(),
  exports: [AuthService, JwtAuthGuard, JanuaAuthGuard, RolesGuard],
})
export class AuthModule {}
