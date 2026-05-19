-- Adds notification_preference to signers so users can choose what kind of
-- document update emails they want. Default 'major' so existing rows keep
-- working without an explicit value.

ALTER TABLE "signers"
  ADD COLUMN "notification_preference" text NOT NULL DEFAULT 'major';
