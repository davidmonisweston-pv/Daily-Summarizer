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
  },
  email: {
    send: {
      method: 'POST' as const,
      path: '/api/email/send',
      input: z.object({
        to: z.string().email(),
        topicName: z.string(),
        summary: z.string(),
        sources: z.array(z.object({
          title: z.string(),
          url: z.string(),
        })).optional(),
      }),
      responses: {
        200: z.object({
          success: z.boolean(),
          messageId: z.string().optional(),
        }),
      },
    },
  }
};
