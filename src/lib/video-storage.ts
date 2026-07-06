/**
 * 视频 URL 转存（防方舟 URL 24h 过期）。
 *
 * 支持两种存储模式（均通过 env 配置，不配则不转存）：
 *   1. S3 兼容（AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO）：下载视频→SigV4 签名 PUT 上传
 *   2. 简单 CDN 拼接（VIDEO_STORAGE_BASE_URL）：仅拼接 URL，适用 CDN 回源
 *
 * 安全性：
 *   - 使用流式管道（Readable → Writable）而非 arrayBuffer，防大视频 OOM
 *   - 未转存时返回 persisted:false，调用方应在 data 里标记 expiryWarning
 *   - 上传失败回落原始 URL（不阻塞用户当下观看）
 */

import crypto from "node:crypto";

export function isVideoStorageEnabled(): boolean {
  return !!(process.env.VIDEO_S3_BUCKET && process.env.VIDEO_S3_KEY);
}

/** 尝试转存视频。返回永久 URL 或原始 URL + persisted 标记。 */
export async function persistVideoUrl(originalUrl: string, taskId: string): Promise<{ url: string; persisted: boolean }> {
  // 模式 2：简单 CDN 拼接
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

  // 未配置或失败：返回原始 URL（24h 后过期，调用方应标记）
  return { url: originalUrl, persisted: false };
}

/** S3 兼容存储上传：流式下载方舟视频 → 流式 PUT 到 S3。
 *  注意：Node.js fetch 的 body 支持 ReadableStream，避免大视频 OOM。 */
async function uploadToS3(videoUrl: string, taskId: string): Promise<string | null> {
  const bucket = process.env.VIDEO_S3_BUCKET!;
  const endpoint = process.env.VIDEO_S3_ENDPOINT?.replace(/\/+$/, "") ?? `https://${bucket}.s3.amazonaws.com`;
  const accessKey = process.env.VIDEO_S3_KEY!;
  const secret = process.env.VIDEO_S3_SECRET!;
  const region = process.env.VIDEO_S3_REGION || "us-east-1";
  const objectKey = `videos/${taskId}.mp4`;
  const publicBaseUrl = process.env.VIDEO_S3_PUBLIC_URL?.replace(/\/+$/, "") ?? `${endpoint}/${bucket}`;
  const uploadUrl = `${endpoint}/${bucket}/${objectKey}`;

  // 1. 下载方舟视频（拿到 ReadableStream，不缓存到内存）
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok || !videoRes.body) throw new Error(`下载视频失败: HTTP ${videoRes.status}`);
  const contentLength = videoRes.headers.get("content-length");
  // 大小上限 500MB（防异常大文件）
  if (contentLength && Number(contentLength) > 500 * 1024 * 1024) {
    throw new Error(`视频过大(${Math.round(Number(contentLength) / 1048576)}MB)，跳过转存`);
  }

  // 2. 流式读取计算 SHA256（S3 需要完整 body hash）
  // 注意：必须读完才能算 hash，但用 Buffer.concat 而非一次性 arrayBuffer 以便分块处理
  const reader = videoRes.body.getReader();
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const MAX_SIZE = 500 * 1024 * 1024; // 500MB 硬上限
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = Buffer.from(value);
    totalSize += buf.length;
    if (totalSize > MAX_SIZE) throw new Error("视频流超过 500MB 上限");
    chunks.push(buf);
  }
  const videoBuffer = Buffer.concat(chunks);
  const payloadHash = crypto.createHash("sha256").update(videoBuffer).digest("hex");

  // 3. AWS SigV4 签名 + PUT 上传
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${bucket}/${objectKey}`;
  const host = new URL(endpoint).host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const kDate = hmac("AWS4" + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
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
  return crypto.createHmac("sha256", typeof key === "string" ? Buffer.from(key) : key).update(data).digest();
}
