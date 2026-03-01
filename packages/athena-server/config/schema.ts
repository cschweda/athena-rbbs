import { z } from 'zod';

export const athenaConfigSchema = z.object({
  network: z.object({
    name: z.string().default('Athena RBBS Network'),
    maxRegisteredBoards: z.number().int().min(1).max(100).default(20),
    heartbeatInterval: z.number().int().min(10000).default(60_000),
    heartbeatTimeout: z.number().int().min(30000).default(180_000),
    requireApproval: z.boolean().default(true),
  }),

  admin: z.object({
    networkSysOp: z.string().min(1),
    contactEmail: z.string().email().optional(),
  }),
});

export type AthenaConfig = z.infer<typeof athenaConfigSchema>;

export function defineAthenaConfig(config: z.input<typeof athenaConfigSchema>): AthenaConfig {
  const result = athenaConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid athena.config.ts:\n${issues}`);
  }
  return result.data;
}
