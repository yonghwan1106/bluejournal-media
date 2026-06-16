import "server-only";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, type NewArticle, type Article } from "@/db/schema";

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function adminListArticles(limit = 300): Promise<Article[]> {
  return getDb()
    .select()
    .from(articles)
    .orderBy(desc(articles.id))
    .limit(limit);
}

export async function adminGetArticle(id: number): Promise<Article | null> {
  const r = await getDb()
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);
  return r[0] ?? null;
}

export async function adminCreateArticle(
  data: Omit<NewArticle, "id">,
): Promise<number> {
  // PG 에는 mysql2 의 insertId 가 없으므로 RETURNING 으로 새 id 를 받는다.
  const [res] = await getDb()
    .insert(articles)
    .values(data)
    .returning({ id: articles.id });
  return res.id;
}

export async function adminUpdateArticle(
  id: number,
  data: Partial<NewArticle>,
): Promise<void> {
  await getDb().update(articles).set(data).where(eq(articles.id, id));
}

export async function adminDeleteArticle(id: number): Promise<void> {
  await getDb().delete(articles).where(eq(articles.id, id));
}
