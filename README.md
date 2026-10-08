# context-gauge

A Claude Code mod that draws the context window as a one-line gauge above the prompt, broken down
by category the way `/context` breaks it down. Click it for the details.

```
▸ 62% ██████████████████████████████████████░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒ 124k / 200k
```

Each category is drawn in the theme colour `/context` gives it, so the segments match its grid.

## What it shows

- **The bar**: one segment per category that occupies the window (system prompt, system tools,
  MCP tools, custom agents, memory files, skills, messages), then the free space `░` and the
  autocompact buffer `▒`. A category that holds tokens always gets at least one cell.
- **The figures**: the percentage and `used / window` are measured against the window
  auto-compaction counts from, which can be smaller than the model's limit. It's the same figure
  `/context` prints.
- **The details**: run `/context-gauge`, press `ctrl+x tab` then Enter, or click `▸ 62%` to open
  a pane. It lists each category with its tokens and share of the window, then the memory files, the
  MCP servers, the custom agents and the skills listing with what each one costs. It also lists
  deferred tool schemas, which sit outside the window and aren't on the bar. `Esc` closes it, and
  so does the command or the toggle again.

  Clicks reach the band only in Claude Code's fullscreen layout. Inside tmux, Claude Code uses the
  main-screen layout by default, so there use the command or the keys, or start Claude Code with
  `CLAUDE_CODE_NO_FLICKER=1` (and `set -g mouse on` in tmux) to get the fullscreen layout.

```
claude-opus-5-5 · 124k of 200k (62%) · auto-compacts at 155k

█ System prompt                  3.1k   1.6%
█ System tools                    12k   6.2%
█ Messages                       107k  53.3%
░ Free space                      31k  15.5%
▒ Autocompact buffer              45k  22.5%
  MCP tools (deferred)           9.0k

Memory files
  Project        /repo/CLAUDE.md 2.0k
```

It updates at session start, after each turn and after a `/compact`. A `/clear` hides it until the
next turn. Counts are local estimates, so measuring sends no token-count requests, and they can
differ a little from `/context`'s. Collapse the band with its `[-]` or `ctrl+x ctrl+a`.

## Install

```bash
claude plugin marketplace add youngin-abel-kim/context-gauge
claude plugin install context-gauge@context-gauge
```

Mods need Claude Code 2.1.287 or later. Installing at the user scope turns it on in every session.

## Layout

- `hooks/register.tsx`: the hooks, which measure the window and draw the band.
- `hooks/gauge.ts`: the breakdown → bar layout, with no engine calls.
- `types/index.d.ts`: the `$.state` contract.
- `tests/`: run by `claude plugin test`.

## Release

1. Edit `hooks/`.
2. Check it:
   ```bash
   claude plugin validate . && claude plugin test .
   ```
3. Bump `version` in `.claude-plugin/plugin.json`. Pushing without a bump doesn't update installed
   copies.
4. Commit and push.
5. Installed copies update via auto-update, or right away with:
   ```bash
   claude plugin marketplace update context-gauge && claude plugin update context-gauge@context-gauge
   ```
   then run `/reload-plugins`.

## Try local edits

```bash
claude --plugin-dir ~/workspace/context-gauge/main
```

Saving a file reloads the mod in that session. When the engine loads the mod it writes its type
declarations to `.claude-plugin/types/` (ignored by git), so `tsc -p .` type-checks it.

If the installed copy also loads there, run
`claude plugin disable context-gauge@context-gauge --scope local` inside the repo.
