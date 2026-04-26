// Shared interfaces for report generators

export interface ReportItem {
  name: string;
  process: string;
  material: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status?: string;
}

export interface CustomerData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

export interface QuoteOrderData {
  id: string;
  number: string;
  status: string;
  createdAt: Date;
  expiresAt?: Date;
  items: ReportItem[];
  customer: CustomerData;
  totalAmount: number;
  currency: string;
  quote?: {
    id: string;
    number: string;
    items: ReportItem[];
  };
}

export interface QuoteStatistic {
  status: string;
  _count: number;
  _sum: {
    total?: number | null;
  };
  _avg?: {
    total?: number | null;
  };
}

export interface OrderStatistic {
  status: string;
  _count: number;
  _sum: {
    totalPaid?: number | null;
  };
  _avg?: {
    totalPaid?: number | null;
  };
}

export interface RevenueByPeriod {
  period: Date;
  order_count: number;
  revenue: number;
  avg_order_value?: number;
}

export interface MaterialStatistic {
  material: string;
  usage_count: number;
  total_volume?: number;
}

export interface ProcessStatistic {
  process: string;
  usage_count: number;
  avg_lead_time?: number;
}

export interface AnalyticsMetrics {
  conversionRate?: number;
  avgOrderValue?: number;
  avgLeadTime?: number;
  repeatCustomerRate?: number;
  [key: string]: unknown;
}

export interface AnalyticsData {
  criteria: {
    startDate: string;
    endDate: string;
    groupBy?: 'day' | 'week' | 'month';
    filters?: Record<string, unknown>;
  };
  quotes?: QuoteStatistic[];
  orders?: OrderStatistic[];
  revenue?: RevenueByPeriod[];
  materials?: MaterialStatistic[];
  processes?: ProcessStatistic[];
  metrics?: AnalyticsMetrics;
  generatedAt: Date;
}

export interface PDFContentItem {
  text?: string;
  fontSize?: number;
  bold?: boolean;
  margin?: number[];
  alignment?: string;
  table?: {
    headerRows?: number;
    widths?: (string | number)[];
    body: (string | number)[][];
  };
  columns?: PDFContentItem[];
  stack?: PDFContentItem[];
  pageBreak?: string;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string[];
    borderColor?: string;
    fill?: boolean;
  }>;
}

export interface WorksheetData {
  name: string;
  data: Array<Record<string, unknown>>;
  headers?: string[];
}

export interface InvoiceData {
  id: string;
  number: string;
  dueDate: Date;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  totalPaid?: number;
  tenant: { name: string; taxId?: string; email: string; phone?: string };
  customer: CustomerData;
  order?: {
    quote?: {
      items: ReportItem[];
    };
  };
}
