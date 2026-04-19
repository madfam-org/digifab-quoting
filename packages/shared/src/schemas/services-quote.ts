import { z } from 'zod';
import { uuidSchema } from './common';

export const quoteTypeSchema = z.enum(['fab', 'services']);

export const servicesBillableTypeSchema = z.enum(['hourly', 'fixed_fee', 'milestone']);

export const milestoneStatusSchema = z.enum([
  'pending',
  'in_progress',
  'delivered',
  'approved',
  'invoiced',
]);

export const servicesMilestoneSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  amount: z.number().nonnegative(),
  status: milestoneStatusSchema,
  dueDate: z.string().datetime().optional(),
  deliverables: z.array(z.string()).optional(),
  acceptanceCriteria: z.string().max(2000).optional(),
  completedAt: z.string().datetime().optional(),
  invoicedAt: z.string().datetime().optional(),
});

export const servicesHourlyDetailsSchema = z.object({
  billableType: z.literal('hourly'),
  hourlyRate: z.number().positive(),
  estimatedHours: z.number().positive(),
  role: z.string().max(100).optional(),
});

export const servicesFixedFeeDetailsSchema = z.object({
  billableType: z.literal('fixed_fee'),
  fixedFee: z.number().positive(),
  scope: z.string().min(1).max(2000),
});

export const servicesMilestoneDetailsSchema = z.object({
  billableType: z.literal('milestone'),
  milestones: z.array(servicesMilestoneSchema).min(1),
});

export const servicesQuoteItemDetailsSchema = z.discriminatedUnion('billableType', [
  servicesHourlyDetailsSchema,
  servicesFixedFeeDetailsSchema,
  servicesMilestoneDetailsSchema,
]);

export const addServicesQuoteItemRequestSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
  description: z.string().max(2000).optional(),
  details: servicesQuoteItemDetailsSchema,
});

export type ServicesMilestoneInput = z.infer<typeof servicesMilestoneSchema>;
export type ServicesQuoteItemDetailsInput = z.infer<typeof servicesQuoteItemDetailsSchema>;
export type AddServicesQuoteItemRequest = z.infer<typeof addServicesQuoteItemRequestSchema>;
