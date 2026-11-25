import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const JwtHeaderSchema = z
  .object({
    alg: z.literal("HS256"),
    typ: z.literal("JWT"),
  })
  .strict();

const BaseJwtClaimsSchema = z.object({
  iss: z.string().min(1),
  aud: z.string().min(1),
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

const AccessJwtClaimsSchema = BaseJwtClaimsSchema.extend({
  token_type: z.literal("access"),
  email: z.string().email(),
}).strict();

const RefreshJwtClaimsSchema = BaseJwtClaimsSchema.extend({
  token_type: z.literal("refresh"),
  familyId: z.string().uuid(),
}).strict();

export type AccessJwtClaims = z.infer<typeof AccessJwtClaimsSchema>;
export type RefreshJwtClaims = z.infer<typeof RefreshJwtClaimsSchema>;

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function encodeBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function decodeJsonSegment(segment: string): unknown {
  const decoded = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(decoded) as unknown;
}

function signSegment(signingInput: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(signingInput, "utf8").digest();
}

export function signJwt(
  payload: AccessJwtClaims | RefreshJwtClaims,
  secret: string,
): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = signSegment(signingInput, secret).toString("base64url");
  return `${signingInput}.${signature}`;
}

function verifyRawJwt(
  token: string,
  options: {
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly now: Date;
  },
): unknown | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (!headerSegment || !payloadSegment || !signatureSegment) return null;

  let headerJson: unknown;
  let payloadJson: unknown;
  try {
    headerJson = decodeJsonSegment(headerSegment);
    payloadJson = decodeJsonSegment(payloadSegment);
  } catch {
    return null;
  }

  if (!JwtHeaderSchema.safeParse(headerJson).success) return null;

  const expectedSignature = signSegment(
    `${headerSegment}.${payloadSegment}`,
    options.secret,
  );
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    return null;
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  if (
    typeof payloadJson !== "object" ||
    payloadJson === null ||
    !("iss" in payloadJson) ||
    !("aud" in payloadJson) ||
    !("exp" in payloadJson)
  ) {
    return null;
  }

  const record = payloadJson as { iss: unknown; aud: unknown; exp: unknown };
  if (record.iss !== options.issuer || record.aud !== options.audience) {
    return null;
  }
  const nowSeconds = Math.floor(options.now.getTime() / 1_000);
  if (typeof record.exp !== "number" || record.exp <= nowSeconds) {
    return null;
  }

  return payloadJson;
}

export function verifyAccessJwt(
  token: string,
  options: {
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly now?: Date;
  },
): AccessJwtClaims | null {
  const payload = verifyRawJwt(token, {
    ...options,
    now: options.now ?? new Date(),
  });
  if (!payload) return null;
  const parsed = AccessJwtClaimsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function verifyRefreshJwt(
  token: string,
  options: {
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly now?: Date;
  },
): RefreshJwtClaims | null {
  const payload = verifyRawJwt(token, {
    ...options,
    now: options.now ?? new Date(),
  });
  if (!payload) return null;
  const parsed = RefreshJwtClaimsSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
