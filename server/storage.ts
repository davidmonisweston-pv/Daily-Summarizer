import { db } from "./db";
import { topics, type InsertTopic, type Topic } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getTopics(userId: number): Promise<Topic[]>;
  createTopic(topic: InsertTopic): Promise<Topic>;
}

export class DatabaseStorage implements IStorage {
  async getTopics(userId: number): Promise<Topic[]> {
    return await db.select().from(topics).where(eq(topics.userId, userId));
  }

  async createTopic(insertTopic: InsertTopic): Promise<Topic> {
    const [topic] = await db.insert(topics).values(insertTopic).returning();
    return topic;
  }
}

export const storage = new DatabaseStorage();
