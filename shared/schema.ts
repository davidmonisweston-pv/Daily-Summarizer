import { pgTable, text, serial, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"), // "user" or "admin"
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
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

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  displayName: true,
  role: true,
  emailVerified: true,
});

export const insertVerificationTokenSchema = createInsertSchema(verificationTokens).pick({
  userId: true,
  token: true,
  expiresAt: true,
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

export const insertSettingSchema = createInsertSchema(settings).pick({
  key: true,
  value: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type InsertVerificationToken = z.infer<typeof insertVerificationTokenSchema>;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type ResearchProfile = typeof researchProfiles.$inferSelect;
export type Summary = typeof summaries.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
