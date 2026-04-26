export enum Role {
  ADMIN = 'admin',
  MANAGER = 'manager',
  OPERATOR = 'operator',
  SUPPORT = 'support',
  CUSTOMER = 'customer',
  COMPLIANCE = 'compliance',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
}

export enum QuoteStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  ACCEPTED = 'accepted',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PRODUCTION = 'in_production',
  COMPLETED = 'completed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum InvoiceStatus {
  PENDING = 'pending',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export enum FileStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  ERROR = 'error',
}

export enum ProcessType {
  FFF_3D_PRINTING = 'fff_3d_printing',
  SLA_3D_PRINTING = 'sla_3d_printing',
  CNC_MACHINING = 'cnc_machining',
  LASER_CUTTING = 'laser_cutting',
}

export enum BillingPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum Currency {
  USD = 'USD',
  MXN = 'MXN',
  EUR = 'EUR',
  GBP = 'GBP',
}

export enum Locale {
  EN = 'en',
  ES = 'es',
  FR = 'fr',
  DE = 'de',
}
