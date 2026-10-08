import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { barRows, cells, details, fromBreakdown, GLYPH, tokens } from './gauge'

const PANE = 'context-gauge'

const gauge = atom({ plugin: 'context-gauge', key: 'gauge' } as const, null)
const isOpen = atom({ plugin: 'context-gauge', key: 'isOpen' } as const, false)

/**
 * Measures the window by category. `summary` estimates locally, as the status
 * line does, so a measurement sends no token-count requests.
 */
async function measure($: EngineInterface) {
  const { breakdown } = (await $.session.usage({ breakdown: 'summary' })).context
  await update($, gauge, () => (breakdown ? fromBreakdown(breakdown) : null))
}

async function isShown($: EngineInterface) {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

/** Opens the details pane, or closes it; says so when the surface would not place it. */
async function toggle($: EngineInterface) {
  try {
    if (await isShown($)) {
      await $.ui.close({ id: PANE })
      await update($, isOpen, () => false)

      return
    }

    const shown = await $.state.get({ plugin: 'context-gauge', key: 'gauge' })
    const rows = shown.value ? details(shown.value).length : undefined
    const opened = await $.ui.open({ id: PANE, title: 'Context', focus: true, closeOnEscape: true, rows })
    await update($, isOpen, () => opened.isPlaced)
    if (!opened.isPlaced) {
      $.ui.toast(`context-gauge: the details pane did not open: ${opened.reason}`)
    }
  } catch (error) {
    $.ui.toast(`context-gauge: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-gauge',
      description: 'Show or hide the context window breakdown',
    })
    const started = await next(e)
    await measure($)
    // A reload starts here too, with the pane open or not as it was.
    const isOpenNow = await isShown($)
    await update($, isOpen, () => isOpenNow)

    return started
  })

  // Clicks reach the band only in the fullscreen layout; the command works on the main screen too.
  on('command.run', { command: 'context-gauge' }, async $ => {
    await toggle($)

    return {}
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await measure($)
    }

    return next(e)
  })

  // No turn follows a /compact, so no `session.measure` either.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (e.trigger !== 'precompute') {
      await measure($)
    }

    return compacted
  }).catch(($, e, next) => next(e))

  // A /clear empties the window; the band waits for the next turn's measurement.
  on('session.end', { reason: 'clear' }, async ($, e, next) => {
    await update($, gauge, () => null)

    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await update($, isOpen, () => false)

    return closed
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, gauge)
    if (e.props.hasSurvey || shown === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const rows = barRows(shown)
    const label = `${(await read($, isOpen)) ? '▾' : '▸'} ${shown.percentage}%`
    const tail = `${tokens(shown.totalTokens)} / ${tokens(shown.maxTokens)}`
    // One cell short of the row: a band exactly as wide as its row blanks the
    // engine's effort indicator beneath it while the prompt holds text.
    const width = Math.max(10, e.props.bodyColumns - label.length - tail.length - 3)
    const widths = cells(rows, width)

    return (
      <Box columnGap={1}>
        <Button key="details" label={label} plain autoFocus onPress={() => toggle($)} />
        <Box key="bar">
          {rows.map((row, i) => (
            <Text color={row.color}>{GLYPH[row.kind].repeat(widths[i] ?? 0)}</Text>
          ))}
        </Box>
        <Text dimColor>{tail}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const shown = await read($, gauge)
    if (shown === null) {
      return <Text dimColor>Measured again after the next turn.</Text>
    }

    return (
      <Box flexDirection="column">
        {details(shown).map(line => {
          switch (line.kind) {
            case 'heading':
              return <Text bold>{line.text}</Text>
            case 'note':
              return <Text dimColor>{line.text}</Text>
            case 'blank':
              return <Text> </Text>
            case 'row':
              return (
                <Box columnGap={1}>
                  <Box width={1} flexShrink={0}>
                    <Text color={line.color}>{line.glyph}</Text>
                  </Box>
                  <Box width={24} flexShrink={0}>
                    <Text dimColor={line.isDim} wrap="truncate-end">
                      {line.label}
                    </Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text dimColor wrap="truncate-start">
                      {line.detail}
                    </Text>
                  </Box>
                  <Box width={5} flexShrink={0} justifyContent="flex-end">
                    <Text dimColor={line.isDim}>{line.tokens}</Text>
                  </Box>
                  <Box width={6} flexShrink={0} justifyContent="flex-end">
                    <Text dimColor>{line.share}</Text>
                  </Box>
                </Box>
              )
          }
        })}
      </Box>
    )
  })
}
