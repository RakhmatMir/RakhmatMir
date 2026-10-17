import { z } from "zod";

/** Zod schema for the Foundation School export JSON (fields used by seed). */
export const sourceJsonSchema = z
  .object({
    school: z
      .object({
        name: z.string(),
        github_upload_enabled: z.boolean().optional(),
        github_token: z.string().optional(),
        telemetry_retention_hours: z.number().optional(),
        submissions_reset_generation: z.number().optional(),
      })
      .passthrough(),
    class: z
      .object({
        id: z.union([z.string(), z.number()]),
        name: z.string(),
        bundle_time_limit_minutes: z.number().optional(),
        bundle_published: z.boolean().optional(),
        exam_date: z.string().optional(),
        phase: z.string().optional(),
        catalog_key: z.string().optional(),
      })
      .passthrough(),
    subjects: z
      .array(
        z.object({
          id: z.union([z.string(), z.number()]),
          name: z.string(),
        }).passthrough(),
      )
      .optional(),
    students: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          login: z.string(),
          password: z.string(),
          class_id: z.union([z.string(), z.number()]).optional(),
          status: z.string().optional(),
          results: z.record(z.string(), z.unknown()).optional(),
        })
        .passthrough(),
    ),
    exams: z.array(
      z
        .object({
          id: z.number(),
          subject_id: z.union([z.string(), z.number()]).optional(),
          subject: z.string().optional(),
          title: z.string(),
          date: z.string().optional(),
          duration_minutes: z.number(),
          published_to_students: z.boolean().optional(),
          questions: z.array(
            z
              .object({
                id: z.union([z.string(), z.number()]),
                text: z.string(),
                options: z.array(z.string()),
                correct_index: z.number(),
                needs_review: z.boolean().optional(),
                explanation: z.string().optional(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
    admin: z
      .object({
        login: z.string(),
        password: z.string(),
      })
      .optional(),
  })
  .passthrough();

export type SourceJson = z.infer<typeof sourceJsonSchema>;

export const SOURCE_JSON_LOCATIONS = [
  "source-materials/foundation-school.json",
  "source-materials/data.json",
] as const;
