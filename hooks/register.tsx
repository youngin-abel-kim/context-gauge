import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { barRows, cells, COLUMNS, details, detailsWidth, fromBreakdown, GLYPH, tokens } from './gauge'

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

/** Shows the details below the bar, or hides them. */
function toggle($: EngineInterface) {
  return update($, isOpen, open => !open)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-gauge',
      description: 'Show or hide the context window breakdown',
    })
    const started = await next(e)
    await measure($)

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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, gauge)
    if (e.props.hasSurvey || shown === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const isOpenNow = await read($, isOpen)
    const rows = barRows(shown)
    const label = `${isOpenNow ? '▾' : '▸'} Context`
    const tail = `${tokens(shown.totalTokens)} / ${tokens(shown.maxTokens)} (${shown.percentage}%)`
    // The terminal draws the button as `[ label ]`. One cell short of the row:
    // a band exactly as wide as its row blanks the engine's effort indicator
    // beneath it while the prompt holds text.
    const columns = e.props.bodyColumns - 1
    const width = Math.max(10, columns - (label.length + 4) - tail.length - 2)
    const widths = cells(rows, width)
    const lines = isOpenNow ? details(shown) : []

    return (
      <Box flexDirection="column" width={columns}>
        <Box columnGap={1}>
          <Button key="details" label={label} autoFocus onPress={() => toggle($)} />
          <Box key="bar">
            {rows.map((row, i) => (
              <Text color={row.color}>{GLYPH[row.kind].repeat(widths[i] ?? 0)}</Text>
            ))}
          </Box>
          <Text dimColor>{tail}</Text>
        </Box>
        {isOpenNow && (
          // As wide as its widest line, so the figures stay beside their labels.
          <Box key="breakdown" flexDirection="column" width={Math.min(columns, detailsWidth(lines))}>
            {lines.map(line => {
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
                      <Box width={COLUMNS.glyph} flexShrink={0}>
                        <Text color={line.color}>{line.glyph}</Text>
                      </Box>
                      <Box width={COLUMNS.label} flexShrink={0}>
                        <Text dimColor={line.isDim} wrap="truncate-end">
                          {line.label}
                        </Text>
                      </Box>
                      <Box flexGrow={1} flexShrink={1}>
                        <Text dimColor wrap="truncate-start">
                          {line.detail}
                        </Text>
                      </Box>
                      <Box width={COLUMNS.tokens} flexShrink={0} justifyContent="flex-end">
                        <Text dimColor={line.isDim}>{line.tokens}</Text>
                      </Box>
                      <Box width={COLUMNS.share} flexShrink={0} justifyContent="flex-end">
                        <Text dimColor>{line.share}</Text>
                      </Box>
                    </Box>
                  )
              }
            })}
          </Box>
        )}
      </Box>
    )
  })
}
