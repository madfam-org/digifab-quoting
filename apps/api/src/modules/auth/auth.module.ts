import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { TenantModule } from '../tenant/tenant.module';
import { JanuaJwtStrategy } from './strategies/janua-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JanuaAuthGuard } from './guards/janua-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    UsersModule,
    TenantModule,
    PassportModule.register({ defaultStrategy: 'janua-jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JANUA_JWT_SECRET'),
        signOptions: {
          expiresIn: '1h',
          issuer: 'janua',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JanuaJwtStrategy,
    JwtAuthGuard,
    JanuaAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, JanuaAuthGuard, RolesGuard],
})
export class AuthModule {}
