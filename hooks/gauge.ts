import type { SessionContextBreakdown } from 'claude-code'

import type { Gauge, GaugeRow, GaugeServer } from '../types'

/** Solid for what the window holds, shaded for what is left and for the reserve. */
export const GLYPH = { used: '█', free: '░', buffer: '▒', deferred: ' ' } as const

/** Where a row sits: what the window holds, then what is left, then the reserve at its end. */
const PLACE = { used: 0, free: 1, buffer: 2, deferred: 3 } as const

/**
 * Keeps every row that holds tokens, in /context's grid order, and the lists
 * the details pane draws.
 */
export function fromBreakdown(breakdown: SessionContextBreakdown): Gauge {
  const rows: GaugeRow[] = []
  for (const { name, tokens, color, kind } of breakdown.categories) {
    if (tokens > 0) {
      rows.push({ name, tokens, color, kind })
    }
  }
  rows.sort((a, b) => PLACE[a.kind] - PLACE[b.kind])

  const servers = new Map<string, GaugeServer>()
  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? { name: tool.serverName, tools: 0, loaded: 0, tokens: 0 }
    server.tools += 1
    if (tool.isLoaded) {
      server.loaded += 1
      server.tokens += tool.tokens
    }
    servers.set(tool.serverName, server)
  }

  const { skills } = breakdown

  return {
    rows,
    totalTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percentage: breakdown.percentage,
    model: breakdown.model,
    autoCompactAt: breakdown.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null,
    memoryFiles: breakdown.memoryFiles.map(({ type, path, tokens }) => ({ type, path, tokens })),
    mcpServers: [...servers.values()].sort((a, b) => b.tokens - a.tokens),
    skills: skills ? { listed: skills.includedSkills, total: skills.totalSkills, tokens: skills.tokens } : null,
    agents: breakdown.agents.map(({ agentType, tokens }) => ({ name: agentType, tokens })),
  }
}

/** The rows the bar draws: deferred schemas sit outside the window. */
export function barRows(gauge: Gauge): GaugeRow[] {
  return gauge.rows.filter(row => row.kind !== 'deferred')
}

/**
 * Splits `width` cells among the rows in proportion to their tokens, the
 * largest remainders rounding up, so the cells add up to `width` exactly.
 * A used row too small for a cell still gets one, taken from the widest row,
 * so every category that holds tokens shows on the bar.
 */
export function cells(rows: readonly GaugeRow[], width: number): number[] {
  const total = rows.reduce((sum, row) => sum + row.tokens, 0)
  if (total <= 0 || width <= 0) {
    return rows.map(() => 0)
  }

  const exact = rows.map(row => (row.tokens / total) * width)
  const out = exact.map(Math.floor)
  const remainder = (i: number) => (exact[i] ?? 0) - (out[i] ?? 0)
  const byRemainder = rows.map((_, i) => i).sort((a, b) => remainder(b) - remainder(a))
  const left = width - out.reduce((sum, n) => sum + n, 0)
  for (const i of byRemainder.slice(0, left)) {
    out[i] = (out[i] ?? 0) + 1
  }

  for (const [i, row] of rows.entries()) {
    if (row.kind !== 'used' || out[i] !== 0) {
      continue
    }
    const widest = out.indexOf(Math.max(...out))
    if ((out[widest] ?? 0) <= 1) {
      break
    }
    out[widest] = (out[widest] ?? 0) - 1
    out[i] = 1
  }

  return out
}

/** A token count in at most four characters: `850`, `3.1k`, `124k`, `1.0M`. */
export function tokens(n: number): string {
  if (n < 1_000) {
    return String(Math.round(n))
  }
  if (n < 10_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  if (n < 1_000_000) {
    return `${Math.round(n / 1_000)}k`
  }

  return `${(n / 1_000_000).toFixed(1)}M`
}

/** One line of the details pane. */
export type Line =
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'blank' }
  | {
      kind: 'row'
      glyph: string
      color?: string
      label: string
      detail: string
      tokens: string
      share: string
      isDim: boolean
    }

/**
 * The details pane, line by line: the categories with their share of the
 * window as /context lists them, then what the memory files, MCP servers,
 * skills and custom agents each carry.
 */
export function details(gauge: Gauge): Line[] {
  const share = (n: number) => `${((n / gauge.maxTokens) * 100).toFixed(1)}%`
  const item = (label: string, detail: string, n: number, isDim = false): Line => ({
    kind: 'row',
    glyph: '',
    label,
    detail,
    tokens: tokens(n),
    share: '',
    isDim,
  })

  const summary = [gauge.model, `${tokens(gauge.totalTokens)} of ${tokens(gauge.maxTokens)} (${gauge.percentage}%)`]
  if (gauge.autoCompactAt !== null) {
    summary.push(`auto-compacts at ${tokens(gauge.autoCompactAt)}`)
  }

  const lines: Line[] = [{ kind: 'note', text: summary.join(' · ') }, { kind: 'blank' }]
  for (const row of gauge.rows) {
    const isDeferred = row.kind === 'deferred'
    lines.push({
      kind: 'row',
      glyph: GLYPH[row.kind],
      color: row.color,
      label: row.name,
      detail: '',
      tokens: tokens(row.tokens),
      share: isDeferred ? '' : share(row.tokens),
      isDim: row.kind !== 'used',
    })
  }

  const section = (heading: string, rows: Line[]) => {
    if (rows.length > 0) {
      lines.push({ kind: 'blank' }, { kind: 'heading', text: heading }, ...rows)
    }
  }
  section(
    'Memory files',
    gauge.memoryFiles.map(file => item(file.type, file.path, file.tokens)),
  )
  section(
    'MCP tools',
    gauge.mcpServers.map(server => {
      const loaded = server.loaded < server.tools ? `, ${server.loaded} loaded` : ''
      return item(server.name, `${server.tools} tools${loaded}`, server.tokens, server.loaded === 0)
    }),
  )
  section(
    'Custom agents',
    gauge.agents.map(agent => item(agent.name, '', agent.tokens)),
  )
  if (gauge.skills) {
    const { listed, total } = gauge.skills
    section('Skills', [item(`${listed} of ${total} listed`, '', gauge.skills.tokens)])
  }

  lines.push({ kind: 'blank' }, { kind: 'note', text: 'Estimated locally; /context counts exactly.' })

  return lines
}
