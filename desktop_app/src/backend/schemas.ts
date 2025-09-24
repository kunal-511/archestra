import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

export const DetailedErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export const StringNumberIdSchema = z.string().transform((val) => parseInt(val, 10));
