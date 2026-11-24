import { describe, expect, it } from "vitest";
import {
  DocumentValidationError,
  extractDocument,
} from "../src/processors/document.processor.js";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: ReadonlyArray<{ name: string; content: string }>): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const content = Buffer.from(entry.content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + name.length + content.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    content.copy(local, 30 + name.length);
    localRecords.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function createDocx(text: string): Buffer {
  return createZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    },
    {
      name: "word/document.xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body>` +
        "</w:document>",
    },
  ]);
}

function createPdf(pageCount: number): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from(
      { length: pageCount },
      (_value, index) => `${4 + index * 2} 0 R`,
    ).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const stream = `BT /F1 12 Tf 72 720 Td (Page ${index + 1} text) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    source += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(source);
}

describe("document extraction and validation", () => {
  it("extracts UTF-8 text and counts Unicode code points", async () => {
    const bytes = Buffer.from("Due date: 2026-12-01 ✅", "utf8");
    const result = await extractDocument("txt", bytes, bytes.length);
    expect(result.text).toContain("2026-12-01");
    expect(result.textCharacterCount).toBe(22);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pageCount).toBeNull();
  });

  it("extracts raw text from DOCX", async () => {
    const bytes = createDocx("Action item: send the report");
    const result = await extractDocument("docx", bytes, bytes.length);
    expect(result.text).toContain("send the report");
  });

  it("extracts PDF text and rejects documents over the native page limit", async () => {
    const bytes = createPdf(1);
    const result = await extractDocument("pdf", bytes, bytes.length);
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Page 1 text");

    const tooManyPages = createPdf(101);
    await expect(
      extractDocument("pdf", tooManyPages, tooManyPages.length),
    ).rejects.toMatchObject({
      code: "DOCUMENT_PAGE_LIMIT",
    });
  });

  it("rejects corrupt, empty, size-mismatched, and over-limit text inputs", async () => {
    await expect(extractDocument("pdf", Buffer.from("not pdf"), 7)).rejects.toMatchObject({
      code: "DOCUMENT_UNSUPPORTED",
    });
    await expect(extractDocument("txt", Buffer.alloc(0), 0)).rejects.toBeInstanceOf(
      DocumentValidationError,
    );
    await expect(
      extractDocument("txt", Buffer.from("x"), 2),
    ).rejects.toMatchObject({ code: "DOCUMENT_SIZE_MISMATCH" });
    await expect(
      extractDocument("txt", Buffer.from("x".repeat(300_001)), 300_001),
    ).rejects.toMatchObject({ code: "DOCUMENT_TEXT_LIMIT" });
  });
});
