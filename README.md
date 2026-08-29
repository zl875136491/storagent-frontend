# Crosstorage Frontend（Storagent）

本项目是 Crosstorage / Storagent 的前端（Vite + React）。前端会在启动时根据 `api.config` 里的候选后端列表探测可用服务，并自动选择 **master** 节点作为实际 API 基址。

## 目录结构

- `storage-agent/`: 前端工程（Vite + React）
- `api.config`: 后端候选基址配置（被 `storage-agent/vite.config.ts` 读取并注入）
- `api.config.example`: 配置示例

## 环境要求

- Node.js：建议使用 22.x LTS 版本
- npm：随 Node.js 安装

## 1. 配置后端候选列表

在 `storage-agent` 的同级目录下准备 `api.config`：

```bash
cp api.config.example api.config
```

编辑 `api.config`，填写你的后端候选基址（示例）：

```python
server_list = [
  "http://localhost:6783"，
  ......
]
```

- **说明**：前端会对每个候选基址请求 `GET /api/public/endpoints`，并从返回结果中选取 `master === true` 的 `endpoint` 作为最终 API 基址。

## 2. 安装依赖与启动开发服务器

进入前端工程目录启动：

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

## 3. 访问

- 默认访问地址：`http://localhost:5173`
- `dev` 脚本使用 `vite --host 0.0.0.0`，因此同网段设备也可通过你的局域网 IP 访问（前提是防火墙/端口放通）

## 常用命令

在 `storage-agent/` 目录下：

```bash
npm run dev      # 本地开发
npm run build    # 生产构建（tsc + vite build）
npm run preview  # 本地预览构建产物
npm run lint     # eslint
```

## 常见问题（FAQ）

### 启动后一直显示“正在连接最佳服务”

- **检查 `api.config` 是否存在且格式正确**：`storage-agent` 会在构建时读取上一级目录的 `api.config`。
- **检查后端是否可达**：候选地址需要能访问 `GET /api/public/endpoints`（并返回包含 `master` 节点的列表）。
- **端口不一致**：确认后端监听端口与你在 `server_list` 中填写的一致（默认示例为 `6783`）。

### 改了 `api.config` 但页面还是连旧后端

前端会把已探测到的后端基址缓存到浏览器 `localStorage`。如果需要强制重新探测：

- 清理站点存储（Application/Storage -> Local Storage），或
- 使用无痕窗口重新打开页面。