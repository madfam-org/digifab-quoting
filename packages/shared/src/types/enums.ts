// Distinguishes fabrication quotes (material + machine time pricing)
// from internal-only services quotes (hourly/fixed-fee/milestone).
// Externally, only FAB is exposed; SERVICES is gated per-tenant via
// Tenant.features.services_quotes.
export enum QuoteType {
  FAB = 'fab',
  SERVICES = 'services',
}

// Billable shape for a services quote line.
export enum ServicesBillableType {
  HOURLY = 'hourly',
  FIXED_FEE = 'fixed_fee',
  MILESTONE = 'milestone',
}

// Milestone lifecycle (services quotes only).
export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  APPROVED = 'approved',
  INVOICED = 'invoiced',
}

// Quote related enums
export enum QuoteStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  AUTO_QUOTED = 'auto_quoted',
  NEEDS_REVIEW = 'needs_review',
  QUOTED = 'quoted',
  APPROVED = 'approved',
  ORDERED = 'ordered',
  IN_PRODUCTION = 'in_production',
  QC = 'qc',
  SHIPPED = 'shipped',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum QuoteObjective {
  PROTOTYPE = 'PROTOTYPE',
  PRODUCTION = 'PRODUCTION',
  TOOLING = 'TOOLING',
  SPARE_PARTS = 'SPARE_PARTS',
}

// User and auth related enums
export enum Role {
  ADMIN = 'admin',
  MANAGER = 'manager',
  OPERATOR = 'operator',
  SUPPORT = 'support',
  CUSTOMER = 'customer',
}

// Process types
export enum ProcessType {
  FFF = 'FFF',
  SLA = 'SLA',
  SLS = 'SLS',
  MJF = 'MJF',
  CNC_3AXIS = 'CNC_3AXIS',
  CNC_5AXIS = 'CNC_5AXIS',
  LASER_2D = 'LASER_2D',
  SHEET_METAL = 'SHEET_METAL',
  // Legacy aliases for backward compatibility
  PRINTING_3D_FFF = 'FFF',
  PRINTING_3D_SLA = 'SLA',
  CNC_MILLING_3AXIS = 'CNC_3AXIS',
  LASER_CUTTING = 'LASER_2D',
}

// User persona types
export enum UserPersona {
  DIY_MAKER = 'diy_maker',
  PROFESSIONAL_SHOP = 'professional_shop',
  EDUCATOR = 'educator',
  PRODUCT_DESIGNER = 'product_designer',
  PROCUREMENT_SPECIALIST = 'procurement_specialist',
}

// Financial enums
export enum Currency {
  // Americas
  MXN = 'MXN', // Mexican Peso
  USD = 'USD', // US Dollar
  CAD = 'CAD', // Canadian Dollar
  BRL = 'BRL', // Brazilian Real
  ARS = 'ARS', // Argentine Peso
  CLP = 'CLP', // Chilean Peso
  COP = 'COP', // Colombian Peso
  PEN = 'PEN', // Peruvian Sol
  
  // Europe
  EUR = 'EUR', // Euro
  GBP = 'GBP', // British Pound
  CHF = 'CHF', // Swiss Franc
  SEK = 'SEK', // Swedish Krona
  NOK = 'NOK', // Norwegian Krone
  DKK = 'DKK', // Danish Krone
  PLN = 'PLN', // Polish Zloty
  
  // Asia Pacific
  CNY = 'CNY', // Chinese Yuan
  JPY = 'JPY', // Japanese Yen
  KRW = 'KRW', // South Korean Won
  INR = 'INR', // Indian Rupee
  SGD = 'SGD', // Singapore Dollar
  HKD = 'HKD', // Hong Kong Dollar
  AUD = 'AUD', // Australian Dollar
  NZD = 'NZD', // New Zealand Dollar
  TWD = 'TWD', // Taiwan Dollar
  THB = 'THB', // Thai Baht
  
  // Middle East & Africa
  AED = 'AED', // UAE Dirham
  SAR = 'SAR', // Saudi Riyal
  ZAR = 'ZAR', // South African Rand
  EGP = 'EGP', // Egyptian Pound
}

// Audit enums
export enum AuditEntity {
  USER = 'user',
  QUOTE = 'quote',
  QUOTE_ITEM = 'quote_item',
  CUSTOMER = 'customer',
  MATERIAL = 'material',
  MACHINE = 'machine',
  PRICING_RULE = 'pricing_rule',
  MARGIN = 'margin',
  DISCOUNT_RULE = 'discount_rule',
  SHIPPING_RATE = 'shipping_rate',
  TENANT = 'tenant',
  PAYMENT = 'payment',
  FILE = 'file',
  SESSION = 'session',
  CONFIG = 'config',
  SETTINGS = 'settings',
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  READ = 'read',
  VIEW = 'view',
  EXPORT = 'export',
  LOGIN = 'login',
  LOGOUT = 'logout',
  FAILED_LOGIN = 'failed_login',
  APPROVE = 'approve',
  REJECT = 'reject',
  ACCEPT = 'accept',
  CANCEL = 'cancel',
  SEND = 'send',
  DOWNLOAD = 'download',
  UPLOAD = 'upload',
  CONFIG_CHANGE = 'config_change',
  PERMISSION_GRANT = 'permission_grant',
  PERMISSION_REVOKE = 'permission_revoke',
}

// Order enums
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY = 'READY',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

// Material enums
export enum MaterialCategory {
  PLASTIC = 'PLASTIC',
  METAL = 'METAL',
  COMPOSITE = 'COMPOSITE',
  CERAMIC = 'CERAMIC',
  RESIN = 'RESIN',
  WOOD = 'WOOD',
}

// File enums
export enum FileStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}
