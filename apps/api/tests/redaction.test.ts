import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRedactedLogger } from "../src/middleware/logger.js";

describe("API log redaction", () => {
  it("redacts prompts, document/report content, credentials, and provider secrets", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createRedactedLogger(destination);

    logger.info(
      {
        prompt: "private-prompt-77",
        documentText: "private-document-88",
        reportContent: "private-report-99",
        password: "private-password",
        token: "private-session-token",
        apiKey: "private-api-key",
        OPENROUTER_API_KEY: "private-provider-key",
        req: {
          headers: {
            authorization: "private-authorization",
            cookie: "private-cookie",
          },
        },
      },
      "request handled",
    );
    await new Promise<void>((resolve, reject) =>
      logger.flush((error) => (error ? reject(error) : resolve())),
    );

    for (const secret of [
      "private-prompt-77",
      "private-document-88",
      "private-report-99",
      "private-password",
      "private-session-token",
      "private-api-key",
      "private-provider-key",
      "private-authorization",
      "private-cookie",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(9);
  });
});
