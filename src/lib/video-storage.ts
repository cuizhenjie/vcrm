/**
 * 视频 URL 转存（防方舟 URL 24h 过期）。
 *
 * 方舟返回的 video_url 有效期仅 24 小时，需在 succeeded 后立即下载到自有存储。
 * 当前实现：可选——配置了 VIDEO_STORAGE_BASE_URL 时，记录转存需求到 DB，
 * 实际下载由运维/后台 worker 执行（避免在 API 路由里做长时间下载）。
 *
 * 生产建议：
 *   1. 接 S3/OSS/COS：succeeded 后 fetch video_url → 上传到对象存储 → 更新 DB videoUrl 为永久 URL
 *   2. 或用 CDN 回源：VIDEO_STORAGE_BASE_URL 是 CDN 域名，video_url 作回源地址
 *
 * 未配置 VIDEO_STORAGE_BASE_URL 时，仅标注 expiryWarning，UI 提示用户及时下载。
 */

export function getStorageBaseUrl(): string | null {
  const url = process.env.VIDEO_STORAGE_BASE_URL?.trim();
  return url || null;
}

/** 是否启用了视频转存。 */
export function isVideoStorageEnabled(): boolean {
  return !!getStorageBaseUrl();
}

/**
 * 尝试转存视频 URL。返回永久 URL（转存成功）或原始 URL（未配置/失败）。
 * 当前为占位实现——仅拼接存储 URL，实际下载需后台 worker。
 * TODO: 接入 S3/OSS SDK 实现真实下载上传。
 */
export async function persistVideoUrl(originalUrl: string, taskId: string): Promise<{ url: string; persisted: boolean }> {
  const base = getStorageBaseUrl();
  if (!base) {
    return { url: originalUrl, persisted: false };
  }
  // 占位：拼一个基于 taskId 的存储路径 URL（实际文件需 worker 下载上传）
  // 生产替换为：await s3.upload(await fetch(originalUrl).then(r => r.blob()), `${taskId}.mp4`)
  const storedUrl = `${base.replace(/\/+$/, "")}/${taskId}.mp4`;
  return { url: storedUrl, persisted: true };
}
