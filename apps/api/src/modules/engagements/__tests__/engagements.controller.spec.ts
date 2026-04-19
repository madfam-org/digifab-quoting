/**
 * EngagementsController — thin delegation shell. Tests cover:
 *   - tenantId is pulled from the authenticated request and passed to the service
 *   - both endpoints call through to the right service method with the path param intact
 *
 * JwtAuthGuard is stubbed so the controller runs end-to-end inside the
 * Nest testing module without a real Janua verifier.
 */
import { Test } from '@nestjs/testing';

// Guards must be mocked before controller import so the DI graph resolves
// without the full auth module.
jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

import { EngagementsController } from '../engagements.controller';
import { EngagementsService } from '../engagements.service';

describe('EngagementsController', () => {
  let controller: EngagementsController;
  let service: jest.Mocked<
    Pick<EngagementsService, 'findByPhynecrmId' | 'listQuotesForEngagement'>
  >;

  beforeEach(async () => {
    service = {
      findByPhynecrmId: jest.fn().mockResolvedValue({
        id: 'eng_1',
        tenantId: 't1',
        phynecrmEngagementId: 'pcrm_1',
        projectName: 'Tablaco',
        status: 'active',
        contactId: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        quoteCountsByType: { fab: 1, services: 1 },
      }),
      listQuotesForEngagement: jest.fn().mockResolvedValue({
        fab: [{ id: 'q1', quoteType: 'fab' }],
        services: [{ id: 'q2', quoteType: 'services' }],
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [EngagementsController],
      providers: [{ provide: EngagementsService, useValue: service }],
    }).compile();
    controller = module.get(EngagementsController);
  });

  it('findOne — forwards tenantId from req.user + phynecrmEngagementId from path', async () => {
    const req = { user: { tenantId: 't1' } } as any;
    const result = await controller.findOne(req, 'pcrm_1');
    expect(service.findByPhynecrmId).toHaveBeenCalledWith('t1', 'pcrm_1');
    expect(result.quoteCountsByType).toEqual({ fab: 1, services: 1 });
  });

  it('listQuotes — forwards tenantId + phynecrmEngagementId, returns grouped shape', async () => {
    const req = { user: { tenantId: 't1' } } as any;
    const result = await controller.listQuotes(req, 'pcrm_1');
    expect(service.listQuotesForEngagement).toHaveBeenCalledWith('t1', 'pcrm_1');
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['fab', 'services']));
  });

  it('isolates across tenants (service receives caller tenantId, not the path id)', async () => {
    const req = { user: { tenantId: 't_caller' } } as any;
    await controller.findOne(req, 'pcrm_belongs_to_other');
    expect(service.findByPhynecrmId).toHaveBeenCalledWith(
      't_caller',
      'pcrm_belongs_to_other',
    );
  });
});
