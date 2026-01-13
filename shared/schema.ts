import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const researchProfiles = pgTable("research_profiles", {
  id: serial("id").primaryKey(),
  topicId: serial("topic_id").references(() => topics.id),
  content: jsonb("content").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const summaries = pgTable("summaries", {
  id: serial("id").primaryKey(),
  topicId: serial("topic_id").references(() => topics.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTopicSchema = createInsertSchema(topics).pick({
  name: true,
  email: true,
});

export const insertProfileSchema = createInsertSchema(researchProfiles).pick({
  topicId: true,
  content: true,
});

export const insertSummarySchema = createInsertSchema(summaries).pick({
  topicId: true,
  content: true,
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type ResearchProfile = typeof researchProfiles.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
