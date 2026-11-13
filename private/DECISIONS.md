# Decisions

- **Duration chart uses a log height scale fixed from the last run.** Quick unit tests and slow browser tests
  both read, and bars never move once drawn. A slower test changes the scale once, in one step.
- **Failures are marked by a dot just above their own bar** (PR #9), not a row along the top or a full-height
  tint: the dot stays tied to its test and the chart stays calm.
