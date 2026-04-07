---
name: code
description: 'Implement, debug, and verify code changes in the Aliens project. Use when fixing bugs, wiring editor/runtime behavior, adding small features, tracing regressions, or making minimal validated diffs with repo-specific guardrails and test checks.'
argument-hint: 'Describe the bug, feature, or subsystem to work on'
user-invocable: true
---

# Code

Use this skill for repo-aware coding work in the Aliens tactical shooter: bug fixes, feature work, editor/runtime wiring, regression cleanup, and small validated refactors.

## When to Use
- Fix a runtime or editor bug
- Implement a contained gameplay or tooling feature
- Trace a regression across systems
- Make a small code change that must be verified before completion

## Core Workflow

### 1. Read the repo state first
- Check `md/handoff.md` before touching shared files.
- Read `md/WORKFLOW.md` when coordination or doc hygiene matters.
- Pull in `md/collab.md` or `md/progress.md` only if recent context is needed.
- Respect project guardrails in `.github/copilot-instructions.md` and `CLAUDE.md`.

### 2. Frame the task tightly
- Restate the requested change in one sentence.
- Identify the exact subsystem and likely files.
- Prefer the narrowest possible diff.

### 3. Investigate before fixing
- Reproduce the issue or inspect the current code path.
- Read stack traces and error output fully.
- Trace data flow through the real runtime/editor boundary.
- Compare with nearby working patterns before editing.
- Test one hypothesis at a time; do not stack unrelated fixes.

### 4. Implement the smallest correct change
- Change only what the task requires.
- Avoid unrelated cleanup, style churn, or broad refactors.
- Preserve repo invariants:
  - `TILE_SIZE` stays `64`
  - do not add gameplay sprite `setScale()` calls (HUD is the exception)
  - `DoorActionSystem.update()` must run after `movementSystem.update()`
  - do not change `Phaser.Scale.FIT`
  - do not raise mission `m1` enemy budget above `24`

### 5. Verify before claiming success
- Syntax-check each modified JS file with `node --check <file>`.
- Run the closest targeted test first.
- Use `bash ./scripts/verify.sh` for broad or cross-system changes.
- For editor/UI work, prefer real behavior checks over mock-only assertions.
- Do not claim a fix or pass state without fresh command output.

### 6. Close out clearly
- Summarize what changed, why, and the exact verification evidence.
- If shared areas were touched for meaningful work, leave the handoff state usable.

## Decision Rules
- **Unclear bug** → reproduce, trace, compare a working path, then patch.
- **Shared file** → check `md/handoff.md` first.
- **UI/editor behavior** → verify real interactions when possible.
- **Large request** → split into small verifiable steps; keep one active task at a time.
- **After multiple failed attempts** → stop guessing and return to root-cause analysis.

## Completion Criteria
A code task is complete only when:
1. the requested behavior is implemented or the root cause is clearly documented,
2. changed files are syntax-clean,
3. relevant tests or checks were run and reported,
4. the diff remains minimal and within repo guardrails.

## Useful Checks
- `node --check src/path/to/file.js`
- `node scripts/<targeted-test>.mjs`
- `bash ./scripts/verify.sh`

## Example Prompts
- `/code fix the authored spawn marker regression and verify it`
- `/code trace why the HUD panel state is not saving from the editor`
- `/code implement a small motion tracker polish change with minimal diff`
