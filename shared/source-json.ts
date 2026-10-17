import { z } from "zod";

const questionSchema = z.object({
  text: z.string(),
  options: z.array(z.string()),
  correct_index: z.number(),
});

export const sourceJsonSchema = z.object({
  school_name: z.string(),
  classes: z.array(
    z.object({
      class_name: z.string(),
      student_count: z.number(),
      test_count: z.number(),
    }),
  ),
  class_schedules: z.record(
    z.string(),
    z.object({
      total_minutes: z.number(),
      bundle_published: z.boolean(),
    }),
  ),
  submissions_reset_generation: z.number(),
  submissions_retention_hours: z.number(),
  submissions_upload: z.object({
    enabled: z.boolean(),
    github_token: z.string(),
  }),
  subjects: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      test_count: z.number(),
    }),
  ),
  exams: z.array(
    z.object({
      id: z.number(),
      class_name: z.string(),
      subject_code: z.string(),
      subject_title: z.string(),
      title: z.string(),
      control_date: z.string(),
      duration_minutes: z.number(),
      published_to_students: z.boolean(),
      question_count: z.number(),
      questions: z.array(questionSchema),
      phase: z.string().optional(),
      catalog_key: z.string().optional(),
      requires_teacher_publish: z.boolean().optional(),
    }),
  ),
  rosters: z.record(
    z.string(),
    z.array(
      z.object({
        id: z.number(),
        full_name: z.string(),
        status: z.string(),
        score_percent: z.number().nullable(),
      }),
    ),
  ),
  demo_users: z.array(
    z.object({
      id: z.number(),
      login: z.string(),
      password: z.string(),
      full_name: z.string(),
      role: z.enum(["admin", "student"]),
      class_name: z.string().nullable(),
    }),
  ),
});

export type SourceJson = z.infer<typeof sourceJsonSchema>;

export const SOURCE_JSON_LOCATIONS = [
  "source-materials/foundation-school.json",
  "source-materials/data.json",
] as const;
