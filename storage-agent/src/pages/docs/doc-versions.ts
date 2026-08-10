// 文档中心的「版本」登记表。
//
// 「功能接口引导」与「功能组件引导」的内容按业务接口版本分别维护，版本之间的切换
// 完全在前端完成（一个 URL query 参数 + 一份按版本 key 存放的内容表），不需要请求
// 后端。新增版本时只需要：
// 1）在下面的 DOC_VERSIONS 里追加一项；
// 2）在 api-guide-content.ts 的 API_GUIDE_CONTENT_BY_VERSION 与
//    file-components-content.ts 的 COMPONENT_GUIDE_CONTENT_BY_VERSION 里补上同名 key。
// TypeScript 会在漏填某个版本的内容时报错，不会出现“切了版本但内容没跟上”的情况。
//
// 版本状态含义：
// - current：已发布，正常展示完整文档。
// - developing：尚未发布，页面只展示「开发中」占位说明（见 DocComingSoon），
//   不渲染具体接口 / 组件内容，避免把未定稿的内容当成已发布文档。
// - deprecated：历史版本，仍可查看但不再维护，切换按钮上会有提示。

export type DocVersion = "v1" | "v2"

export type DocVersionStatus = "current" | "developing" | "deprecated"

export type DocVersionMeta = {
  id: DocVersion
  label: string
  status: DocVersionStatus
}

export const DOC_VERSIONS: readonly DocVersionMeta[] = [
  { id: "v1", label: "v1", status: "current" },
  { id: "v2", label: "v2", status: "current" },
]

export const DEFAULT_DOC_VERSION: DocVersion = "v1"

export function isDocVersion(value: string | null | undefined): value is DocVersion {
  return DOC_VERSIONS.some((item) => item.id === value)
}
