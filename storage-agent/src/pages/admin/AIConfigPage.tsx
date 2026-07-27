import { useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import { Plus, Save, TestTube2, Trash2 } from "lucide-react"

import {
  fetchAIProviderAdminConfigApi,
  testAIProviderAdminConfigApi,
  updateAIProviderAdminConfigApi,
  type AIProviderAdminConfig,
  type AIProviderUpdateRequest,
} from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Switch } from "../../components/ui/switch"

type FormState = AIProviderUpdateRequest & {
  api_key: string
  clear_api_key: boolean
}

const INITIAL_FORM: FormState = {
  provider_name: "",
  base_url: "",
  api_key: "",
  clear_api_key: false,
  protocol: "chat_completions",
  models: [""],
  default_model: "",
  enabled: false,
  system_prompt: "",
  max_steps: 20,
}

function formFromConfig(config: AIProviderAdminConfig): FormState {
  return {
    provider_name: config.provider_name,
    base_url: config.base_url,
    api_key: "",
    clear_api_key: false,
    protocol: config.protocol,
    models: [...config.models],
    default_model: config.default_model,
    enabled: config.enabled,
    system_prompt: config.system_prompt,
    max_steps: config.max_steps,
  }
}

export default function AIConfigPage() {
  const { accessToken, user } = useAuth()
  const [config, setConfig] = useState<AIProviderAdminConfig | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!user?.is_admin) return
    setLoading(true)
    fetchAIProviderAdminConfigApi(accessToken ?? undefined)
      .then((next) => {
        setConfig(next)
        setForm(formFromConfig(next))
        setDirty(false)
      })
      .catch(() => {
        // API client already displayed the error.
      })
      .finally(() => setLoading(false))
  }, [accessToken, user?.is_admin])

  const canSave = useMemo(() => {
    const models = form.models.map((item) => item.trim()).filter(Boolean)
    return Boolean(
      dirty &&
        form.provider_name.trim() &&
        form.base_url.trim() &&
        form.system_prompt.trim() &&
        models.length > 0 &&
        models.includes(form.default_model) &&
        Number.isInteger(form.max_steps) &&
        form.max_steps >= 3 &&
        form.max_steps <= 40 &&
        !saving,
    )
  }, [dirty, form, saving])

  if (!user?.is_admin) {
    return <Navigate to="/data/basic/region" replace />
  }

  const updateForm = (update: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...update }))
    setDirty(true)
  }

  const updateModel = (index: number, value: string) => {
    const models = form.models.map((item, itemIndex) => (itemIndex === index ? value : item))
    const previous = form.models[index]
    updateForm({
      models,
      default_model: form.default_model === previous ? value : form.default_model,
    })
  }

  const addModel = () => {
    updateForm({ models: [...form.models, ""] })
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    const removed = form.models[index]
    const models = form.models.filter((_, itemIndex) => itemIndex !== index)
    updateForm({
      models,
      default_model: form.default_model === removed ? models[0] : form.default_model,
    })
  }

  const save = async () => {
    const models = form.models.map((item) => item.trim()).filter(Boolean)
    if (!models.includes(form.default_model)) {
      showErrorToast("默认模型必须包含在模型列表中")
      return
    }
    if (form.enabled && !form.api_key.trim() && !config?.api_key_configured) {
      showErrorToast("启用 AI 助手前请填写 API Key")
      return
    }
    if (form.enabled && form.clear_api_key) {
      showErrorToast("清除 API Key 时不能启用 AI 助手")
      return
    }

    setSaving(true)
    try {
      const payload: AIProviderUpdateRequest = {
        provider_name: form.provider_name.trim(),
        base_url: form.base_url.trim(),
        protocol: form.protocol,
        models,
        default_model: form.default_model,
        enabled: form.enabled,
        system_prompt: form.system_prompt.trim(),
        max_steps: form.max_steps,
        clear_api_key: form.clear_api_key,
      }
      if (form.api_key.trim()) payload.api_key = form.api_key.trim()
      const next = await updateAIProviderAdminConfigApi(payload, accessToken ?? undefined)
      setConfig(next)
      setForm(formFromConfig(next))
      setDirty(false)
      window.dispatchEvent(new Event("storagent:ai-config-updated"))
      showSuccessToast("AI 提供商配置已保存")
    } catch {
      // API client already displayed the error.
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    if (dirty) {
      showErrorToast("请先保存当前修改，再测试连接")
      return
    }
    setTesting(true)
    try {
      const result = await testAIProviderAdminConfigApi(accessToken ?? undefined)
      showSuccessToast(`连接成功，${result.model} 响应耗时 ${result.latency_ms} ms`)
    } catch {
      // API client already displayed the error.
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-xs text-muted-foreground">
        正在加载 AI 配置...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">AI 助手配置</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理页面操作助手使用的 OpenAI 兼容模型提供商。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={testing || !config?.api_key_configured} onClick={() => void testConnection()}>
            <TestTube2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {testing ? "测试中" : "测试连接"}
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>模型提供商</CardTitle>
              <CardDescription>
                {config?.updated_at
                  ? `最近由 ${config.updated_by || "管理员"} 更新于 ${new Date(config.updated_at).toLocaleString()}`
                  : "尚未保存配置"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ai-enabled">启用助手</Label>
              <Switch
                id="ai-enabled"
                checked={form.enabled}
                onCheckedChange={(enabled) => updateForm({ enabled })}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider-name">提供商名称</Label>
              <Input
                id="ai-provider-name"
                value={form.provider_name}
                onChange={(event) => updateForm({ provider_name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-base-url">API 地址</Label>
              <Input
                id="ai-base-url"
                value={form.base_url}
                placeholder="https://provider.example/v1"
                onChange={(event) => updateForm({ base_url: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-protocol">上游协议</Label>
              <select
                id="ai-protocol"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.protocol}
                onChange={(event) => updateForm({ protocol: event.target.value as FormState["protocol"] })}
              >
                <option value="chat_completions">Chat Completions</option>
                <option value="responses">Responses API</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-max-steps">单次任务最大步数</Label>
              <Input
                id="ai-max-steps"
                type="number"
                min={3}
                max={40}
                value={form.max_steps}
                onChange={(event) => updateForm({ max_steps: Number(event.target.value) || 3 })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="ai-api-key">API Key</Label>
              <span className="text-[11px] text-muted-foreground">
                {config?.api_key_configured ? `已配置 ${config.api_key_hint || ""}` : "未配置"}
              </span>
            </div>
            <Input
              id="ai-api-key"
              type="password"
              autoComplete="new-password"
              value={form.api_key}
              placeholder={config?.api_key_configured ? "留空则保持现有密钥" : "输入 API Key"}
              disabled={form.clear_api_key}
              onChange={(event) => updateForm({ api_key: event.target.value, clear_api_key: false })}
            />
            {config?.api_key_configured ? (
              <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.clear_api_key}
                  onChange={(event) => updateForm({ clear_api_key: event.target.checked, api_key: "" })}
                />
                清除现有密钥
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>可用模型</Label>
              <Button variant="ghost" size="sm" onClick={addModel}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                添加模型
              </Button>
            </div>
            <div className="space-y-2">
              {form.models.map((model, index) => (
                <div className="flex items-center gap-2" key={`${index}-${form.models.length}`}>
                  <Input
                    aria-label={`模型 ${index + 1}`}
                    value={model}
                    placeholder="例如 gpt-5.6-terra"
                    onChange={(event) => updateModel(index, event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`删除模型 ${model || index + 1}`}
                    title="删除模型"
                    disabled={form.models.length <= 1}
                    onClick={() => removeModel(index)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-default-model">默认模型</Label>
            <select
              id="ai-default-model"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.default_model}
              onChange={(event) => updateForm({ default_model: event.target.value })}
            >
              {form.models.filter((model) => model.trim()).map((model, index) => (
                <option key={`${model}-${index}`} value={model}>{model}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-system-prompt">系统约束提示词</Label>
            <textarea
              id="ai-system-prompt"
              className="min-h-48 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.system_prompt}
              onChange={(event) => updateForm({ system_prompt: event.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
