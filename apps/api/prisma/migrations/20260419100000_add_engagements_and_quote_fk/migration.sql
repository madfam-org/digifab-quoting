-- Phase B-Cotiza Consumer: promote engagement linkage from metadata JSON to
-- a first-class Engagement projection + FK on Quote.
--
-- Engagement is a projection (not the source of truth) of PhyndCRM's
-- engagement aggregate. phyndcrmEngagementId is the canonical join key.
-- Cotiza auto-creates a row on first use; an outbound webhook from
-- PhyndCRM (later work) will keep the projection in sync beyond creation.

CREATE TABLE "Engagement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "phyndcrmEngagementId" TEXT NOT NULL,
  "projectName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "contactId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- phyndcrmEngagementId is globally unique (PhyndCRM issues it);
-- no need for a composite with tenant — but we keep tenantId for
-- row-level tenant isolation per Cotiza convention.
CREATE UNIQUE INDEX "Engagement_phyndcrmEngagementId_key"
  ON "Engagement"("phyndcrmEngagementId");

CREATE INDEX "Engagement_tenantId_idx" ON "Engagement"("tenantId");
CREATE INDEX "Engagement_status_idx" ON "Engagement"("status");

ALTER TABLE "Engagement"
  ADD CONSTRAINT "Engagement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Quote.engagementId — nullable FK. Existing quotes without an
-- engagement stay as-is.
ALTER TABLE "Quote" ADD COLUMN "engagementId" TEXT;

CREATE INDEX "Quote_engagementId_idx" ON "Quote"("engagementId");

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: surface any engagementId buried in Quote.metadata.
-- Runs inside the migration so the data move happens atomically with
-- the schema change.
--
-- Step 1: create Engagement rows for each unique (tenantId,
-- phyndcrmEngagementId) pair found in metadata.
INSERT INTO "Engagement" (
  "id", "tenantId", "phyndcrmEngagementId", "status", "metadata",
  "lastSyncedAt", "createdAt", "updatedAt"
)
SELECT
  'eng_' || REPLACE(gen_random_uuid()::text, '-', ''),
  sub."tenantId",
  sub."phyndcrmEngagementId",
  'active',
  '{"backfilled": true}'::jsonb,
  NOW(),
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT
    q."tenantId",
    q."metadata"->>'phyndcrmEngagementId' AS "phyndcrmEngagementId"
  FROM "Quote" q
  WHERE q."metadata" ? 'phyndcrmEngagementId'
    AND q."metadata"->>'phyndcrmEngagementId' IS NOT NULL
    AND length(q."metadata"->>'phyndcrmEngagementId') > 0
) sub
ON CONFLICT ("phyndcrmEngagementId") DO NOTHING;

-- Step 2: point Quote.engagementId at the newly-created Engagement.
UPDATE "Quote" q
SET "engagementId" = e."id"
FROM "Engagement" e
WHERE q."metadata"->>'phyndcrmEngagementId' = e."phyndcrmEngagementId"
  AND q."metadata"->>'phyndcrmEngagementId' IS NOT NULL
  AND q."engagementId" IS NULL;
