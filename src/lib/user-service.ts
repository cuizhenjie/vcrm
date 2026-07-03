import bcrypt from "bcryptjs";
import { db } from "./db";

/**
 * 用户/租户服务：注册、登录校验、密码哈希。
 *
 * 注册流程：创建 Tenant(slug=租户标识) + AppUser(owner, bcrypt 哈希) +
 *   Subscription(starter 套餐) + 初始额度赠送（CreditLedger）。
 *
 * 登录流程：按 email 查 AppUser → bcrypt 校验 → 签发携带身份的 session token。
 *
 * 向后兼容：若没有任何 AppUser 且配置了 APP_PASSWORD，仍可用环境变量单管理员登录
 *   （回落为 default_tenant 的 owner，保证不破坏现有部署）。
 */

const BCRYPT_ROUNDS = 10;
const SEED_GRANT = 1000; // 新租户注册赠送额度（条），可经 env 调整

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 校验邮箱格式与密码强度。返回错误描述或 null（通过）。 */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "邮箱格式不正确";
  if (password.length < 8) return "密码至少 8 位";
  if (password.length > 128) return "密码过长";
  return null;
}

/** slug 规范：小写字母/数字/连字符，3-32 位。 */
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) return "租户标识需为 3-32 位小写字母数字连字符";
  return null;
}

/**
 * 注册新租户 + owner 用户。
 * 幂等保证：email 全局唯一查重、slug 唯一查重。
 */
export async function registerTenant(input: {
  slug: string;
  tenantName: string;
  email: string;
  userName: string;
  password: string;
}) {
  const slug = input.slug.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();

  // 查重
  const existSlug = await db.tenant.findUnique({ where: { slug } });
  if (existSlug) throw new RegisterError("租户标识已被占用");
  const existEmail = await db.appUser.findFirst({ where: { email } });
  if (existEmail) throw new RegisterError("该邮箱已注册");

  const passwordHash = await hashPassword(input.password);
  const grant = Number(process.env.REGISTER_SEED_GRANT ?? SEED_GRANT);

  const result = await db.$transaction(async (tx) => {
    // 1. 租户
    const tenant = await tx.tenant.create({
      data: { slug, name: input.tenantName.trim() || slug, status: "active" },
    });
    // 2. owner 用户
    const user = await tx.appUser.create({
      data: {
        tenantId: tenant.id,
        email,
        name: input.userName.trim() || email,
        role: "owner",
        passwordHash,
        status: "active",
      },
    });
    // 3. starter 套餐订阅
    const plan = await tx.plan.findUnique({ where: { code: "starter" } });
    if (plan) {
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "trialing",
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        },
      });
    }
    // 4. 初始额度赠送
    if (grant > 0) {
      await tx.creditLedger.create({
        data: { tenantId: tenant.id, delta: grant, balanceAfter: grant, reason: "seed_grant" },
      });
    }
    return { tenant, user };
  });

  return result;
}

/** 按邮箱+密码登录，返回用户身份或 null。 */
export async function loginByCredentials(email: string, password: string) {
  const e = email.trim().toLowerCase();
  const user = await db.appUser.findFirst({
    where: { email: e, status: "active" },
  });
  if (!user) return null;
  if (!user.passwordHash) return null; // 无密码（如纯环境变量用户）
  // 校验租户状态（停用/关闭的租户禁止登录）
  const tenant = await db.tenant.findUnique({
    where: { id: user.tenantId },
    select: { status: true },
  });
  if (tenant?.status === "suspended" || tenant?.status === "closed") return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { userId: user.id, tenantId: user.tenantId, role: user.role, name: user.name ?? user.email };
}

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterError";
  }
}
