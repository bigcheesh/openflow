import type { ProviderId } from './config/models'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type UserSettings = {
  displayName: string
  openRouterApiKey: string
  selectedModelId: ProviderId
  temperature: number
  maxTokens: number
  saveKeyToCloud: boolean
}
