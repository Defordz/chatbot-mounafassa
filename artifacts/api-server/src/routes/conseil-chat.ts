import { Router } from "express";
import { db } from "@workspace/db";
import {
  conseilChunksTable,
  conseilFeedbacksTable,
  conseilConfigTable,
  conseilDocumentsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import OpenAI from "openai";

const router = Router();
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

async function getConfig() {
  const rows = await db.select().from(conseilConfigTable).limit(1);
  if (rows.length === 0) {
    const [newConfig] = await db
      .insert(conseilConfigTable)
      .values({})
      .returning();
    return newConfig;
  }
  return rows[0];
}

router.get("/conseil/config", async (_req, res) => {
  try {
    const config = await getConfig();
    res.json({
      botName: config.botName,
      greeting: config.greeting,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load config" });
  }
});

router.post("/conseil/chat", async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const config = await getConfig();

    const queryEmbedding = await getEmbedding(message);

    const activeDocIds = await db
      .select({ id: conseilDocumentsTable.id })
      .from(conseilDocumentsTable)
      .where(eq(conseilDocumentsTable.active, true));

    const activeIds = activeDocIds.map((d) => d.id);
    let contextChunks: string[] = [];

    if (activeIds.length > 0) {
      const allChunks = await db
        .select({
          content: conseilChunksTable.content,
          embedding: conseilChunksTable.embedding,
        })
        .from(conseilChunksTable)
        .where(inArray(conseilChunksTable.documentId, activeIds));

      const scored = allChunks
        .filter((c) => c.embedding)
        .map((c) => ({
          content: c.content,
          score: cosineSimilarity(
            queryEmbedding,
            c.embedding as number[]
          ),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      contextChunks = scored.map((c) => c.content);
    }

    const contextText =
      contextChunks.length > 0
        ? `Base de connaissance :\n\n${contextChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`
        : "Aucun document disponible dans la base de connaissance.";

    const systemPrompt = `${config.systemPrompt}\n\n${contextText}`;

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
    });

    let fullResponse = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        const text = event.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, full: fullResponse })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

router.post("/conseil/feedback", async (req, res) => {
  const { question, answer, rating, comment, sessionId } = req.body as {
    question: string;
    answer: string;
    rating: number;
    comment?: string;
    sessionId?: string;
  };

  if (!question || !answer || !rating) {
    return res.status(400).json({ error: "question, answer, rating required" });
  }

  try {
    await db.insert(conseilFeedbacksTable).values({
      question,
      answer,
      rating,
      comment: comment || null,
      sessionId: sessionId || null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;
