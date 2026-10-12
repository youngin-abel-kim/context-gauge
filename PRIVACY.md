# Privacy

context-gauge collects nothing, stores nothing beyond the session and sends nothing anywhere.

## What it reads

The context window breakdown Claude Code already keeps for the session, the same one `/context`
shows: token counts by category, the model's name, the paths of the memory files, the names of
the MCP servers and custom agents, and how many skills are listed.

## What it keeps

The last breakdown it measured and whether the details are open, in the session's own state, to
draw the gauge. Nothing is kept across sessions, and a `/clear` discards the breakdown.

## What it sends

Nothing. It makes no network requests, has no telemetry or analytics, reads and writes no files
and starts no processes. Its counts are estimated locally, so measuring sends no token-count
requests either.

## Contact

Questions go to [the repository's issues](https://github.com/youngin-abel-kim/context-gauge/issues).

Last updated: 12 October 2026.
