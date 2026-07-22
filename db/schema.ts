import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  passwordIterations: integer("password_iterations"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { mode: "string", withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (table) => [
  index("sessions_email_idx").on(table.email),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const theoryAttempts = pgTable("theory_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  score: doublePrecision("score").notNull(),
  maxScore: doublePrecision("max_score").notNull(),
  passed: boolean("passed").notNull(),
  answersJson: text("answers_json").notNull(),
  contentVersion: text("content_version").notNull(),
  createdAt: createdAt(),
}, (table) => [index("theory_attempts_email_idx").on(table.email)]);

export const theoryProgress = pgTable("theory_progress", {
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  answerJson: text("answer_json").notNull(),
  correct: boolean("correct").notNull(),
  attempts: integer("attempts").notNull().default(1),
  contentVersion: text("content_version").notNull(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.email, table.questionId] })]);

export const practicalAttempts = pgTable("practical_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  taskCode: text("task_code").notNull(),
  score: doublePrecision("score").notNull(),
  maxScore: doublePrecision("max_score").notNull(),
  rubricJson: text("rubric_json").notNull(),
  notes: text("notes").notNull().default(""),
  contentVersion: text("content_version").notNull(),
  createdAt: createdAt(),
}, (table) => [index("practical_attempts_email_idx").on(table.email)]);

export const favorites = pgTable("favorites", {
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  itemType: text("item_type").notNull(),
  itemId: text("item_id").notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.email, table.itemType, table.itemId] })]);

export const codeDrafts = pgTable("code_drafts", {
  email: text("email").notNull().references(() => users.email, { onDelete: "cascade" }),
  taskCode: text("task_code").notNull(),
  cellsJson: text("cells_json").notNull(),
  revision: integer("revision").notNull().default(1),
  contentVersion: text("content_version").notNull(),
  updatedAt: updatedAt(),
}, (table) => [
  primaryKey({ columns: [table.email, table.taskCode] }),
  uniqueIndex("code_drafts_owner_revision_idx").on(table.email, table.taskCode, table.revision),
]);
