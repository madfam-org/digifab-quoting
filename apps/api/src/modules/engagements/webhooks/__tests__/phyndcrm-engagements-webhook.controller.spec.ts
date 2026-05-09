/**
 * PhynecrmEngagementsWebhookController — signature verification + event
 * dispatch. Service is mocked; we're testing the controller's gates,
 * not the projection logic.
 */
import * as crypto from 'crypto';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

import { EngagementsService } from '../../engagements.service';
import { PhynecrmEngagementsWebhookController } from '../phyndcrm-engagements-webhook.controller';

const SECRET = 'test-inbound-secret';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function mkRequest(body: object): any {
  const raw = JSON.stringify(body);
  return {
    rawBody: Buffer.from(raw, 'utf-8'),
  };
}

describe('PhynecrmEngagementsWebhookController', () => {
  let controller: PhynecrmEngagementsWebhookController;
  let service: jest.Mocked<Pick<EngagementsService, 'upsert' | 'softDelete'>>;

  beforeEach(async () => {
    service = {
      upsert: jest.fn().mockResolvedValue({ id: 'eng_1' } as any),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      controllers: [PhynecrmEngagementsWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, def: unknown) => (k === 'PHYNECRM_INBOUND_SECRET' ? SECRET : def),
          },
        },
        { provide: EngagementsService, useValue: service },
      ],
    }).compile();
    controller = module.get(PhynecrmEngagementsWebhookController);
  });

  it('rejects a missing signature', async () => {
    const payload = { engagement_id: 'pcrm_1', tenant_id: 't1', event_type: 'engagement.created' };
    await expect(
      controller.handle(mkRequest(payload), undefined as unknown as string, payload as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.upsert).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const payload = { engagement_id: 'pcrm_1', tenant_id: 't1', event_type: 'engagement.created' };
    await expect(
      controller.handle(mkRequest(payload), 'deadbeef'.repeat(8), payload as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires engagement_id + tenant_id + event_type', async () => {
    const payload = { engagement_id: '', tenant_id: 't1', event_type: 'engagement.created' };
    const req = mkRequest(payload);
    await expect(
      controller.handle(req, sign(req.rawBody.toString()), payload as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts on engagement.created', async () => {
    const payload = {
      engagement_id: 'pcrm_1',
      tenant_id: 't1',
      event_type: 'engagement.created',
      data: { project_name: 'Tablaco', status: 'active', contact_id: 'c_1' },
    };
    const req = mkRequest(payload);
    const result = await controller.handle(req, sign(req.rawBody.toString()), payload as any);

    expect(result).toEqual({ received: true, event: 'engagement.created', action: 'upserted' });
    expect(service.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        phyndcrmEngagementId: 'pcrm_1',
        projectName: 'Tablaco',
        status: 'active',
        contactId: 'c_1',
        synced: true,
      }),
    );
  });

  it('soft-deletes on engagement.archived', async () => {
    const payload = {
      engagement_id: 'pcrm_1',
      tenant_id: 't1',
      event_type: 'engagement.archived',
    };
    const req = mkRequest(payload);
    const result = await controller.handle(req, sign(req.rawBody.toString()), payload as any);

    expect(result.action).toBe('archived');
    expect(service.softDelete).toHaveBeenCalledWith('pcrm_1');
    expect(service.upsert).not.toHaveBeenCalled();
  });

  it('acknowledges (does not fail on) unknown event types', async () => {
    const payload = {
      engagement_id: 'pcrm_1',
      tenant_id: 't1',
      event_type: 'engagement.something.new',
    };
    const req = mkRequest(payload);
    const result = await controller.handle(req, sign(req.rawBody.toString()), payload as any);
    expect(result.action).toBe('ignored');
    expect(service.upsert).not.toHaveBeenCalled();
    expect(service.softDelete).not.toHaveBeenCalled();
  });
});
