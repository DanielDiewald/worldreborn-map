import "server-only";

import { and, asc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { npcs } from "@/lib/schema";

export type NpcInput = {
  name: string;
  gender?: string;
  image?: string;
  publicDescription?: string;
  adminNotes?: string;
  title?: string;
  species?: string;
  profession?: string;
};

export type NpcListFilters = {
  query?: string;
  visibility?: "admin_only" | "all_players" | "selected_players";
};

export async function listNpcs(projectId: number, filters: NpcListFilters = {}) {
  const conditions: SQL[] = [eq(npcs.campId, projectId), isNull(npcs.archivedAt)];
  const query = filters.query?.trim();

  if (query) {
    const pattern = `%${query}%`;
    const search = or(
      ilike(npcs.name, pattern),
      ilike(npcs.title, pattern),
      ilike(npcs.species, pattern),
      ilike(npcs.profession, pattern),
    );
    if (search) conditions.push(search);
  }

  if (filters.visibility) conditions.push(eq(npcs.visibilityMode, filters.visibility));

  return db
    .select()
    .from(npcs)
    .where(and(...conditions))
    .orderBy(asc(npcs.name));
}

export async function getNpc(projectId: number, npcId: number) {
  const rows = await db
    .select()
    .from(npcs)
    .where(and(eq(npcs.campId, projectId), eq(npcs.nId, npcId), isNull(npcs.archivedAt)))
    .limit(1);

  return rows[0] ?? null;
}

export async function createNpc(projectId: number, input: NpcInput) {
  const [created] = await db
    .insert(npcs)
    .values({
      campId: projectId,
      name: input.name,
      notes: input.adminNotes?.trim() || "no notes yet",
      gender: input.gender?.trim() || "unknown",
      image: input.image?.trim() || "noimage",
      publicDescription: input.publicDescription?.trim() || null,
      adminNotes: input.adminNotes?.trim() || null,
      title: input.title?.trim() || null,
      species: input.species?.trim() || null,
      profession: input.profession?.trim() || null,
      visibilityMode: "admin_only",
      metadata: {},
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function updateNpc(projectId: number, npcId: number, input: NpcInput) {
  const [updated] = await db
    .update(npcs)
    .set({
      name: input.name,
      gender: input.gender?.trim() || "unknown",
      image: input.image?.trim() || "noimage",
      publicDescription: input.publicDescription?.trim() || null,
      adminNotes: input.adminNotes?.trim() || null,
      title: input.title?.trim() || null,
      species: input.species?.trim() || null,
      profession: input.profession?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(npcs.campId, projectId), eq(npcs.nId, npcId), isNull(npcs.archivedAt)))
    .returning();

  return updated ?? null;
}

export async function archiveNpc(projectId: number, npcId: number) {
  const [archived] = await db
    .update(npcs)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(npcs.campId, projectId), eq(npcs.nId, npcId), isNull(npcs.archivedAt)))
    .returning({ id: npcs.nId });

  return archived ?? null;
}
