import { ZodError, type ZodType } from "zod";
import { HttpError } from "./errors/api-error.js";

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new HttpError(
      422,
      "INVALID_INPUT",
      "Request data failed validation.",
    );
  }
}
