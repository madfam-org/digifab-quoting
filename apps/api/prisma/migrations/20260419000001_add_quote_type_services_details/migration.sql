-- Services-mode extension: feature-flagged, additive, zero risk to existing fab flow.
-- Both columns are nullable/defaulted so existing Quote/QuoteItem rows
-- remain valid and fab-mode remains the default when creating new quotes.

ALTER TABLE "Quote"
  ADD COLUMN "quoteType" TEXT NOT NULL DEFAULT 'fab';

ALTER TABLE "QuoteItem"
  ADD COLUMN "servicesDetails" JSONB;

-- Index by quote type so services-quote listing queries stay fast once
-- the feature is exposed to more tenants.
CREATE INDEX "Quote_quoteType_idx" ON "Quote"("quoteType");
