/**
 * Coforma Integration Types
 *
 * Types for Coforma Studio's Customer Advisory Board API.
 * Owned by Cotiza - update when Coforma API changes.
 */

// ============================================================================
// Enums
// ============================================================================

export type FeedbackType = 'IDEA' | 'BUG' | 'REQUEST' | 'RESEARCH_INSIGHT';
export type FeedbackStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'SHIPPED'
  | 'CLOSED';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================================
// Feedback Types
// ============================================================================

export interface Feedback {
  id: string;
  cabId: string;
  memberId: string;
  memberName: string;
  type: FeedbackType;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  title: string;
  description: string;
  productArea: string | null;
  votes: number;
  hasVoted?: boolean;
  isAnonymous: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmitFeedbackParams {
  type: FeedbackType;
  title: string;
  description: string;
  productArea?: string;
  isAnonymous?: boolean;
  tags?: string[];
  context?: Record<string, unknown>;
}

// ============================================================================
// Product Feedback Summary
// ============================================================================

export interface ProductFeedbackSummary {
  productId: string;
  productName: string;
  totalFeedback: number;
  openItems: number;
  plannedItems: number;
  shippedItems: number;
  topRequests: Array<{
    id: string;
    title: string;
    votes: number;
    status: FeedbackStatus;
  }>;
  recentFeedback: Feedback[];
}

// ============================================================================
// Roadmap Types
// ============================================================================

export interface RoadmapItem {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  status: 'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'SHIPPED';
  quarter: string | null;
  productArea: string;
  linkedFeedbackCount: number;
  cabInfluenceScore: number;
  isPublic: boolean;
  releaseDate: string | null;
  createdAt: string;
  updatedAt: string;
}
