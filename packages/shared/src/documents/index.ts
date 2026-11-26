import type { DocumentDto } from "../schemas/resources.js";

export type SupportedDocumentMediaType = DocumentDto["mediaType"];

export type DocumentFileFailureCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "SIZE_MISMATCH"
  | "TYPE_MISMATCH"
  | "UNSUPPORTED_CONTENT";

export class DocumentFileValidationError extends Error {
  constructor(
    readonly code: DocumentFileFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentFileValidationError";
  }
}

const extensionByMediaType: Record<SupportedDocumentMediaType, "pdf" | "docx" | "txt"> =
  {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "text/plain": "txt",
  };

const mediaTypeByExtension: Record<string, SupportedDocumentMediaType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export function documentExtensionForMediaType(
  mediaType: SupportedDocumentMediaType,
): "pdf" | "docx" | "txt" {
  return extensionByMediaType[mediaType];
}

export function documentMediaTypeForExtension(
  extension: string,
): SupportedDocumentMediaType | null {
  return mediaTypeByExtension[extension.toLowerCase()] ?? null;
}

export function filenameExtension(filename: string): string | null {
  const separator = filename.lastIndexOf(".");
  if (separator <= 0 || separator === filename.length - 1) return null;
  return filename.slice(separator + 1).toLowerCase();
}

export function assertDocumentFilename(
  filename: string,
  mediaType: SupportedDocumentMediaType,
): void {
  if (filenameExtension(filename) !== documentExtensionForMediaType(mediaType)) {
    throw new DocumentFileValidationError(
      "TYPE_MISMATCH",
      "The filename extension does not match the declared media type.",
    );
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(bytes.subarray(0, 5)) === "%PDF-";
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

function containsAscii(bytes: Uint8Array, value: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(value, "latin1"));
}

export interface DocumentBytesValidationInput {
  readonly bytes: Uint8Array;
  readonly mediaType: SupportedDocumentMediaType;
  readonly byteSize: number;
  readonly maxBytes: number;
}

/**
 * Validates the declared size, configured storage limit, and the actual file
 * signature server-side. The worker repeats deep extraction/validation before
 * any document becomes ready.
 */
export function assertDocumentBytes(input: DocumentBytesValidationInput): void {
  const { bytes, mediaType, byteSize, maxBytes } = input;
  if (bytes.byteLength === 0) {
    throw new DocumentFileValidationError("EMPTY_FILE", "The file is empty.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new DocumentFileValidationError(
      "FILE_TOO_LARGE",
      "The file exceeds the configured document size limit.",
    );
  }
  if (bytes.byteLength !== byteSize) {
    throw new DocumentFileValidationError(
      "SIZE_MISMATCH",
      "The uploaded file size did not match the declared size.",
    );
  }

  switch (mediaType) {
    case "application/pdf":
      if (!hasPdfSignature(bytes)) {
        throw new DocumentFileValidationError(
          "UNSUPPORTED_CONTENT",
          "The uploaded file is not a valid PDF document.",
        );
      }
      return;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      if (
        !hasZipSignature(bytes) ||
        !containsAscii(bytes, "[Content_Types].xml") ||
        !containsAscii(bytes, "word/")
      ) {
        throw new DocumentFileValidationError(
          "UNSUPPORTED_CONTENT",
          "The uploaded file is not a valid DOCX document.",
        );
      }
      return;
    case "text/plain": {
      let decoded: string;
      try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new DocumentFileValidationError(
          "UNSUPPORTED_CONTENT",
          "The uploaded text file is not valid UTF-8.",
        );
      }
      if (decoded.trim().length === 0) {
        throw new DocumentFileValidationError(
          "UNSUPPORTED_CONTENT",
          "The uploaded text file does not contain any text.",
        );
      }
      return;
    }
  }
}
