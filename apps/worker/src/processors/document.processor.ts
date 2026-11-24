import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentRepository } from "@flowpilot/db/repositories";
import type { DocumentMediaType } from "@flowpilot/db/client";
import {
  createDocumentTextKey,
  type ReturnTypeOfWorkerStorage,
} from "../adapters/object-storage.js";
import { workerLogger } from "../logger.js";

const MAX_FILE_BYTES = 20_000_000;
const MAX_NATIVE_PDF_PAGES = 100;
const MAX_EXTRACTED_CHARACTERS = 300_000;

export class DocumentValidationError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_SIZE_MISMATCH"
      | "DOCUMENT_CORRUPT"
      | "DOCUMENT_ENCRYPTED"
      | "DOCUMENT_UNSUPPORTED"
      | "DOCUMENT_PAGE_LIMIT"
      | "DOCUMENT_TEXT_LIMIT"
      | "DOCUMENT_NO_TEXT",
  ) {
    super(code);
    this.name = "DocumentValidationError";
  }
}

export interface ExtractedDocument {
  readonly checksum: string;
  readonly pageCount: number | null;
  readonly text: string;
  readonly textCharacterCount: number;
}

function countCodePoints(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; ) {
    count += 1;
    if (count > MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentValidationError("DOCUMENT_TEXT_LIMIT");
    }
    const codePoint = text.codePointAt(index);
    index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
  }
  return count;
}

function ensureText(text: string): { text: string; textCharacterCount: number } {
  const normalized = text.replaceAll("\u0000", "").trim();
  const textCharacterCount = countCodePoints(normalized);
  if (textCharacterCount === 0) {
    throw new DocumentValidationError("DOCUMENT_NO_TEXT");
  }
  return { text: normalized, textCharacterCount };
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

async function extractPdf(bytes: Uint8Array): Promise<{
  pageCount: number;
  text: string;
}> {
  if (!hasPdfSignature(bytes)) {
    throw new DocumentValidationError("DOCUMENT_UNSUPPORTED");
  }
  const loadingTask = getDocument({ data: Uint8Array.from(bytes) });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_NATIVE_PDF_PAGES) {
      throw new DocumentValidationError("DOCUMENT_PAGE_LIMIT");
    }
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      page.cleanup();
    }
    return { pageCount: document.numPages, text: pages.join("\n") };
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "PasswordException"
    ) {
      throw new DocumentValidationError("DOCUMENT_ENCRYPTED");
    }
    throw new DocumentValidationError("DOCUMENT_CORRUPT");
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractDocument(
  mediaType: DocumentMediaType,
  bytes: Uint8Array,
  expectedByteSize: number,
): Promise<ExtractedDocument> {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_FILE_BYTES ||
    bytes.byteLength !== expectedByteSize
  ) {
    throw new DocumentValidationError("DOCUMENT_SIZE_MISMATCH");
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  let text: string;
  let pageCount: number | null = null;
  try {
    if (mediaType === "pdf") {
      const extracted = await extractPdf(bytes);
      text = extracted.text;
      pageCount = extracted.pageCount;
    } else if (mediaType === "docx") {
      if (!hasZipSignature(bytes)) {
        throw new DocumentValidationError("DOCUMENT_UNSUPPORTED");
      }
      const extracted = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = extracted.value;
    } else {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("DOCUMENT_CORRUPT");
  }

  return {
    checksum,
    pageCount,
    ...ensureText(text),
  };
}

export function createDocumentValidationProcessor(
  repository: DocumentRepository,
  storage: ReturnTypeOfWorkerStorage,
) {
  return async (job: {
    readonly documentId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<void> => {
    const context = { userId: job.userId, workspaceId: job.workspaceId };
    const document = await repository.findById(context, job.documentId);
    if (!document || document.status !== "validating") return;

    try {
      const bytes = await storage.readObject(document.sourceObjectKey);
      const extraction = await extractDocument(
        document.mediaType,
        bytes,
        document.byteSize,
      );
      const textObjectKey = createDocumentTextKey(
        job.workspaceId,
        job.documentId,
      );
      await storage.putObject({
        key: textObjectKey,
        body: new TextEncoder().encode(extraction.text),
        mediaType: "text/plain; charset=utf-8",
      });
      const markedReady = await repository.markReady(
        context,
        job.documentId,
        {
          checksum: extraction.checksum,
          pageCount: extraction.pageCount,
          textCharacterCount: extraction.textCharacterCount,
          textObjectKey,
        },
      );
      if (!markedReady) await storage.deleteObject(textObjectKey);
    } catch (error) {
      if (!(error instanceof DocumentValidationError)) throw error;
      await repository.markFailed(context, job.documentId, error.code);
      workerLogger.warn(
        {
          documentId: job.documentId,
          workspaceId: job.workspaceId,
          failureCode: error.code,
        },
        "Document validation failed",
      );
    }
  };
}
