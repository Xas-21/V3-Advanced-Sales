# /implement-task

Implement the plan or Notion task the user names after this command (e.g. `/implement-task 034` or `/implement-task upsert IDOR`).

## Lifecycle (Notion + repo)

1. **Resolve** the target: `plans/NNN-*.md` and/or Notion card on Advanced Sales board  
   - Notion MCP: `plugin-notion-workspace-notion` only (not Docker MCP)  
   - Data source: `collection://39fdd599-1188-8080-a260-000b06c293b8`
2. **Start**: set Notion **Status** → `In progress`. Optionally note started time in page content.
3. **Orient**: `graphify query` / `path` for the plan’s symbols **before** exploring with Read/Grep.
4. **Execute** the plan step by step. Match Ponytail (smallest correct diff). Run the plan’s verify commands.
5. **Progress reporting** — after each meaningful step, update the user in **two layers**:
   - **Plain language:** what changed and what they can try in the UI (no jargon).
   - **Technical:** files, APIs, tests, risks.
6. **Checklist sync**: tick `- [ ]` → `- [x]` in the plan file **and** Notion page content as steps complete.
7. **Do not** set Notion to **Done** when you finish coding. Stop and ask the user to confirm (“everything looks fine, no other changes”).
8. **Only after explicit user confirmation**:  
   - Notion Status → `Done`  
   - `plans/README.md` status → DONE  
   - Plan status block → Completed  
   - `graphify update .` if source changed

## Rules

- Stay inside the plan’s **In scope**. Out-of-scope discoveries → report, don’t silently expand.
- Hit a **STOP condition** → stop and ask; don’t improvise.
- Never commit unless the user asks.
- Prefer restarting Docker services only when needed for the change to show.

## If the task has no plan file yet

Run the same workflow as `/new-plan` for that topic first, create Notion **Not started**, then immediately continue this implement flow (move to In progress).
