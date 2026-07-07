import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectQuoteDto {
  @ApiPropertyOptional({
    description: 'Optional customer-supplied reason for rejecting the quote',
    example: 'Lead time is too long for our deadline',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
