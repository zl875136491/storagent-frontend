# Storagent Frontend

Storagent Frontend 是多区域对象存储管理控制台。它为运维人员和应用管理员提供区域、应用、API Key、MinIO、存储桶、文件、容量、诊断、Etcd 与 Celery 的统一可视化与操作入口。

## 架构展示

<video controls muted loop playsinline preload="metadata" width="100%">
  <source src="docs/assets/storagent-diagram.webm" type="video/webm">
  当前阅读器不支持内嵌 WebM 播放。
</video>

[下载架构演示视频](docs/assets/storagent-diagram.webm)

## 当前能力

| 范围 | 页面与能力 |
| --- | --- |
| 文档与接入 | 使用文档、快速开始、API 指引与组件说明；面向调用方的诊断脚本说明使用 API Key 上下文，不要求输入 APPID。 |
| 基础数据 | 区域、应用、API Key 与 MinIO 服务管理；按权限展示可访问功能。 |
| 存储桶与文件 | 存储桶视图、文件浏览、复制拓扑、Bucket 管理与对象定位。 |
| 存储运维 | 复制状态、规则校准、对象补传（resync）、集群健康/原生自愈巡检、异步运维任务跟踪。 |
| 未纳管桶处置 | 展示未被 Storagent 应用纳管的桶；支持登记保留、解除保留，以及对全站复核为空的桶提交异步清理。旧“孤儿桶”入口会重定向到该页面。 |
| 服务运维 | 调用方自诊断记录与详情，展示 DNS、网关、认证、配额与容量预检、临时对象读写五个阶段。 |
| Etcd 运维 | Etcd 状态、趋势、运维操作、任务与事件查询。 |
| Celery 运维 | 只读查看 Broker、区域队列、Worker、运行/待取/定时任务、任务历史、Beat 租约与已注册任务目录。 |
| 审计与统计 | 用户与角色、用量、审计日志等管理侧页面。 |

## 运行方式

浏览器始终通过 Storagent 网关访问后端。启动时，控制台按下列顺序解析可用 API 基址：

1. 尝试浏览器 `localStorage` 中的上次成功基址；
2. 依次探测构建时注入的候选基址；
3. 对候选基址请求 `GET /api/v1/public/endpoints`；
4. 选择返回结果中 `master: true` 的公开网关基址；已知区域会归一为同源 `/server/{region}` 路径。

这样浏览器不需要直连 MinIO 内网地址，也不会因为跨区域访问而暴露内部服务地址。前端访问管理 API 使用已登录用户的 JWT；应用侧数据传输的 API Key 与能力令牌策略由后端负责，浏览器控制台不保存 API Key 明文用于文件读写。

## 项目结构

```text
frontend/
├── README.md
├── api.config.example              # 本地候选后端基址示例
├── docs/
│   └── assets/
│       └── storagent-diagram.webm  # 架构展示视频
├── deploy/
│   └── host-nginx/                 # 宿主网关部署配置
└── storage-agent/                  # Vite + React 应用
    ├── src/
    │   ├── api/                    # API Client、区域网关解析与类型
    │   ├── auth/                   # 登录态、路由保护与 RBAC 判断
    │   ├── components/             # 复用组件、文档组件、存储组件与 UI 原语
    │   ├── contexts/               # 页面离开保护等跨页面状态
    │   ├── layouts/                # 主布局与导航
    │   ├── pages/
    │   │   ├── admin/              # 存储、服务、Etcd、Celery、审计等运维页
    │   │   ├── data/               # 区域、应用、API Key、MinIO、Bucket 与文件页
    │   │   └── docs/               # 内嵌文档中心
    │   ├── config/                 # 构建时注入的候选后端配置
    │   └── App.tsx                 # 路由、懒加载与兼容重定向
    ├── vite.config.ts              # Vite 配置与 server list 注入
    └── package.json
```

## 主要路由

| 路由前缀 | 内容 |
| --- | --- |
| `/docs/*` | 使用文档、快速开始、API 指引、组件说明。 |
| `/data/basic/*` | 区域、应用与 API Key。 |
| `/data/minio` | MinIO 服务管理。 |
| `/data/storage/*` | Bucket 管理、树图与文件浏览。 |
| `/admin/storage-operations/*` | 复制、集群、未纳管桶与存储运维任务。 |
| `/admin/service-operations/*` | 服务验证与调用方诊断。 |
| `/admin/etcd-operations/*` | Etcd 状态与维护视图。 |
| `/admin/celery-operations` | Celery 只读运行态与历史。 |

`/admin/storage-operations/orphan-buckets` 仅作为历史链接兼容，自动跳转至 `/admin/storage-operations/unmanaged-buckets`。

## 本地开发

### 前置条件

- Node.js 22.x
- npm
- 可访问的 Storagent 后端网关

### 配置候选后端

在 `storage-agent/` 的上一级创建 `api.config`：

```bash
cp api.config.example api.config
```

```python
server_list = [
  "http://localhost:6783",
]
```

也可以在构建环境中使用 `STORAGENT_API_SERVERS` 覆盖文件配置：

```bash
export STORAGENT_API_SERVERS='["https://stor.example.com/server/bj"]'
```

该变量接受 JSON 数组或逗号分隔的 URL / `/server/{region}` 路径。修改 `api.config` 或 `STORAGENT_API_SERVERS` 后需要重启 Vite。

### 启动与校验

```bash
cd storage-agent
npm install
npm run dev
```

## 三仓库关系

Storagent 由三个独立仓库协同交付，完整的调用与任务闭环为：`Frontend -> Backend -> Celery Worker -> Backend -> Frontend`。

| 仓库 | 职责 | 与其他仓库的关系 |
| --- | --- | --- |
| Backend | 提供 API、认证与业务编排，并受理异步运维任务。 | 接收 Frontend 的管理和查询请求；向 Celery Worker 投递区域任务，并向 Frontend 提供任务状态和结果。 |
| Frontend（本仓库） | 提供浏览器中的管理控制台。 | 通过 Backend 的版本化 API 发起操作、查询数据并展示异步任务进度。 |
| Celery Worker | 执行归档、配额聚合、容量快照和存储运维等后台任务。 | 消费 Backend 投递的本区域任务，并将执行状态和结果持久化，供 Backend 与 Frontend 查询。 |

相关仓库：

- [Storagent Backend](https://github.com/zl875136491/storagent)
- [Storagent Celery Worker](https://github.com/zl875136491/storagent-celery)

默认开发地址为 `http://localhost:5173`。常用命令：

```bash
npm run lint
npm run build
npm run preview
```

## 与后端及 Worker 的兼容面

- 控制台调用后端 `/api/v1` 与 `/api/v2` 版本化接口；新诊断阶段必须按阶段 key 解析，不可假设固定四阶段。
- 复制校准、resync、未纳管桶清理、集群自愈均是异步任务；页面提交后通过 operation ID 和任务状态展示最终结果。
- Celery 页面只读，不提供停止、重试、清空队列等管理操作。
- 每个区域的 Worker 只消费自己的协议队列 `storagent.<region>.v<protocol>`；Beat 使用区域/协议租约保证单活调度。前端会展示该路由与租约状态，便于发现错误部署。

## 排障提示

- 一直停留在连接页：检查 `api.config` 或 `STORAGENT_API_SERVERS`，并确认候选基址可访问 `GET /api/v1/public/endpoints`。
- 修改候选地址后仍访问旧服务：清理站点的 `localStorage`，或使用无痕窗口重新打开。
- Celery 页面显示 Worker 不在线：核对同一区域的 `REGION`、`CELERY_TASK_QUEUE_PREFIX`、`CELERY_TASK_PROTOCOL_VERSION`、Broker 与 Result Backend。
- 完整自诊断中的配额与容量为降级状态：该阶段读取已持久化的配额聚合与容量样本，不会在浏览器请求时扫描 MinIO；样本陈旧会提示关注，但不等同于存储不可用。
