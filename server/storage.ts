import { db } from "./db";
import { topics, type InsertTopic, type Topic } from "@shared/schema";

export interface IStorage {
  getTopics(): Promise<Topic[]>;
  createTopic(topic: InsertTopic): Promise<Topic>;
}

export class DatabaseStorage implements IStorage {
  async getTopics(): Promise<Topic[]> {
    return await db.select().from(topics);
  }

  async createTopic(insertTopic: InsertTopic): Promise<Topic> {
    const [topic] = await db.insert(topics).values(insertTopic).returning();
    return topic;
  }
}

export const storage = new DatabaseStorage();
