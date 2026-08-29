# Storagent Web Console

这是 Storagent 前端仓库中的 Vite + React 应用目录。完整的系统能力、架构演示、区域网关解析与部署说明见上一级 [Frontend README](../README.md)。

## 开发

```bash
npm install
npm run dev
```

常用校验：

```bash
npm run lint
npm run build
npm run preview
```

## 关键目录

```text
src/
├── api/        # API Client、端点发现与区域网关解析
├── auth/       # 登录态、路由保护与权限判断
├── components/ # 通用、文档、存储和 UI 组件
├── layouts/    # 主布局与导航
├── pages/      # data、admin、docs 页面
└── App.tsx     # 路由、懒加载与历史链接兼容
```

候选后端由上一级 `api.config` 或构建环境变量 `STORAGENT_API_SERVERS` 注入。浏览器探测 `GET /api/v1/public/endpoints` 后选择公开网关，不直接使用 MinIO 内网地址。
