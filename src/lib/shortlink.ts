import { db } from "./db";
const code = () => Math.random().toString(36).slice(2, 8);

/** 为某条触达生成可追踪短链，trackId=recipient.id */
export async function createShortLink(targetUrl: string, trackId?: string) {
  let c = code();
  while (await db.shortLink.findUnique({ where: { code: c } })) c = code();
  const link = await db.shortLink.create({ data: { code: c, targetUrl, trackId } });
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return { ...link, shortUrl: `${baseUrl}/s/${c}` };
}
