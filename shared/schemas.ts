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

export const CustomCapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const CustomCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().optional(),
  capabilities: z.array(CustomCapabilitySchema).default([]),
});

export const CapabilityMapStateSchema = z.object({
  categoryEnabled: z.record(z.string(), z.boolean()),
  capabilityStatus: z.record(z.string(), CapabilityStatusSchema),
  capabilityNotes: z.record(z.string(), z.string()),
  categoryOrder: z.array(z.string()).default([]),
  customCategories: z.array(CustomCategorySchema).default([]),
  customCapabilities: z.record(z.string(), z.array(CustomCapabilitySchema)).default({}),
});

export const CustomerInfoSchema = z.object({
  name: z.string(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
});

// ---- Adoption Roadmap schemas ---------------------------------------------

export const RoadmapColumnSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
});

export const RoadmapSwimlaneSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
});

export const RoadmapCardSchema = z.object({
  id: z.string().min(1),
  capabilityId: z.string().min(1),
  columnId: z.string().min(1),
  swimlaneId: z.string().nullable(),
});

export const AdoptionRoadmapSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  columns: z.array(RoadmapColumnSchema).default([]),
  swimlanes: z.array(RoadmapSwimlaneSchema).default([]),
  cards: z.array(RoadmapCardSchema).default([]),
});

// ---------------------------------------------------------------------------

export const DocumentSchema = z.object({
  customer: CustomerInfoSchema,
  capabilityMap: CapabilityMapStateSchema,
  adoptionRoadmaps: z.array(AdoptionRoadmapSchema).default([]),
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
