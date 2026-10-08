import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionUsage } from 'claude-code'

import { cells, details, detailsWidth, fromBreakdown } from '../hooks/gauge'

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
    expect((await ui.find({ key: 'details' }))?.text).toBe('▸ Context')
    expect(await ui.find({ type: 'Text', text: '124k / 200k (62%)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Messages/ })).toBeUndefined()

    const bar = (await ui.find({ key: 'bar' }))?.text ?? ''
    expect(bar).toMatch(/^█+░+▒+$/)
    expect(bar.length).toBe(80 - '[ ▸ Context ]'.length - '124k / 200k (62%)'.length - 3)
    await ui.unmount()
  }
})

test('the details are as wide as their widest line: here the summary', () => {
  const breakdown = USAGE.context.breakdown
  if (!breakdown) {
    throw new Error('the fixture has a breakdown')
  }
  // The summary note is 60 cells; the widest row, `2 tools, 1 loaded`, 40 + 17.
  expect(detailsWidth(details(fromBreakdown(breakdown)))).toBe(60)
})

test('pressing the toggle shows the details below the bar, and again hides them', async ($, on) => {
  answerUsage(on)
  await measure($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'context-gauge', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ type: 'Text', text: 'Messages' })).toBeUndefined()

    await band.press({ key: 'details' })
    expect((await band.find({ key: 'details' }))?.text).toBe('▾ Context')
    expect(await band.find({ type: 'Text', text: /auto-compacts at 155k/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: 'Messages' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '53.3%' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '/repo/CLAUDE.md' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '2 tools, 1 loaded' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '23 of 25 listed' })).toBeDefined()
    expect((await band.find({ key: 'breakdown' }))?.props.width).toBe(60)

    await band.press({ key: 'details' })
    expect((await band.find({ key: 'details' }))?.text).toBe('▸ Context')
    expect(await band.find({ key: 'breakdown' })).toBeUndefined()
    await band.unmount()
  }
})

test('a band narrower than the details holds them to its width', async ($, on) => {
  answerUsage(on)
  await measure($)

  const band = await $.ui.mount({
    plugin: 'context-gauge',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND, bodyColumns: 50 },
  })
  await band.press({ key: 'details' })
  expect((await band.find({ key: 'breakdown' }))?.props.width).toBe(49)
})

test('/context-gauge shows the details on the main screen too', async ($, on) => {
  answerUsage(on)
  await measure($)

  const ran = await $.command.run({
    command: 'context-gauge',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toBeUndefined()

  const band = await $.ui.mount({ plugin: 'context-gauge', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: 'Messages' })).toBeDefined()
})
