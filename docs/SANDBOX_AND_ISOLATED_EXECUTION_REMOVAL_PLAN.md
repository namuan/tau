# Sandbox and Isolated Execution Removal Plan

## Goal

Remove Tau's local OS-level sandboxing for Bash commands, hosted remote-agent execution and its session infrastructure, SSH sessions, and E2B-backed safetest execution. Preserve Tau's separate permission and security controls.

## Scope Boundary

This cleanup includes four distinct feature groups:

- Local Bash isolation backed by `@anthropic-ai/sandbox-runtime`.
- Agent subagents launched in hosted CCR environments through the remote isolation mode, including their remote-session transport, viewer/companion entry points, and hosted-agent-specific APIs, auth, state, and UI.
- SSH sessions and the SSH-specific session manager, connection setup, permission bridge, and UI.
- The E2B-backed `safetest` utility that uploads and runs or analyzes files in temporary cloud environments.

Trace shared code before removal. Remove remote APIs, settings, or transport code when it exists only to support these features; retain unrelated provider infrastructure and user configuration.

## Phase 1 Inventory Findings

### Local Bash sandbox

- `src/utils/Shell.ts` applies the sandbox wrapper and cleanup around local command execution. Bash schemas, `shouldUseSandbox`, planner/API plumbing, `TaskOutputTool`, and the interactive `!` command carry the `dangerouslyDisableSandbox` override.
- Startup, print mode, `SandboxManager` initialization, settings refresh, sandbox network callbacks, status/diagnostics, sandbox UI, and `/sandbox` all depend on the adapter.
- Permission code also queries sandbox-only state for sandbox auto-allow and sandbox filesystem restrictions. Remove those branches without removing ordinary ask/allow/deny behavior or generic file-tool permission checks.
- `src/utils/hooks/execHttpHook.ts` uses the sandbox network proxy. It must be traced and simplified when that proxy is removed.
- `src/lanes/shared/sandbox.ts` has no direct source imports in the current search. Treat it as apparently unreferenced; verify generated/build references before deleting it.
- Before Phase 3, the adapter statically imported `@anthropic-ai/sandbox-runtime`, which was not declared in `package.json` or the lockfiles. The adapter has since been deleted.

### Hosted agents and CCR remote sessions

- The Agent tool exposes `isolation: "remote"`; `RemoteAgentTask` manages remote execution, polling, resume, status, and task output.
- Hosted tasks are connected to task unions/UI, background task controls, `/ultraplan`, remote review flows, and remote-agent metadata in `src/utils/sessionStorage.ts`.
- `RemoteSessionManager`, its WebSocket transport, `useRemoteSession`, and related dialogs handle CCR session connection and permission/message forwarding. Remove these session workflows as requested.
- `src/utils/teleport.tsx`, `src/utils/teleport/*`, CCR API/auth/session code, and some session-storage logic have multiple consumers. Trace each consumer before deletion; do not remove shared session persistence or unrelated provider features by matching “CCR” alone.

### SSH sessions

- SSH has a `SSH_REMOTE`-gated CLI parser/entry path in `src/main.tsx`, a REPL integration in `src/hooks/useSSHSession.ts`, and session types imported by the REPL.
- The referenced `src/ssh/*` implementation files are absent from the current worktree. Check feature defines and build behavior before deciding which remaining SSH references are live versus stale.

### E2B safetest

- `/safetest` is registered in `src/commands.ts` and implemented by `src/commands/safetest`, `src/utils/safetest/safetest.ts`, and `e2bSecurity.ts`.
- E2B login/provider UI is integrated into the shared login and provider commands. The `e2b` package is declared in `package.json` and both lockfiles, so remove that wiring and regenerate locks when the feature is deleted.
- E2B helpers can read `~/.e2b/config.json` and `.safeclaudecode/safetest.config.json`. Do not inspect, migrate, or delete either path during cleanup. E2B credentials also have Tau-owned secure-storage entries; do not delete stored secrets automatically without a separate decision.

### Existing Tau data

- Stop restoring hosted remote-agent tasks, but leave existing remote-agent metadata and conversation history untouched.
- Retain the documented compatibility decision for legacy Tau `sandbox.*` settings.

## Security Impact

Without OS-level sandboxing, an approved Bash command runs with the macOS user's ordinary filesystem and network access. Tau's interactive permission prompts, command allow/deny rules, dangerous-command checks, and file-tool path validation can remain, but they are not equivalent to OS-enforced restrictions on arbitrary shell processes.

In particular, local sandbox settings such as filesystem read/write restrictions, network host restrictions, socket restrictions, and managed-only sandbox policies will no longer constrain Bash subprocesses. Documentation and prompts must not imply otherwise.

## Compatibility Decision

Recommended behavior for existing Tau config:

- Accept legacy `sandbox.*` configuration without applying it.
- Emit a clear warning that local Bash sandboxing has been removed and these settings are ignored.
- Do not read, migrate, or write Claude-owned configuration paths.

This avoids making existing Tau config prevent startup while avoiding a silent impression that the old restrictions are still enforced. Remove sandbox fields from new settings and SDK schemas after the compatibility behavior is defined.

## Implementation Stages

### 1. Inventory execution and permission boundaries

Trace all local `SandboxManager`, hosted-agent, CCR remote-session, and SSH references. Classify shared code by its consumers before removal. Identify which local permission checks remain valid without the sandbox adapter. Do not remove file-tool or Bash permission checks merely because they share adapter imports.

### 2. Remove local Bash wrapping and override paths

Remove calls that wrap Bash commands with the local sandbox runtime, including initialization and command cleanup. Remove `dangerouslyDisableSandbox` from Bash schemas, prompt text, execution/planner/API plumbing, and internal callers. Remove retry paths that rerun a command outside the sandbox. Preserve ordinary command approval and background-task behavior.

### 3. Remove local sandbox settings and user-facing features

Remove local sandbox settings and their SDK/settings schema, `/sandbox` command, sandbox settings panels, status hints, violation UI, and sandbox-only startup/doctor checks. Leave hosted remote-agent and E2B/safetest features for their dedicated removal stages; preserve unrelated remote features. Apply the chosen compatibility behavior for legacy `sandbox.*` settings.

### 4. Remove hosted remote-agent execution

Remove the Agent tool's hosted CCR execution mode and its user-facing `isolation: "remote"` option, plus all hosted-agent-specific routing, status, result-handling, authentication, API, and session-management code. Remove CCR remote-session connection, viewing, and control features, including `RemoteSessionManager` and associated viewer/companion paths. Preserve ordinary in-process subagents and unrelated provider APIs.

### 5. Remove SSH sessions

Remove SSH session startup, session management, permission forwarding, reconnect/status UI, commands, configuration, dependencies, tests, and documentation. Remove shared SSH code only after confirming it is not used by unrelated shell or network functionality.

### 6. Remove E2B-backed safetest

Remove the safetest command and its E2B client, upload/run workflow, template selection, configuration, dependency references, tests, and documentation. Check that no other feature uses those E2B-specific modules before deleting shared code.

### 7. Audit local sandbox adapter and dependency references

The adapter and its imports were removed in Phase 3. Verify no local Bash execution path imports or invokes `sandbox-adapter` or `@anthropic-ai/sandbox-runtime`, and remove any remaining dependency or documentation references.

### 8. Update product guidance

Update Bash system prompts, settings help, command help, README/docs, and diagnostics to describe the remaining permission model accurately. Explicitly distinguish Tau's application-level permission checks from OS-level isolation.

### 9. Validate

- Build Tau and smoke-test CLI startup and `--version`.
- Run focused tests for Bash permission prompts, allow/deny rules, command execution, background tasks, settings compatibility, and SDK/API schemas.
- Verify no local Bash execution path imports or invokes `sandbox-adapter` or `@anthropic-ai/sandbox-runtime`.
- Verify hosted remote-agent execution, CCR remote sessions, SSH sessions, and E2B-backed safetest are absent, while in-process agents and unrelated provider APIs still work.
- Run `git diff --check` and inspect the final file/reference inventory.

## Phase Progress

- [x] Phase 1 — Inventory completed and recorded above.
- [x] Phase 2 — Removed local sandbox wrapping from the shell execution path, removed `dangerouslyDisableSandbox` from Bash schemas/plumbing/internal callers, removed sandbox-specific auto-allow behavior, and removed sandbox instructions from the Bash prompt.
- [x] Phase 3 — Removed local sandbox settings/schema/UI/startup/doctor paths, sandbox-only telemetry and network callbacks, the local adapter, and legacy sandbox settings are now warned about and stripped. Ordinary Tau permission and file protections remain.
- [ ] Phase 4 — Remove hosted remote-agent execution and CCR remote-session infrastructure.

Phase 2 validation: `npm run build`, CLI `--version`, Bash prompt/planner/preflight/workdir/background tests passed. `npx tsc --noEmit` still reports existing project-wide missing-module/compiler-type issues and the known Bash workdir type errors.

Phase 3 validation: `npm run build`, CLI `--version`, legacy settings compatibility test, Eval tool tests, and focused Bash prompt/planner/preflight tests passed. `src/utils/toolSearchSafety.test.ts` still cannot run under Bun because `src/ink/components/Box.tsx` imports missing `src/global.d.ts`.

## Acceptance Criteria

- Local Bash commands no longer invoke the OS sandbox runtime or expose sandbox override controls.
- Existing Tau permission prompts, command rules, and file-tool protections continue to work.
- Sandbox-specific filesystem/network restrictions are clearly documented as no longer enforced for Bash.
- Legacy Tau sandbox settings follow the documented compatibility behavior.
- Neither `@anthropic-ai/sandbox-runtime` nor E2B dependencies are required to build or run the retained local CLI features.
- Hosted remote-agent execution and its session infrastructure, SSH sessions, and E2B-backed safetest are removed.
- In-process agents and unrelated provider APIs remain intact.

## Compatibility Policy

Legacy Tau `sandbox.*` settings are warned about and stripped during settings loading and validation. They are not migrated or enforced.
