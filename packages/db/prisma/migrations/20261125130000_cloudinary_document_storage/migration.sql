-- Replace S3-compatible object keys with Cloudinary public IDs and explicit
-- resource/delivery metadata. Existing S3 objects are not copied automatically;
-- documents uploaded before this migration must be re-uploaded to Cloudinary.

ALTER TABLE "Document" RENAME COLUMN "sourceObjectKey" TO "sourcePublicId";
ALTER TABLE "Document" RENAME COLUMN "textObjectKey" TO "textPublicId";

ALTER INDEX "Document_sourceObjectKey_key" RENAME TO "Document_sourcePublicId_key";
ALTER INDEX "Document_textObjectKey_key" RENAME TO "Document_textPublicId_key";

ALTER TABLE "Document"
  DROP CONSTRAINT "Document_storage_metadata_nonempty_check";

ALTER TABLE "Document"
  ADD COLUMN "sourceResourceType" TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN "sourceDeliveryType" TEXT NOT NULL DEFAULT 'authenticated',
  ADD COLUMN "sourceFormat" TEXT,
  ADD COLUMN "sourceAssetId" TEXT,
  ADD COLUMN "sourceVersion" INTEGER,
  ADD COLUMN "sourceUploadedAt" TIMESTAMPTZ(6),
  ADD COLUMN "textResourceType" TEXT,
  ADD COLUMN "textDeliveryType" TEXT,
  ADD COLUMN "textFormat" TEXT;

UPDATE "Document"
SET "sourceFormat" = CASE "mediaType"
  WHEN 'pdf' THEN 'pdf'
  WHEN 'docx' THEN 'docx'
  ELSE 'txt'
END
WHERE "sourceFormat" IS NULL;

UPDATE "Document"
SET
  "textResourceType" = 'raw',
  "textDeliveryType" = 'authenticated',
  "textFormat" = 'txt'
WHERE "textPublicId" IS NOT NULL;

ALTER TABLE "Document" ALTER COLUMN "sourceFormat" SET NOT NULL;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_storage_metadata_nonempty_check"
  CHECK (
    char_length("sourcePublicId") > 0 AND
    char_length("checksum") > 0 AND
    ("textPublicId" IS NULL OR char_length("textPublicId") > 0)
  ),
  ADD CONSTRAINT "Document_cloudinary_metadata_check"
  CHECK (
    "sourceResourceType" = 'raw' AND
    "sourceDeliveryType" = 'authenticated' AND
    char_length("sourceFormat") BETWEEN 1 AND 16 AND
    (
      "textPublicId" IS NULL OR (
        "textResourceType" = 'raw' AND
        "textDeliveryType" = 'authenticated' AND
        "textFormat" IS NOT NULL AND
        char_length("textFormat") BETWEEN 1 AND 16
      )
    )
  );

ALTER TABLE "ExecutionArtifact" RENAME COLUMN "objectKey" TO "publicId";

ALTER INDEX "ExecutionArtifact_objectKey_key" RENAME TO "ExecutionArtifact_publicId_key";

ALTER TABLE "ExecutionArtifact"
  DROP CONSTRAINT "ExecutionArtifact_objectKey_nonempty_check";

ALTER TABLE "ExecutionArtifact"
  ADD COLUMN "resourceType" TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN "deliveryType" TEXT NOT NULL DEFAULT 'authenticated',
  ADD COLUMN "format" TEXT;

UPDATE "ExecutionArtifact" SET "format" = 'json' WHERE "format" IS NULL;

ALTER TABLE "ExecutionArtifact" ALTER COLUMN "format" SET NOT NULL;

ALTER TABLE "ExecutionArtifact"
  ADD CONSTRAINT "ExecutionArtifact_publicId_nonempty_check"
  CHECK (char_length("publicId") > 0),
  ADD CONSTRAINT "ExecutionArtifact_cloudinary_metadata_check"
  CHECK (
    "resourceType" = 'raw' AND
    "deliveryType" = 'authenticated' AND
    "format" = 'json'
  );
