export type ProviderId = 'openflow' | 'grok' | 'deepseek' | 'claude' | 'gemini'

export type ModelDefinition = {
  id: ProviderId
  label: string
  provider: string
  openRouterModel: string
  tagline: string
}

export const MODEL_OPTIONS: ModelDefinition[] = [
  {
    id: 'openflow',
    label: 'OpenFlow',
    provider: 'OpenRouter',
    openRouterModel: 'openai/gpt-4.1-mini',
    tagline: 'Balanced default assistant for fast everyday work.',
  },
  {
    id: 'grok',
    label: 'Grok',
    provider: 'xAI',
    openRouterModel: 'x-ai/grok-3-mini-beta',
    tagline: 'Quick reasoning with a playful edge and lower cost.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'DeepSeek',
    openRouterModel: 'deepseek/deepseek-chat-v3-0324',
    tagline: 'Strong coding and analysis without jumping to premium spend.',
  },
  {
    id: 'claude',
    label: 'Claude',
    provider: 'Anthropic',
    openRouterModel: 'anthropic/claude-3.5-haiku',
    tagline: 'Good writing quality and thoughtful answers at a lighter price point.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    provider: 'Google',
    openRouterModel: 'google/gemini-2.0-flash-001',
    tagline: 'Fast multimodal-friendly model that stays cost-conscious.',
  },
]

export const DEFAULT_MODEL_ID: ProviderId = 'openflow'
