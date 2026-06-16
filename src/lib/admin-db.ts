import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { articles, type NewArticle, type Article } from "@/db/schema";

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function adminListArticles(limit = 300): Promise<Article[]> {
  return db.select().from(articles).orderBy(desc(articles.id)).limit(limit);
}

export async function adminGetArticle(id: number): Promise<Article | null> {
  const r = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return r[0] ?? null;
}

export async function adminCreateArticle(
  data: Omit<NewArticle, "id">,
): Promise<number> {
  const [res] = await db.insert(articles).values(data);
  // mysql2: ResultSetHeader.insertId
  return (res as unknown as { insertId: number }).insertId;
}

export async function adminUpdateArticle(
  id: number,
  data: Partial<NewArticle>,
): Promise<void> {
  await db.update(articles).set(data).where(eq(articles.id, id));
}

export async function adminDeleteArticle(id: number): Promise<void> {
  await db.delete(articles).where(eq(articles.id, id));
}
