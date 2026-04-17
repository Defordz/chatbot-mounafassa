import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const conseilDocumentsTable = pgTable("conseil_documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalFilename: text("original_filename").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conseilChunksTable = pgTable("conseil_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => conseilDocumentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: jsonb("embedding"),
  chunkIndex: integer("chunk_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conseilFeedbacksTable = pgTable("conseil_feedbacks", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conseilConfigTable = pgTable("conseil_config", {
  id: serial("id").primaryKey(),
  botName: text("bot_name").notNull().default("Assistant IA"),
  greeting: text("greeting")
    .notNull()
    .default("Bonjour ! Comment puis-je vous aider ?"),
  primaryColor: text("primary_color").notNull().default("#1B4332"),
  secondaryColor: text("secondary_color").notNull().default("#2D6A4F"),
  adminPasswordHash: text("admin_password_hash"),
  systemPrompt: text("system_prompt").notNull().default(
    "Tu es un assistant IA spécialisé dans les documents qui te sont fournis. Réponds uniquement en te basant sur les informations disponibles dans ta base de connaissance. Si la réponse ne se trouve pas dans les documents, dis clairement que tu ne disposes pas de cette information."
  ),
  maxTokens: integer("max_tokens").notNull().default(2000),
  temperature: real("temperature").notNull().default(0.2),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ConseilDocument = typeof conseilDocumentsTable.$inferSelect;
export type InsertConseilDocument = typeof conseilDocumentsTable.$inferInsert;
export type ConseilChunk = typeof conseilChunksTable.$inferSelect;
export type ConseilFeedback = typeof conseilFeedbacksTable.$inferSelect;
export type InsertConseilFeedback = typeof conseilFeedbacksTable.$inferInsert;
export type ConseilConfig = typeof conseilConfigTable.$inferSelect;
