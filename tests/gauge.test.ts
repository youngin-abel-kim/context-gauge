import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PaneOpenArgs, RenderPropsOf, SessionUsage } from 'claude-code'

import { cells } from '../hooks/gauge'

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    tokens: 124_000,
    window: 200_000,
    percent: 62,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 3_100, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'System tools', tokens: 12_400, color: 'inactive', isDeferred: false, kind: 'used' },
        { name: 'Memory files', tokens: 2_000, color: 'claude', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 106_500, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'MCP tools (deferred)', tokens: 9_000, color: 'inactive', isDeferred: true, kind: 'deferred' },
        { name: 'Autocompact buffer', tokens: 45_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
        { name: 'Free space', tokens: 31_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
      ],
      totalTokens: 124_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'auto',
      percentage: 62,
      gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [{ path: '/repo/CLAUDE.md', type: 'Project', tokens: 2_000 }],
      mcpTools: [
        { name: 'mcp__notion__search', serverName: 'notion', tokens: 600, isLoaded: true },
        { name: 'mcp__notion__fetch', serverName: 'notion', tokens: 9_000, isLoaded: false },
      ],
      agents: [],
      skills: { totalSkills: 25, includedSkills: 23, tokens: 4_100, skillFrontmatter: [] },
      autoCompactThreshold: 155_000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const PANE: RenderPropsOf['Pane'] = {
  title: 'Context',
  isFocused: true,
  bodyColumns: 70,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

/** Answers the engine's side of a measurement. */
function answerUsage(on: On) {
  on('session.usage', () => ({ value: USAGE }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
}

/** Raises a measurement, as the engine does after a turn. */
async function measure($: Engine) {
  await $.session.measure({
    context: { tokens: 124_000, window: 200_000, percent: 62 },
    rateLimits: [],
    changed: ['context'],
  })
}

test('the cells fill the bar exactly and every used row gets one', () => {
  const rows = [
    { name: 'tiny', tokens: 10, color: 'text', kind: 'used' },
    { name: 'messages', tokens: 120_000, color: 'text', kind: 'used' },
    { name: 'free', tokens: 80_000, color: 'text', kind: 'free' },
  ] as const
  for (const width of [10, 37, 64, 200]) {
    const out = cells(rows, width)
    expect(out.reduce((sum, n) => sum + n, 0)).toBe(width)
    expect(out[0]).toBe(1)
  }
})

test('the band is one line, a cell short of the row: the toggle, the bar and the figures', async ($, on) => {
  answerUsage(on)
  await measure($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-gauge', surface, component: 'AbovePrompt', props: BAND })
    expect((await ui.find({ key: 'details' }))?.text).toBe('▸ 62%')
    expect(await ui.find({ type: 'Text', text: '124k / 200k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Messages/ })).toBeUndefined()

    const bar = (await ui.find({ key: 'bar' }))?.text ?? ''
    expect(bar).toMatch(/^█+░+▒+$/)
    expect(bar.length).toBe(80 - '▸ 62%'.length - '124k / 200k'.length - 3)
    await ui.unmount()
  }
})

test('pressing the toggle opens the details pane', async ($, on) => {
  answerUsage(on)
  const opened: PaneOpenArgs[] = []
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await measure($)

  const band = await $.ui.mount({ plugin: 'context-gauge', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'details' })
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatchObject({ id: 'context-gauge', focus: true, closeOnEscape: true })
  expect((await band.find({ key: 'details' }))?.text).toBe('▾ 62%')

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({
      plugin: 'context-gauge',
      surface,
      component: 'Pane',
      requestId: 'context-gauge',
      props: PANE,
    })
    expect(await pane.find({ type: 'Text', text: /auto-compacts at 155k/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Messages' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '53.3%' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '/repo/CLAUDE.md' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '2 tools, 1 loaded' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '23 of 25 listed' })).toBeDefined()
    await pane.unmount()
  }
})

test('/context-gauge opens the details pane on the main screen too', async ($, on) => {
  answerUsage(on)
  const opened: PaneOpenArgs[] = []
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await measure($)

  const ran = await $.command.run({
    command: 'context-gauge',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toBeUndefined()
  expect(opened[0]).toMatchObject({ id: 'context-gauge', focus: true })
})
