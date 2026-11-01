# Third-party notices

## Catan setup bot heuristic

The settlement-scoring heuristic in `src/game/session/bot.ts` adapts `strongEvaluateVertex` from [8910work-cell/catan-ai](https://github.com/8910work-cell/catan-ai/blob/3e75df8c48e44a3f474a0bb366f654844cec3d37/strong_ai.js), pinned at commit `3e75df8c48e44a3f474a0bb366f654844cec3d37`.

Copyright (c) 2026 8910work-cell. MIT license; full notice in [licenses/catan-ai-MIT.txt](licenses/catan-ai-MIT.txt).

Adaptations: English comments, explicit player observation, canonical OpenCatan coordinates/resources, no global state, bounded legal-choice selection and injected tie-breaking randomness. No upstream UI, artwork, TensorFlow, learned weights or MCTS runtime is imported. Other action priorities and session integration are implemented here.

This notice does not resolve licensing/asset questions for the pre-existing OpenCatan code. See PRD LEG-01 and the rights follow-up.
