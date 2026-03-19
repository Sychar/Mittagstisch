import { z } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const parseOrThrow = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.flatten();
    const fieldErrors = details.fieldErrors || {};
    const summary = Object.entries(fieldErrors)
      .filter((entry): entry is [string, string[]] => {
        const value = entry[1];
        return Array.isArray(value) && value.length > 0;
      })
      .map(([key, value]) => `${key}: ${value.join(", ")}`)
      .join(" | ");
    const message = summary ? `Invalid request: ${summary}` : "Invalid request";
    throw new HttpError(400, "INVALID_INPUT", message, details);
  }
  return result.data;
};
