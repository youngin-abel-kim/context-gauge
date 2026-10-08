/**
 * One /context row: content that occupies the window (`used`), the window
 * left (`free`), the compaction reserve (`buffer`), or tool schemas loaded on
 * demand and outside the window (`deferred`).
 */
export type GaugeRow = {
  name: string
  tokens: number
  /** The theme key /context draws the row in. */
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** One MCP server's tool schemas, summed. */
export type GaugeServer = {
  name: string
  tools: number
  /** How many of its schemas are in the window rather than deferred. */
  loaded: number
  /** The loaded schemas' tokens. */
  tokens: number
}

/** The context window broken down, as the band last measured it. */
export type Gauge = {
  rows: GaugeRow[]
  totalTokens: number
  /** The window measured against: the model's limit, or a smaller compaction window. */
  maxTokens: number
  /** `totalTokens` over `maxTokens`, a whole percentage. */
  percentage: number
  model: string
  /** The token count auto-compaction runs at; null while it is off. */
  autoCompactAt: number | null
  memoryFiles: { type: string; path: string; tokens: number }[]
  mcpServers: GaugeServer[]
  skills: { listed: number; total: number; tokens: number } | null
  agents: { name: string; tokens: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'context-gauge': { gauge: Gauge | null; isOpen: boolean }
  }
}
