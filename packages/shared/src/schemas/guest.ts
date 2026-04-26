import { z } from 'zod';

// Guest session schemas
export const guestSessionSchema = z.object({
  id: z.string().uuid(),
  sessionToken: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
  quoteCount: z.number().int().min(0),
  convertedAt: z.date().optional(),
  convertedUserId: z.string().uuid().optional(),
});

export const createGuestSessionSchema = z.object({
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
});

// Guest quote schemas
export const guestQuoteItemSchema = z.object({
  filename: z.string(),
  quantity: z.number().int().min(1),
  material: z.string(),
  finish: z.string().optional(),
  process: z.enum(['3D_PRINTING', 'CNC_MACHINING', 'LASER_CUTTING']),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  leadTime: z.number().int().positive(),
  specifications: z.record(z.any()).optional(),
});

export const guestQuoteSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  items: z.array(guestQuoteItemSchema),
  subtotal: z.number().positive(),
  tax: z.number().min(0),
  total: z.number().positive(),
  currency: z.string().length(3),
  status: z.enum(['draft', 'quoted', 'expired']),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
});

export const createGuestQuoteSchema = z.object({
  uploadId: z.string(),
  files: z.array(
    z.object({
      key: z.string(),
      filename: z.string(),
      size: z.number().int().positive(),
    }),
  ),
});

export const updateGuestQuoteItemSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  material: z.string().optional(),
  finish: z.string().optional(),
  options: z.record(z.any()).optional(),
});

// Conversion schemas
export const convertGuestQuoteSchema = z.object({
  sessionId: z.string().uuid(),
  sessionQuoteId: z.string().uuid(),
});

export const registerWithQuoteSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  company: z.string().optional(),
  sessionId: z.string().uuid(),
  sessionQuoteId: z.string().uuid(),
});

// Type exports
export type GuestSession = z.infer<typeof guestSessionSchema>;
export type CreateGuestSession = z.infer<typeof createGuestSessionSchema>;
export type GuestQuote = z.infer<typeof guestQuoteSchema>;
export type CreateGuestQuote = z.infer<typeof createGuestQuoteSchema>;
export type UpdateGuestQuoteItem = z.infer<typeof updateGuestQuoteItemSchema>;
export type ConvertGuestQuote = z.infer<typeof convertGuestQuoteSchema>;
export type RegisterWithQuote = z.infer<typeof registerWithQuoteSchema>;
