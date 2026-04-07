# Workflow

Canonical workflow for humans and LLM sessions working in this repo.

## Canonical Docs

- `README.md`: user-facing project overview, run instructions, controls, structure
- `md/WORKFLOW.md`: workflow rules and repo hygiene
- `md/handoff.md`: current ownership, active work, do-not-touch areas
- `md/collab.md`: shared findings, cross-model notes, coordination details
- `md/progress.md`: chronological implementation and validation log
- `md/archive/`: historical/superseded plans and research only — not current instructions

## Start Order

1. Read `README.md` for the current project surface.
2. Read `md/handoff.md` before touching shared areas.
3. Read `md/collab.md` if the task overlaps ongoing work or recent findings.
4. Read `md/progress.md` only when you need historical implementation context.

## Working Rules

- Treat `md/` as the canonical operational documentation.
- Keep `README.md` short. Do not move coordination or long change history into it.
- Claim or update ownership in `md/handoff.md` before editing shared files.
- Use `md/collab.md` for shared findings, recommendations, and cross-model notes.
- Use `md/progress.md` only for dated history and validation notes.
- When you stop work for any reason, update the relevant `md/` files in the same pass:
  - `md/handoff.md` for current ownership/status
  - `md/collab.md` for cross-session findings or risks
  - `md/progress.md` for what changed and what was validated
- Leave the next owner a usable handoff, not just code changes.
- Keep handoff state current. Do not let completed work remain listed as active.
- Prefer updating an existing canonical doc over creating a new operational markdown file.
- If a root-level doc duplicates a canonical `md/` file, trim it and point to the canonical source.

## Coordination Rules

- Use role-first naming in coordination docs:
  - `Role`: stable responsibility such as `Coding AI`, `Graphics AI`, `Shaders AI`
  - `Model`: underlying model such as `Codex`, `Claude`, `Gemini`
  - `Session`: optional date or suffix when multiple instances of one model are active
- Prefer role names over model names in ownership tables and do-not-touch notes.
- Treat models as replaceable and roles as persistent. If a model hits limits, the replacement session should keep the same role label when inheriting the work.
- Do not edit files claimed by another active session without first clearing the conflict in `md/handoff.md`.
- Keep do-not-touch notes specific to paths or subsystems, not broad warnings.
- If ownership is unknown or stale, note the uncertainty in `md/handoff.md` and proceed conservatively.
- Preserve user changes outside your scope. Documentation maintenance does not grant permission to edit gameplay or source code.

## Markdown Hygiene

- Before deleting any `.md` file, search the repo for references to it.
- Do not delete docs that still contain unique operational knowledge until that knowledge is merged into a canonical file.
- Prefer deleting obsolete operational docs once their useful content is absorbed elsewhere.
- Keep research/reference docs separate from workflow docs. Do not mix design research into handoff or progress logs.
- Treat `md/archive/` as background history only. Do not use archived files as active instructions unless the task explicitly needs historical context.

## Validation

- After doc changes, verify links and filenames still resolve.
- If docs describe a command, make sure it still matches the current repo entry points.
- If documentation cleanup leaves uncertain ownership or stale code references, record that in `md/collab.md`.
