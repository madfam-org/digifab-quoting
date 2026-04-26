import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserPreferencesDto {
  @ApiProperty({
    description: 'Preferred language/locale',
    example: 'es',
    enum: ['es', 'en', 'pt-BR'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['es', 'en', 'pt-BR'])
  preferredLocale?: string;

  @ApiProperty({
    description: 'Email notifications enabled',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiProperty({
    description: 'Preferred currency',
    example: 'MXN',
    enum: ['MXN', 'USD', 'BRL'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['MXN', 'USD', 'BRL'])
  currency?: string;

  @ApiProperty({
    description: 'User timezone',
    example: 'America/Mexico_City',
    required: false,
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
