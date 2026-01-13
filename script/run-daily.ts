// script/run-daily.ts
import "dotenv/config";
import { db } from "../server/db";
import { emailService } from "../server/email";
import { topics, summaries } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  console.log("🚀 Starting daily email summary job...");

  try {
    // 1. Fetch all topics that have an email address
    const allTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.email, topics.email));

    const topicsWithEmail = allTopics.filter(topic => topic.email && topic.email.trim() !== '');

    if (topicsWithEmail.length === 0) {
      console.log("⚠️  No topics with email addresses found. Exiting.");
      process.exit(0);
    }

    console.log(`📧 Found ${topicsWithEmail.length} topic(s) with email addresses`);

    let successCount = 0;
    let failureCount = 0;

    // 2. For each topic, get the most recent summary and send email
    for (const topic of topicsWithEmail) {
      try {
        console.log(`\n📝 Processing topic: "${topic.name}" (ID: ${topic.id})`);

        // Get the most recent summary for this topic
        const [latestSummary] = await db
          .select()
          .from(summaries)
          .where(eq(summaries.topicId, topic.id))
          .orderBy(desc(summaries.createdAt))
          .limit(1);

        if (!latestSummary) {
          console.log(`   ⚠️  No summary found for topic "${topic.name}". Skipping.`);
          continue;
        }

        console.log(`   📄 Found summary from ${latestSummary.createdAt}`);

        // Check if email service is configured
        if (!emailService.isConfigured()) {
          console.error("   ❌ Email service is not configured. Please set EMAIL_* environment variables.");
          failureCount++;
          continue;
        }

        // 3. Send the email
        await emailService.sendReportEmail(
          topic.email!,
          topic.name,
          latestSummary.content,
          [] // Sources array - could be extracted from content or stored separately
        );

        console.log(`   ✅ Email sent successfully to ${topic.email}`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Failed to process topic "${topic.name}":`, error);
        failureCount++;
      }
    }

    // 4. Print summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 Daily Email Summary Report:");
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📋 Total: ${topicsWithEmail.length}`);
    console.log("=".repeat(50));

    if (failureCount > 0) {
      console.log("\n⚠️  Some emails failed to send. Check the logs above for details.");
      process.exit(1);
    }

    console.log("\n✅ Daily email job completed successfully!");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ Fatal error in daily email job:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await db.$client.end();
  }
}

main();