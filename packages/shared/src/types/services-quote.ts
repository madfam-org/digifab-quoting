import { UUID } from './common';
import { MilestoneStatus, ServicesBillableType } from './enums';

// Stored in QuoteItem.servicesDetails (Prisma Json? column) when the
// parent Quote.quoteType === SERVICES. Unused for FAB quotes.
export type ServicesQuoteItemDetails =
  | ServicesHourlyDetails
  | ServicesFixedFeeDetails
  | ServicesMilestoneDetails;

export interface ServicesHourlyDetails {
  billableType: ServicesBillableType.HOURLY;
  hourlyRate: number;
  estimatedHours: number;
  role?: string;
}

export interface ServicesFixedFeeDetails {
  billableType: ServicesBillableType.FIXED_FEE;
  fixedFee: number;
  scope: string;
}

export interface ServicesMilestoneDetails {
  billableType: ServicesBillableType.MILESTONE;
  milestones: ServicesMilestone[];
}

export interface ServicesMilestone {
  id: UUID;
  name: string;
  amount: number;
  status: MilestoneStatus;
  dueDate?: string;
  deliverables?: string[];
  acceptanceCriteria?: string;
  completedAt?: string;
  invoicedAt?: string;
}

// Rate card shape for tenant-configured hourly rates (keyed by role).
export interface ServicesRateCard {
  id: UUID;
  tenantId: UUID;
  name: string;
  currency: string;
  rates: Record<string, number>;
  effectiveFrom: string;
  effectiveUntil?: string;
}
