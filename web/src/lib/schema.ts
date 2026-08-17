import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const campaigns = pgTable("campaigns", {
  campId: serial("camp_id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  image: text("image").notNull(),
  logo: text("logo"),
  status: varchar("status", { length: 30 }).notNull(),
  settings: jsonb("settings").notNull(),
  inWorldDate: text("in_world_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const npcs = pgTable("npcs", {
  nId: serial("n_id").primaryKey(),
  campId: integer("camp_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  notes: text("notes").notNull(),
  gender: varchar("gender", { length: 10 }).notNull(),
  image: text("image").notNull(),
  publicDescription: text("public_description"),
  adminNotes: text("admin_notes"),
  title: varchar("title", { length: 120 }),
  species: varchar("species", { length: 80 }),
  profession: varchar("profession", { length: 120 }),
  visibilityMode: varchar("visibility_mode", { length: 30 }).notNull(),
  metadata: jsonb("metadata").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
