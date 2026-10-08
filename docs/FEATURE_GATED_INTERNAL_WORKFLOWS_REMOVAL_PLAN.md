# Feature-Gated and Internal Workflow Removal Plan

## Goal

Reduce Tau's source and runtime surface by removing internal, enterprise, and experimental workflow implementations that are not part of the local personal CLI. The external build currently defines `USER_TYPE` as `external` and its `bun:bundle` feature shim returns `false` for every feature, so many such paths are already excluded from the shipped bundle but remain in the source tree and build scaffolding.

Removal is underway. The first implementation slices remove unavailable daemon/background/template/runner CLI fast paths and their build-shim exports, remove the Ant-only command registry and its internal/debug command stubs, remove absent test/context-inspection/terminal-capture tools and their shortcut plumbing, register `/commit` in the normal command list, remove the `WORKFLOW_SCRIPTS` tool/task/command registrations and transcript-grouping plumbing, and remove UDS cross-session peer registration, transport, message rendering, and CLI plumbing. In-process agent and teammate messaging remains. Readers for historical `local_workflow` task IDs and outcomes, plus the optional SDK `workflow_name` field, remain for Tau-owned data and wire compatibility. The remaining feature-family audit and removals below are still pending; no configuration migration is planned.

## Scope

### Candidate workflow families

1. **Dedicated CLI modes and runners**
   - `DAEMON` and `BG_SESSIONS` dispatch in `src/entrypoints/cli.tsx`, plus their `main.tsx`, `query.ts`, `REPL.tsx`, session, and exit hooks.
   - `TEMPLATES` job commands and classifier/stop-hook integration.
   - `BYOC_ENVIRONMENT_RUNNER` and `SELF_HOSTED_RUNNER` fast paths.
   - Several referenced entrypoint modules are absent in the current tree (`src/daemon/`, `src/environment-runner/`, `src/self-hosted-runner/`, `src/cli/bg.ts`, `src/cli/handlers/templateJobs.ts`). Trace the build shims and imports before removing any branch or shim export.

2. **Internal-only commands and tools**
   - `INTERNAL_ONLY_COMMANDS` in `src/commands.ts`, currently containing backfill/debug/diagnostic, mock-limit, onboarding, sharing, and other Ant-only commands.
   - `process.env.USER_TYPE === 'ant'` gated command/tool registration in `src/commands.ts` and `src/tools.ts`, including the internal REPL and suggested-background-PR tool.
   - Feature-gated developer tools such as overflow/context inspection, terminal capture, history snipping, and torch. Verify each tool's remaining uses before deleting its implementation.

3. **Assistant and orchestration products**
   - `KAIROS`, `KAIROS_BRIEF`, `KAIROS_DREAM`, `KAIROS_PUSH_NOTIFICATION`, and `PROACTIVE` assistant/brief/proactive surfaces, including their commands, prompts, settings, notifications, scheduler, and message layouts.
   - `BUDDY` companion UI and `COORDINATOR_MODE` orchestration/UI.
   - `UDS_INBOX` peer communication has been removed, including the missing peer command/tool registration, socket startup, cross-session routing and message UI. `FORK_SUBAGENT` is an inherited-context path through the existing in-process query loop, not a separate process runner; preserve that agent behavior and the shared `utils/forkedAgent` query helper. The unavailable `/fork` command registration was removed; `/fork` remains a branch-command alias.
   - `AGENT_TRIGGERS` cron scheduling. `WORKFLOW_SCRIPTS` tool/task/command registration and transcript-grouping plumbing have been removed; historical task ID/outcome readers and the optional SDK `workflow_name` field remain. Do not infer that generic skills, workflow recipes, or user-authored hooks are part of these products.

## Explicitly preserve unless separately decided

- The provider/model APIs, authentication, core agent loop, in-process agents, MCP/ACP/SDK interfaces, terminal UI, and local session persistence.
- Permission prompts, permission rules, dangerous-command checks, hooks, file protections, and shared shell/Git safety.
- Local Git and worktree operations, Tau-owned settings and sessions, and existing session/config readers. Do not migrate or rewrite historical data just to remove feature-specific fields.
- Useful feature-gated local functionality such as context-collapse/compaction behavior, history search/snipping, skill search, commit attribution, and team-memory sync until each has a separate product decision and compatibility review.
- Provider, account, policy, and security branches guarded by `USER_TYPE` merely because they are internal-looking. A `USER_TYPE` search is an inventory aid, not a removal specification.

### `/commit` registry discrepancy

`/commit` is imported into `INTERNAL_ONLY_COMMANDS`, which is only appended when `USER_TYPE === 'ant'`; the normal external build defines `USER_TYPE` as `external`. Reconcile this with the local-CLI requirement to preserve `/commit`: either register the command in the external CLI or explicitly revise the product decision. Keep the shared Git safety protocol either way.

## Implementation sequence

1. **Freeze the external-build baseline.** Inventory all `feature('NAME')` values and their definitions in `build.mjs`/`build.ts`; record which commands, tools, CLI routes, settings, and task types appear in the built external CLI. Confirm the two build paths still agree.
2. **Approve a removal list by behavior, not by flag name.** A flag may guard useful local behavior as well as an internal workflow. Trace consumers, persisted state, tests, and feature-specific modules for each candidate above.
3. **Resolve command and CLI contracts.** Fix the `/commit` discrepancy, then remove only approved command registrations, tool registrations, hidden argument routes, and help/docs claims. Confirm users receive a normal unknown-command/option response rather than a broken path.
4. **Remove implementation and orchestration plumbing.** Delete feature-specific source modules only when all static and dynamic imports are gone. Remove matching UI/settings/task/message paths and generated shim exports only after verifying no preserved feature depends on them. The first passes removed the dead CLI dispatches for daemon workers, detached background sessions, template jobs, and BYOC/self-hosted runners, plus their shim exports in both build scripts. They also removed `INTERNAL_ONLY_COMMANDS` and its Ant-only debug, mock-limit, sharing, onboarding, and maintenance command entries; removed registrations and UI/keybindings for absent overflow-test, context-inspection, and terminal-capture tools; moved `/commit` to the normal command list; removed `WORKFLOW_SCRIPTS` registrations and transcript-grouping plumbing; removed UDS cross-session peer transport and routing while retaining in-process agent/teammate messaging; and removed the absent `/fork` command registration while preserving the in-process inherited-context agent path. Historical workflow task ID/outcome readers and the optional SDK `workflow_name` field remain. The independent `CONTEXT_COLLAPSE` behavior remains.
5. **Preserve data compatibility.** Keep readers for old Tau sessions/settings when needed; do not inspect or modify Claude-owned paths, and do not inspect or modify E2B-owned data or credentials.
6. **Update project docs.** Reconcile README, command docs, `docs/PROJECT_CATEGORIZATION.md`, and this plan with the actual external build and remaining supported features.

## Validation

- Run `npm run build`, `npm run test:auth`, relevant command/feature tests, and `git diff --check`; do not add a CI build step.
- Smoke-test `tau --help`, resume/session flows, local Git, permission prompts, hooks, and in-process agents.
- Verify removed CLI modes/commands are absent and rejected cleanly; verify unrelated provider APIs and retained feature-gated local behaviors still work.
- Search for each removed feature literal and implementation path, then review remaining references individually. A zero-result search is not a substitute for checking dynamic `require()` calls, build shims, or stored-data readers.

## Safety and data boundaries

Use Tau's config root and `TAU_CONFIG_DIR` for any settings validation. Do not read, migrate, or write Claude-owned paths. Do not inspect or delete E2B-owned paths or credentials. Preserve Tau-owned sessions/configuration and all application-level permission/security controls unless a separate explicit decision changes them.
