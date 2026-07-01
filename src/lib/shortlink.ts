import { db } from "./db";
import { currentTenantId } from "./tenant";
const code = () => Math.random().toString(36).slice(2, 8);

/** 为某条触达生成可追踪短链，trackId=recipient.id */
export async function createShortLink(targetUrl: string, trackId?: string, tenantId = currentTenantId()) {
  let c = code();
  while (await db.shortLink.findUnique({ where: { code: c } })) c = code();
  const link = await db.shortLink.create({ data: { tenantId, code: c, targetUrl, trackId } });
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return { ...link, shortUrl: `${baseUrl}/s/${c}` };
}
