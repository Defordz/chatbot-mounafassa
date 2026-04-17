import { pgTable, serial, text, integer, real, timestamp, date } from "drizzle-orm/pg-core";

export const feedbacksTable = pgTable("monafassa_feedbacks", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  answer: text("answer").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const analyticsTable = pgTable("monafassa_analytics", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  queries: integer("queries").notNull().default(0),
  cache_hits: integer("cache_hits").notNull().default(0),
});

export const settingsTable = pgTable("monafassa_settings", {
  id: serial("id").primaryKey(),
  system_prompt: text("system_prompt"),
  welcome_message: text("welcome_message"),
  max_tokens: integer("max_tokens").notNull().default(3000),
  temperature: real("temperature").notNull().default(0.1),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type Feedback = typeof feedbacksTable.$inferSelect;
export type InsertFeedback = typeof feedbacksTable.$inferInsert;
export type Analytics = typeof analyticsTable.$inferSelect;
export type Settings = typeof settingsTable.$inferSelect;
