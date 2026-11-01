import { z } from 'zod';

export const DatasetSchema = z
  .array(z.object({ task: z.string().min(1) }))
  .min(1);

export const AnswerSchema = z.object({ agentText: z.string() }).strict();

export const EvaluationSchema = z
  .object({
    strengths: z.array(z.string().min(1)).min(1).max(3),
    weaknesses: z.array(z.string().min(1)).min(1).max(3),
    reasoning: z.string().min(1),
    score: z.number().min(1).max(10),
  })
  .strict();

export type EvaluationResult = z.infer<typeof EvaluationSchema> & {
  task: string;
  response: string;
};
