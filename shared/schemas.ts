import { z } from 'zod';

export const ManifestSchema = z.object({
  formatVersion: z.number().int().positive(),
  appVersion: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  fileId: z.string().min(1),
});

export const CapabilityStatusSchema = z.enum([
  'not-licensed',
  'no-intent',
  'not-in-use',
  'planning',
  'implementing',
  'in-use',
]);

export const CapabilityMapStateSchema = z.object({
  categoryEnabled: z.record(z.string(), z.boolean()),
  capabilityStatus: z.record(z.string(), CapabilityStatusSchema),
  capabilityNotes: z.record(z.string(), z.string()),
});

export const CustomerInfoSchema = z.object({
  name: z.string(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
});

export const DocumentSchema = z.object({
  customer: CustomerInfoSchema,
  capabilityMap: CapabilityMapStateSchema,
});

export class PamapValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(message: string, issues: { path: string; message: string }[]) {
    super(message);
    this.name = 'PamapValidationError';
    this.issues = issues;
  }
}

export function formatZodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? '(root)' : issue.path.join('.'),
    message: issue.message,
  }));
}
