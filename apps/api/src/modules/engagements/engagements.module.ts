import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { EngagementsController } from './engagements.controller';
import { EngagementsService } from './engagements.service';
import { PhynecrmEngagementsWebhookController } from './webhooks/phynecrm-engagements-webhook.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EngagementsController, PhynecrmEngagementsWebhookController],
  providers: [EngagementsService],
  exports: [EngagementsService],
})
export class EngagementsModule {}
