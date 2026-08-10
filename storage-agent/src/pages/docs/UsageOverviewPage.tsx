import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  FeatureWalkthrough,
  MockConsole,
  MockMain,
  MockRows,
  MockSidebar,
  MockToolbar,
} from "@/components/docs/mock-console"
import { DocLead, DocNote, DocTitle, useRegisterToc } from "@/components/docs/primitives"

const NAV = ["区域管理", "应用管理", "APIKey 管理", "MinIO 服务", "存储桶管理"]

export default function UsageOverviewPage() {
  const toc = useMemo(
    () => [
      { id: "prepare", title: "接入准备", level: 2 as const },
      { id: "gateway", title: "服务入口", level: 2 as const },
      { id: "app", title: "应用与授权", level: 2 as const },
      { id: "apikey", title: "APIKey", level: 2 as const },
      { id: "topology", title: "复制拓扑", level: 2 as const },
      { id: "ops", title: "区域与 MinIO", level: 2 as const },
    ],
    [],
  )
  useRegisterToc(toc)

  return (
    <div className="pb-10">
      <DocTitle>使用概览</DocTitle>
      <DocLead>
        以控制台交互为主：看懂界面在做什么，并用按钮直接跳进对应页面。
      </DocLead>
      <DocNote>
        普通用户聚焦「应用 → APIKey」；管理员额外负责区域 / MinIO / 授权 / 复制拓扑编辑。
      </DocNote>

      <section id="prepare" className="mt-8 scroll-m-24 rounded-lg border border-border/70 bg-muted/20 p-4">
        <h2 className="text-base font-semibold text-foreground">接入准备</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">先创建业务应用，等待管理员授权，再签发 APIKey。准备完成后到“快速开始”查看版本化的上传与下载调用时序。</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Link className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent" to="/data/basic/application">1. 创建应用</Link>
          <Link className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent" to="/data/basic/application">2. 等待授权</Link>
          <Link className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent" to="/data/basic/api-key">3. 签发 APIKey</Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">APIKey 只保存在 App 后端环境变量中，用于控制面调用和能力令牌签发；不要放进浏览器或客户端包。</p>
      </section>

      <section id="gateway" className="mt-8 scroll-m-24 rounded-lg border border-border/70 bg-muted/20 p-4">
        <h2 className="text-base font-semibold text-foreground">服务入口</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Storagent 的页面和 API 都经 Nginx 进入。根路径只提供控制台；所有后端调用必须带
          <code className="mx-1 rounded bg-background px-1 font-mono text-[11px] text-foreground">/server/{"{region}"}</code>
          前缀，Nginx 会在转发前移除该前缀。
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-background">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="border-b border-border/60 bg-muted/35 text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">环境</th><th className="px-3 py-2 font-medium">网关基址</th><th className="px-3 py-2 font-medium">路由结果</th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50"><td className="px-3 py-2 text-foreground">生产</td><td className="px-3 py-2 font-mono text-[11px] text-foreground">http://stor.1oa.com.cn/server/bj</td><td className="px-3 py-2 text-muted-foreground">指定北京后端；其他区域使用各自短码</td></tr>
              <tr className="border-b border-border/50"><td className="px-3 py-2 text-foreground">NUC 测试默认</td><td className="px-3 py-2 font-mono text-[11px] text-foreground">http://10.32.12.110/server/local</td><td className="px-3 py-2 text-muted-foreground">宿主入口默认进入 A，local 指向 A</td></tr>
              <tr className="border-b border-border/50"><td className="px-3 py-2 text-foreground">NUC 测试 A</td><td className="px-3 py-2 font-mono text-[11px] text-foreground">http://10.32.12.110/server/nuc-a</td><td className="px-3 py-2 text-muted-foreground">显式访问 nuc-docker-a</td></tr>
              <tr><td className="px-3 py-2 text-foreground">NUC 测试 B</td><td className="px-3 py-2 font-mono text-[11px] text-foreground">http://10.32.12.110/server/nuc-b</td><td className="px-3 py-2 text-muted-foreground">显式访问 nuc-docker-b</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          例如将 <code className="rounded bg-background px-1 font-mono text-[11px] text-foreground">/api/v1/public/endpoints</code> 追加到网关基址。
          直接访问 <code className="rounded bg-background px-1 font-mono text-[11px] text-foreground">http://10.32.12.110/api/...</code> 不会进入后端。
        </p>
      </section>

      <section id="app" className="scroll-m-24">
        <FeatureWalkthrough
          title="应用与授权"
          description="业务同学先新建应用；管理员在列表中点击「授权」，系统会在各站点准备应用桶与复制关系。未授权的应用不能签发可用 APIKey。"
          to="/data/basic/application"
          cta="打开应用管理"
          mock={
            <MockConsole title="应用管理">
              <MockSidebar items={NAV} active="应用管理" />
              <MockMain>
                <MockToolbar title="应用" action="新建应用" />
                <MockRows
                  rows={[
                    { primary: "部件信息管理系统", secondary: "APPID · cpl", badge: "已授权" },
                    { primary: "演示业务", secondary: "APPID · demo", badge: "待授权" },
                  ]}
                />
              </MockMain>
            </MockConsole>
          }
        />
      </section>

      <section id="apikey" className="scroll-m-24">
        <FeatureWalkthrough
          title="APIKey"
          description="选择已授权应用签发密钥。明文只在创建弹窗出现一次；之后列表为掩码。管理员可吊销他人密钥，对方会看到「被管理人员注销」。"
          to="/data/basic/api-key"
          cta="打开 APIKey 管理"
          mock={
            <MockConsole title="APIKey 管理">
              <MockSidebar items={NAV} active="APIKey 管理" />
              <MockMain>
                <MockToolbar title="密钥" action="新建 APIKey" />
                <MockRows
                  rows={[
                    { primary: "sk_ab••••cd", secondary: "绑定 · cpl", badge: "可用" },
                    {
                      primary: "sk_xy••••zz",
                      secondary: "绑定 · demo",
                      badge: "被管理人员注销",
                    },
                  ]}
                />
              </MockMain>
            </MockConsole>
          }
        />
      </section>

      <section id="topology" className="scroll-m-24">
        <FeatureWalkthrough
          title="存储桶 · 复制拓扑"
          description="选择存储桶后查看跨站点复制关系。所有人可「显示」；仅管理员可进入「编辑」拖拽节点或增删复制边。"
          to="/data/storage/bucket-manage"
          cta="打开存储桶管理"
          mock={
            <MockConsole title="跨站点复制拓扑">
              <MockSidebar items={NAV} active="存储桶管理" />
              <MockMain>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold">跨站点复制拓扑</div>
                  <div className="flex rounded-full border border-border/70 p-0.5 text-[9px]">
                    <span className="rounded-full bg-background px-2 py-0.5 shadow-sm">显示</span>
                    <span className="px-2 py-0.5 text-muted-foreground">编辑</span>
                  </div>
                </div>
                <div className="relative mt-2 h-28 rounded-lg border border-dashed border-border/70 bg-muted/20">
                  <div className="absolute left-6 top-8 rounded-md border border-border bg-card px-2 py-1 text-[9px]">
                    hangzhou
                  </div>
                  <div className="absolute right-8 top-10 rounded-md border border-border bg-card px-2 py-1 text-[9px]">
                    beijing
                  </div>
                  <svg className="absolute inset-0 h-full w-full text-muted-foreground/50" aria-hidden>
                    <path d="M70 44 C120 20, 160 20, 210 48" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </div>
              </MockMain>
            </MockConsole>
          }
        />
      </section>

      <section id="ops" className="scroll-m-24">
        <FeatureWalkthrough
          title="区域与 MinIO"
          description="先建区域，再登记各区域 MinIO 实例。这是授权与跨站点复制的底座；写操作通常需要管理员。"
          to="/data/minio"
          cta="打开 MinIO 服务管理"
          mock={
            <MockConsole title="MinIO 服务管理">
              <MockSidebar items={NAV} active="MinIO 服务" />
              <MockMain>
                <MockToolbar title="服务点" action="添加" />
                <MockRows
                  rows={[
                    { primary: "hangzhou", secondary: "华东 · weight 10", badge: "在线" },
                    { primary: "beijing", secondary: "华北 · weight 8", badge: "在线" },
                  ]}
                />
              </MockMain>
            </MockConsole>
          }
        />
      </section>
    </div>
  )
}
