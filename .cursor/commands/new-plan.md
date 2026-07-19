# /new-plan

Create a **new advisor plan** for the topic the user names after this command (e.g. `/new-plan dark mode for reports`).

You are acting as **/improve plan** + **Ponytail** — advisor only for planning; do not implement product code in this command.

## Hard requirements

1. **Graphify first** (mandatory before Read/Grep/Glob exploration):
   - From repo root: `graphify query "<topic>"`
   - Use `graphify path` / `graphify explain` when useful
   - Only then open specific files to draft the plan
2. **Read improve skill** before writing:
   - `.cursor/skills/improve/SKILL.md`
   - `.cursor/skills/improve/references/plan-template.md`
3. **Apply Ponytail** (`.cursor/rules/PonyTail.mdc`): YAGNI, reuse existing patterns, smallest plan that works, explicit STOP conditions
4. **Write plan file only** under `plans/NNN-slug.md` (next free number from `plans/README.md`)
5. **Update** `plans/README.md` index (status TODO, batch/order)
6. **Notion** — use **Cursor Notion MCP** `plugin-notion-workspace-notion` (never Docker MCP Notion):
   - Parent data source: `collection://39fdd599-1188-8080-a260-000b06c293b8` (Advanced Sales board)
   - Create page with:
     - **Name**: `[NNN] <short title>`
     - **Status**: `Not started`
     - **Content**: plain-language summary + **Checklist** (`- [ ]` items matching the plan) + link to `plans/NNN-….md`
7. After code/plan files change: `graphify update .` if you touched source; for plan-only, still update README

## Plan content must include

- Why (plain language + technical)
- Current state with file paths / short excerpts
- Commands table (`npm run test:frontend` / `npm run test:backend` / build as relevant)
- Scope in / out
- Ordered steps with verify gates
- **Checklist** section (same items as Notion)
- STOP conditions
- Stamp `Planned at` with `git rev-parse --short HEAD`

## Output to user

- Plan path
- Notion page URL
- Recommended order vs other open plans
- Do **not** start implementation unless they run `/implement-task`
