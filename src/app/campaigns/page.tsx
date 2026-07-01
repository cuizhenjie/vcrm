import { db } from "@/lib/db";
import { Topbar, Tag } from "@/components/ui";
import Link from "next/link";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const tenantId = currentTenantId();
  const list = await db.campaign.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, include: { template: true } });
  return (
    <>
      <Topbar title="触达任务" sub="营销触达">
        <Link href="/campaigns/new" className="btn btn-pri">＋ 新建任务</Link>
      </Topbar>
      <div className="p-6">
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="th">任务名称</th><th className="th">类型</th><th className="th">状态</th><th className="th">总数</th><th className="th">已发送</th><th className="th">创建时间</th><th className="th">操作</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td"><Tag s={c.type} /></td>
                  <td className="td"><Tag s={c.status} /></td>
                  <td className="td">{c.total}</td>
                  <td className="td">{c.sent}</td>
                  <td className="td text-ink3">{new Date(c.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="td"><Link href={`/campaigns/${c.id}`} className="text-accent">详情</Link></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td className="td text-ink3" colSpan={7}>暂无任务</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
