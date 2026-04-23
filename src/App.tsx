import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, type ProviderId } from './config/models'
import { MODEL_PERSONAS } from './config/personas'
import type { ChatMessage, UserSettings } from './types'

const SETTINGS_KEY = 'openflow.settings.local'
const THREADS_KEY = 'openflow.threads.local'

const RESPONSE_FORMAT_RULE = `
Formatting rule:
- Reply in normal plain text by default.
- Use fenced Markdown code blocks only for actual code.
- Do not wrap the entire response in a code block unless the whole response is code.
`.trim()

const defaultSettings: UserSettings = {
  displayName: 'OpenFlow Pilot',
  openRouterApiKey: '',
  selectedModelId: DEFAULT_MODEL_ID,
  temperature: 0.7,
  maxTokens: 900,
  saveKeyToCloud: true,
}

type PanelView = 'settings' | null
type AssistantSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; code: string }
type ChatThread = {
  id: string
  title: string
  selectedModelId: ProviderId
  messages: ChatMessage[]
  updatedAt: string
}

function safeRead<T>(key: string, fallback: T): T {
  const value = window.localStorage.getItem(key)
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function createThread(modelId: ProviderId): ChatThread {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    selectedModelId: modelId,
    messages: [],
    updatedAt: new Date().toISOString(),
  }
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(() =>
    safeRead(SETTINGS_KEY, defaultSettings),
  )
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const initial = safeRead<ChatThread[]>(THREADS_KEY, [])
    return initial.length ? initial : [createThread(DEFAULT_MODEL_ID)]
  })
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const initial = safeRead<ChatThread[]>(THREADS_KEY, [])
    return initial[0]?.id ?? null
  })
  const [panelView, setPanelView] = useState<PanelView>(null)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [copiedMessageKey, setCopiedMessageKey] = useState('')
  const [settingsMessage, setSettingsMessage] = useState(
    'All settings and chats are saved locally on this device.',
  )

  const activeModel = useMemo(
    () => MODEL_OPTIONS.find((model) => model.id === settings.selectedModelId) ?? MODEL_OPTIONS[0],
    [settings.selectedModelId],
  )
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  )

  function persist(nextSettings: UserSettings, nextThreads: ChatThread[]) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings))
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(nextThreads))
  }

  function updateThread(messages: ChatMessage[], modelId: ProviderId) {
    if (!activeThread) return
    const nextThread: ChatThread = {
      ...activeThread,
      selectedModelId: modelId,
      messages,
      title: messages.find((msg) => msg.role === 'user')?.content.slice(0, 44).trim() || 'New chat',
      updatedAt: new Date().toISOString(),
    }
    const nextThreads = [nextThread, ...threads.filter((thread) => thread.id !== nextThread.id)]
    setThreads(nextThreads)
    setActiveThreadId(nextThread.id)
    persist(settings, nextThreads)
  }

  function openNewChat() {
    const thread = createThread(settings.selectedModelId)
    const nextThreads = [thread, ...threads]
    setThreads(nextThreads)
    setActiveThreadId(thread.id)
    persist(settings, nextThreads)
  }

  function deleteThread(threadId: string) {
    const filtered = threads.filter((thread) => thread.id !== threadId)
    const nextThreads = filtered.length ? filtered : [createThread(settings.selectedModelId)]
    setThreads(nextThreads)
    setActiveThreadId(nextThreads[0].id)
    persist(settings, nextThreads)
  }

  function parseAssistantSegments(content: string): AssistantSegment[] {
    const segments: AssistantSegment[] = []
    const pattern = /```([\w+-]*)\n?([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null = pattern.exec(content)

    while (match) {
      const textBefore = content.slice(lastIndex, match.index)
      if (textBefore.trim()) segments.push({ type: 'text', content: textBefore.trim() })
      segments.push({ type: 'code', language: match[1] || 'text', code: match[2].trim() })
      lastIndex = pattern.lastIndex
      match = pattern.exec(content)
    }

    const trailingText = content.slice(lastIndex)
    if (trailingText.trim()) segments.push({ type: 'text', content: trailingText.trim() })
    return segments.length ? segments : [{ type: 'text', content }]
  }

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopiedMessageKey(key)
    window.setTimeout(() => setCopiedMessageKey(''), 1200)
  }

  async function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chatInput.trim()) return
    if (!settings.openRouterApiKey.trim()) {
      setPanelView('settings')
      setSettingsMessage('Add your OpenRouter API key in Settings first.')
      return
    }
    if (!activeThread) {
      openNewChat()
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: chatInput.trim() }
    const nextMessages = [...activeThread.messages, userMessage]
    updateThread(nextMessages, activeModel.id)
    setChatInput('')
    setSending(true)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'OpenFlow',
        },
        body: JSON.stringify({
          model: activeModel.openRouterModel,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          messages: [
            { role: 'system', content: `${RESPONSE_FORMAT_RULE}\n\n${MODEL_PERSONAS[activeModel.id]}` },
            ...nextMessages,
          ],
        }),
      })
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }
      if (!response.ok) throw new Error(payload.error?.message ?? 'OpenRouter request failed.')
      const assistantReply = payload.choices?.[0]?.message?.content ?? 'No reply from model.'
      updateThread([...nextMessages, { role: 'assistant', content: assistantReply }], activeModel.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      updateThread(
        [...nextMessages, { role: 'assistant', content: `OpenFlow could not complete that request: ${message}` }],
        activeModel.id,
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <main
      className="app-shell"
      style={{ '--background-image': 'url(/hero-background.png)' } as CSSProperties}
    >
      <div className="ambient-overlay" />

      <section className="floating-layout">
        <div className="sidebar-hover-zone" aria-hidden="true">
          <aside className="thread-sidebar glass-card">
            <div className="sidebar-head">
              <span className="eyebrow">Recent Chats</span>
              <div className="sidebar-actions">
                <button className="ghost-button compact-button" type="button" onClick={openNewChat}>
                  New
                </button>
                <button
                  className="ghost-button compact-button"
                  type="button"
                  onClick={() => setPanelView('settings')}
                >
                  Settings
                </button>
              </div>
            </div>
            <p className="sidebar-status">Saved locally on this device.</p>
            <div className="thread-list">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  className={thread.id === activeThreadId ? 'thread-item thread-item--active' : 'thread-item'}
                  type="button"
                  onClick={() => {
                    setActiveThreadId(thread.id)
                    setSettings((current) => ({ ...current, selectedModelId: thread.selectedModelId }))
                  }}
                >
                  <div className="thread-row">
                    <strong>{thread.title}</strong>
                    <span
                      role="button"
                      tabIndex={0}
                      className="thread-delete"
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteThread(thread.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          deleteThread(thread.id)
                        }
                      }}
                    >
                      ×
                    </span>
                  </div>
                  <small>{new Date(thread.updatedAt).toLocaleTimeString()}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <section className="floating-chat">
          <div className="chat-home">
            <h1>
              {getGreeting()}, <span>{settings.displayName || 'there'}</span>
            </h1>
            <p className="chat-subtitle">How can OpenFlow help you today?</p>
          </div>

          <form className="prompt-composer" onSubmit={handlePromptSubmit}>
            <div className="composer-head">
              <div className="model-picker">
                <button
                  type="button"
                  className="model-picker-button"
                  onClick={() => setShowModelMenu((current) => !current)}
                >
                  {activeModel.label} ▾
                </button>
                {showModelMenu ? (
                  <div className="model-picker-menu">
                    {MODEL_OPTIONS.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className="model-picker-item"
                        onClick={() => {
                          const nextSettings = { ...settings, selectedModelId: model.id }
                          setSettings(nextSettings)
                          persist(nextSettings, threads)
                          if (activeThread) updateThread(activeThread.messages, model.id)
                          setShowModelMenu(false)
                        }}
                      >
                        <strong>{model.label}</strong>
                        <small>{model.openRouterModel}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <small>{activeModel.openRouterModel}</small>
            </div>
            <textarea
              rows={3}
              placeholder="Ask anything..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
            />
            <div className="composer-footer">
              <p>{sending ? 'Generating response...' : settingsMessage}</p>
              <button className="primary-button send-button" type="submit" disabled={sending}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>

          <div className="chat-log compact-log">
            {!activeThread || activeThread.messages.length === 0 ? (
              <div className="empty-chat">
                <p>Start a new chat from the box above.</p>
              </div>
            ) : (
              activeThread.messages.map((message, index) => {
                const messageKey = `${activeThread.id}-${message.role}-${index}`
                const segments = message.role === 'assistant' ? parseAssistantSegments(message.content) : []
                return (
                  <article key={messageKey} className={`message message--${message.role}`}>
                    <span>{message.role === 'assistant' ? activeModel.label : 'You'}</span>
                    {message.role === 'assistant' ? (
                      <div className="assistant-response">
                        {segments.map((segment, segmentIndex) =>
                          segment.type === 'text' ? (
                            <p key={`${messageKey}-text-${segmentIndex}`} className="assistant-text">
                              {segment.content}
                            </p>
                          ) : (
                            <div key={`${messageKey}-code-${segmentIndex}`} className="code-output">
                              <div className="code-output-head">
                                <small>{segment.language}</small>
                                <div className="copy-actions">
                                  <button
                                    type="button"
                                    className="ghost-button copy-button"
                                    onClick={() => handleCopy(segment.code, `${messageKey}-code-${segmentIndex}`)}
                                  >
                                    {copiedMessageKey === `${messageKey}-code-${segmentIndex}`
                                      ? 'Copied'
                                      : 'Copy code'}
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-button copy-button"
                                    onClick={() => handleCopy(message.content, `${messageKey}-full`)}
                                  >
                                    {copiedMessageKey === `${messageKey}-full` ? 'Copied' : 'Copy full'}
                                  </button>
                                </div>
                              </div>
                              <pre>
                                <code>{segment.code}</code>
                              </pre>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </section>

        {panelView === 'settings' ? (
          <aside className="floating-panel settings-panel glass-card">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Settings</span>
                <h4>Local preferences</h4>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={() => setPanelView(null)}>
                Close
              </button>
            </div>

            <div className="settings-grid">
              <label>
                Display name
                <input
                  type="text"
                  value={settings.displayName}
                  onChange={(event) => setSettings((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label>
                OpenRouter API key
                <input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={settings.openRouterApiKey}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, openRouterApiKey: event.target.value }))
                  }
                />
              </label>
              <label>
                Temperature
                <input
                  type="range"
                  min="0"
                  max="1.2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, temperature: Number(event.target.value) }))
                  }
                />
                <span className="inline-value">{settings.temperature.toFixed(1)}</span>
              </label>
              <label>
                Max tokens
                <input
                  type="number"
                  min="256"
                  max="2048"
                  step="64"
                  value={settings.maxTokens}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, maxTokens: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            <div className="settings-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  persist(settings, threads)
                  setSettingsMessage('Settings saved locally.')
                }}
              >
                Save settings
              </button>
              <p className="status-line">{settingsMessage}</p>
            </div>
          </aside>
        ) : null}
      </section>
    </main>
  )
}

export default App
