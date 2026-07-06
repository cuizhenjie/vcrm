/**
 * 视频 URL 转存（防方舟 URL 24h 过期）。
 *
 * 方舟返回的 video_url 有效期仅 24 小时。succeeded 后需立即下载并上传到自有存储。
 *
 * 支持两种存储模式（均通过 env 配置，不配则不转存）：
 *   1. S3 兼容（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO）：
 *      配 VIDEO_S3_ENDPOINT + VIDEO_S3_BUCKET + VIDEO_S3_KEY/SECRET + VIDEO_S3_REGION
 *      使用 presigned URL 方式上传（无需 SDK，fetch PUT）
 *   2. 简单代理/CDN：
 *      配 VIDEO_STORAGE_BASE_URL（仅拼接，不实际下载——适用于 CDN 回源场景）
 *
 * 未配置时：返回原始 URL + persisted=false，UI 提示"24h 内下载"。
 */

export function isVideoStorageEnabled(): boolean {
  return !!(process.env.VIDEO_S3_BUCKET && process.env.VIDEO_S3_KEY);
}

/**
 * 尝试转存视频 URL。返回永久 URL（转存成功）或原始 URL。
 *
 * 流程：
 *   1. 下载方舟 video_url（fetch → arrayBuffer）
 *   2. 上传到 S3 兼容存储（presigned PUT 或直接 PUT）
 *   3. 返回存储后的永久 URL
 *
 * 失败时返回原始 URL + persisted=false（不阻塞用户看视频）。
 */
export async function persistVideoUrl(originalUrl: string, taskId: string): Promise<{ url: string; persisted: boolean }> {
  // 模式 2：简单 CDN 拼接（不实际下载）
  const cdnBase = process.env.VIDEO_STORAGE_BASE_URL?.trim();
  if (cdnBase && !isVideoStorageEnabled()) {
    return { url: `${cdnBase.replace(/\/+$/, "")}/${taskId}.mp4`, persisted: true };
  }

  // 模式 1：S3 兼容存储
  if (isVideoStorageEnabled()) {
    try {
      const storedUrl = await uploadToS3(originalUrl, taskId);
      if (storedUrl) return { url: storedUrl, persisted: true };
    } catch (e) {
      console.error("[video-storage] 转存失败，回落原始 URL", e instanceof Error ? e.message : e);
    }
  }

  // 未配置或失败：返回原始 URL
  return { url: originalUrl, persisted: false };
}

/**
 * S3 兼容存储上传：下载方舟视频 → PUT 到 S3。
 *
 * 使用 AWS Signature V4 presigned URL（需后端生成）或直接 PUT（如果 bucket 公开写）。
 * 为保持零 SDK 依赖，这里用「后端直接 PUT 到 endpoint」方式（适用于 MinIO/OSS 的公开 bucket 或带签名 URL）。
 *
 * 生产建议：用一个独立的 presigned URL API（POST /api/video/upload-url 返回签名 URL），
 * 前端直传——但这需要更大的改造。此处后端直接下载+上传是最简方案。
 */
async function uploadToS3(videoUrl: string, taskId: string): Promise<string | null> {
  const bucket = process.env.VIDEO_S3_BUCKET!;
  const endpoint = process.env.VIDEO_S3_ENDPOINT?.replace(/\/+$/, "") ?? `https://${bucket}.s3.amazonaws.com`;
  const key = process.env.VIDEO_S3_KEY!;
  const secret = process.env.VIDEO_S3_SECRET!;
  const region = process.env.VIDEO_S3_REGION || "us-east-1";
  const objectKey = `videos/${taskId}.mp4`;
  const publicBaseUrl = process.env.VIDEO_S3_PUBLIC_URL?.replace(/\/+$/, "") ?? `${endpoint}/${bucket}`;

  // 1. 下载方舟视频
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`下载视频失败: HTTP ${videoRes.status}`);
  const videoBuffer = await videoRes.arrayBuffer();

  // 2. 生成 AWS Signature V4 并 PUT 上传
  // 使用 Node.js crypto 计算 SigV4（避免引入 AWS SDK）
  const crypto = await import("node:crypto");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(Buffer.from(videoBuffer)).digest("hex");

  const canonicalUri = `/${bucket}/${objectKey}`;
  const canonicalQuery = "";
  const host = new URL(endpoint).host;

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const kDate = hmac("AWS4" + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const auth = `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadRes = await fetch(`${endpoint}/${bucket}/${objectKey}`, {
    method: "PUT",
    headers: {
      "Authorization": auth,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Content-Type": "video/mp4",
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`S3 上传失败: HTTP ${uploadRes.status} ${errText.slice(0, 200)}`);
  }

  return `${publicBaseUrl}/${objectKey}`;
}

function hmac(key: string | Buffer, data: string): Buffer {
  const crypto = require("node:crypto");
  return crypto.createHmac("sha256", typeof key === "string" ? Buffer.from(key) : key).update(data).digest();
}
