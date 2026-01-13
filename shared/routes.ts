import { z } from 'zod';
import { insertTopicSchema, topics, researchProfiles, summaries } from './schema';

export const api = {
  topics: {
    list: {
      method: 'GET' as const,
      path: '/api/topics',
      responses: {
        200: z.array(z.custom<typeof topics.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/topics',
      input: insertTopicSchema,
      responses: {
        201: z.custom<typeof topics.$inferSelect>(),
      },
    },
  }
};
