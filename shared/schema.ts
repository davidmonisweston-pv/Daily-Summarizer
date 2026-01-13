import { pgTable, text, serial, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  microsoftId: text("microsoft_id").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"), // "user" or "admin"
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const allowedDomains = pgTable("allowed_domains", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  addedBy: integer("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
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

export const insertUserSchema = createInsertSchema(users).pick({
  microsoftId: true,
  email: true,
  displayName: true,
  role: true,
});

export const insertAllowedDomainSchema = createInsertSchema(allowedDomains).pick({
  domain: true,
  addedBy: true,
});

export const insertTopicSchema = createInsertSchema(topics).pick({
  userId: true,
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AllowedDomain = typeof allowedDomains.$inferSelect;
export type InsertAllowedDomain = z.infer<typeof insertAllowedDomainSchema>;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type ResearchProfile = typeof researchProfiles.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
