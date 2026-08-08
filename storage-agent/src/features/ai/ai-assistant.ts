import type { AIRuntimeConfig } from "../../api/client"

/**
 * AI assistant remains available for a future feature-flagged re-enable.
 * It is intentionally not imported by the application shell while the UI
 * entry points are closed, so page-agent stays out of the initial bundle.
 */
export async function createPageAgent(config: AIRuntimeConfig) {
  const [{ PageAgent }, { fetchAIChatCompletionProxy }] = await Promise.all([
    import("page-agent"),
    import("../../api/client"),
  ])

  return new PageAgent({
    model: config.model,
    baseURL: "/api/v1/ai/openai/v1",
    customFetch: fetchAIChatCompletionProxy,
    language: "zh-CN",
    maxSteps: config.max_steps,
  })
}
