# Tau Project Categorization

Updated after the local-only, macOS-only, sandbox/remote-session, SSH-session, safetest, and GitHub/Slack integration cleanup. This is a map of what remains in the tracked project, not a deletion plan. Categories distinguish the agent-loop core from optional product surface and internal/enterprise machinery so future cleanup can be scoped without removing shared safeguards or data behavior by accident.

## Product in one sentence

Tau is a local terminal coding agent with a guarded tool loop, a provider/model abstraction, configurable skills and hooks, persistent sessions, and a broad set of integrations and optional workflows.

## Retained capability map

| Area | Main code | Role | Current disposition |
|---|---|---|---|
| CLI startup and REPL | `src/entrypoints/cli.tsx`, `src/main.tsx`, `src/screens/REPL.tsx`, `src/cli/` | macOS platform check, argument parsing, startup, interactive and print modes, structured input/output, shutdown | Core; preserve |
| Agent loop and shared runtime | `src/query.ts`, `src/QueryEngine.ts`, `src/Task.ts`, `src/Tool.ts`, `src/lanes/shared/`, `src/services/tools/` | Prompt construction, model calls, tool dispatch, turn control, cancellation, compaction, retries, error handling | Core; preserve |
| Permissions and command safety | `src/utils/permissions/`, `src/tools/BashTool/`, `src/utils/bash/`, `native/shell-parser/` | Permission prompts and rules, dangerous-command checks, command parsing, filesystem checks, hooks and policy enforcement | Security boundary; preserve and test carefully |
| Providers and model catalog | `src/lanes/`, `src/services/api/`, `src/utils/model/`, `src/utils/oauthApi.ts` | 28 documented native provider adapters, model catalogs, auth, streaming, tool-schema adaptation, pricing and fallback behavior | Core value, but a major scope/maintenance decision; review providers individually |
| Built-in tools | `src/tools/`, `src/tools.ts` | Bash, file operations, search, web, browser, Python kernel, planning, snapshots, tasks, package manager, Git/repo context, workflow and user-question tools | Core plus optional tools; classify by actual use and feature gate |
| Agents and task orchestration | `src/tools/AgentTool/`, `src/tasks/`, `src/utils/swarm/`, `src/coordinator/` | In-process subagents, local shell/background tasks, teammates, task lifecycle, worktrees and coordination | Preserve in-process agent loop; review advanced orchestration separately |
| Sessions and local state | `src/utils/sessionStorage.ts`, `src/utils/sessionRestore.ts`, `src/utils/sessionState.ts`, `src/state/`, `src/utils/config.ts` | Transcript persistence, resume, session names, trust, settings, snapshots and project state | Core; preserve Tau-owned data and compatibility |
| Memory and context | `src/memdir/`, `src/services/SessionMemory/`, `src/services/extractMemories/`, `src/services/autoDream/`, `src/services/compact/`, `src/utils/context*.ts` | Persistent memory, extraction/consolidation, context budgeting, compaction and summaries | Useful core-adjacent capability; review opt-in/default behavior |
| User customization | `src/skills/`, `src/plugins/`, `src/utils/hooks/`, `src/outputStyles/`, `src/commands/init.ts` | Skills, plugins, lifecycle hooks, output styles, project onboarding and compatible instruction/rule formats | Preserve unless narrowing the extensibility model |
| Protocols and external tools | `src/services/mcp/`, `src/entrypoints/sdk/`, `src/acp/`, `src/bridge/`, `src/cli/structuredIO.ts` | MCP, SDK/API, ACP, bridge clients and structured streams | Keep only the protocols Tau intends to support; trace shared consumers before pruning |
| GitHub and development integrations | Removed command, installer, webhook, PR-status, and auth-status paths | Tau-owned GitHub/Slack workflows, app setup, PR review/status/resume, PR worktree fetching, and webhook tools are removed. IDE integration and LSP paths were not present in the source tree. | Removed; preserve local Git, provider APIs, team-memory sync, SDK contracts, historical session metadata, and terminal compatibility. See `docs/GITHUB_AND_DEVELOPMENT_INTEGRATIONS_REMOVAL_PLAN.md` |
| Terminal UI and interaction | `src/components/`, `src/ink/`, `src/hooks/`, `src/keybindings/`, `src/vim/` | Prompts, permissions UI, settings, status, terminal rendering, keybindings, browser/image display | Core user experience; individual panels/features can be reviewed |
| Sessions, reporting and user commands | `src/commands/`, `src/commands.ts`, `COMMANDS.md` | Built-in slash commands for login, models, plan, memory, tasks, Git, settings, diagnostics, usage, reports, plugins, workflows and more | Broad user-facing surface; likely highest-yield product-scope review |
| Auth, billing and managed policy | `src/services/oauth/`, `src/services/claudeAiLimits.ts`, `src/services/policyLimits/`, `src/services/remoteManagedSettings/`, `src/services/teamMemorySync/` | Provider credentials plus Anthropic account limits, managed settings, policy and team-memory services | Separate local provider auth from account/enterprise services; review for personal-use scope |
| Analytics and telemetry cleanup | `src/main.tsx`, `src/query.ts`, `src/services/`, `src/utils/` | The first-party analytics, GrowthBook, OpenTelemetry, Perfetto, Datadog, and unary-event implementations and dependencies have been removed, along with many event callsites and surveys. Remaining analytics/GrowthBook/Statsig references include stale comments, some feature-gate defaults, and adjacent provider/API semantics that still need review. | Continue auditing remaining callsites and feature-gate substitutions; preserve local behavior and unrelated provider APIs |
| Feature-gated/internal workflows | Feature gates in `src/commands.ts`, `src/tools.ts`, `src/entrypoints/cli.tsx`; `src/buddy/`, `src/coordinator/`, internal command/tool paths | Kairos/proactive, buddy/coordinator, cron triggers, background/daemon/runner modes, and internal tools. The external build defines all `bun:bundle` features as false and `USER_TYPE` as `external`, so several candidates are source-only there. | Removal underway; unavailable daemon/background/template/runner CLI dispatches, Ant-only internal command registrations, absent test/context-inspection/terminal-capture tools, `WORKFLOW_SCRIPTS` registrations/transcript-grouping plumbing, and UDS cross-session peer transport/routing are removed, while `/commit` and in-process agent/teammate messaging remain. Historical workflow task ID/outcome readers and the optional SDK `workflow_name` field remain for compatibility. Preserve useful local feature-gated behavior, safeguards, providers, and Tau-owned data. See `docs/FEATURE_GATED_INTERNAL_WORKFLOWS_REMOVAL_PLAN.md` |
| Native helpers and build | `build.mjs`, `build.ts`, `native/`, `src/native-ts/`, `scripts/`, `packages/` | CLI bundle, native shell parser/tools, installer and local linking/build workflow | Keep required local build path; review optional native helpers and installer separately |
| Compatibility and migrations | `src/migrations/`, `src/utils/foreignRuleFormats.ts`, `src/utils/settings/legacySettings.ts` | Upgrade settings/models, accept compatible instruction/rule formats, strip legacy Tau sandbox settings | Preserve user-data safety; remove only with migration evidence |

## Recently removed; do not treat as retained capabilities

The cleanup removed local OS-level Bash sandbox execution, the hosted CCR remote-agent/session transport and viewer, teleport/resume transport APIs, session-ingress persistence/auth, remote user-settings sync, Tau-managed SSH sessions, E2B-backed `/safetest`, the PowerShell tool, and Tau-owned GitHub/Slack workflow integrations. The GitHub cleanup removed GitHub CLI workflow commands, app installers, PR review/status/resume and worktree-fetch paths, webhook tools, and PR-specific attribution/activity UI. In-process agents, local Git operations, historical PR session metadata, and unrelated provider APIs remain. Tau's ordinary permission prompts, rules, dangerous-command checks, hooks and file protections remain, but they are application-level controls rather than an OS sandbox.

## Potential next cleanup areas

These are candidates for a product decision and dependency tracing, not findings that the code is dead:

1. **Narrow the provider promise.** The 28-provider matrix spans native APIs, OpenAI-compatible adapters, local servers, subscription providers and hidden compatibility routes. Decide which providers are essential before removing any adapter; then measure code, tests and auth/config surfaces per provider.
2. **Separate personal CLI from enterprise/account features.** Review remote managed settings, policy limits, team memory sync, and Claude-account-specific usage/pass/overage features. Keep direct provider login and local settings unless specifically scoped out.
3. **Reduce command count.** Classify slash commands into daily workflow, provider/account-specific, integrations, diagnostics/internal, and experimental. `src/commands.ts` is the authoritative registry; directory presence alone does not mean a command is enabled or shipped.
4. **Audit feature-gated execution modes.** Follow `docs/FEATURE_GATED_INTERNAL_WORKFLOWS_REMOVAL_PLAN.md` to inventory daemon/background sessions, runners, proactive/Kairos, workflows, peers, buddy/coordinator and internal tools. Confirm build reachability and preserve useful local behavior before removing implementation.
5. **Review remaining secondary integrations.** Desktop/mobile bridges, ACP, SDK, MCP, browser automation and team workflows increase surface area. GitHub/Slack workflow removal is complete; preserve supported client protocols and provider APIs.
6. **Review analytics and experiments.** Trace GrowthBook/feature gates and telemetry destinations; remove only after identifying behavior gates and user-visible consequences.
7. **Reconcile documentation with code.** README currently mentions PowerShell tools even though the PowerShell tool was removed. Check provider counts, feature claims and old command examples during the next docs pass.
8. **Review compatibility weight.** Model migrations, foreign rule formats, SDK wire types and stored transcript readers may protect existing user data. Treat these as compatibility contracts, not dead code, until fixtures and data policy are reviewed.

## Explicit boundaries for future cleanup

- Preserve the core loop: provider request → guarded tool call → result → next model turn.
- Keep permission/security checks independent of optional tools and provider adapters.
- Do not read, migrate or write Claude-owned configuration paths; use Tau's config root and `TAU_CONFIG_DIR`.
- Do not inspect or delete E2B-owned paths or credentials.
- Preserve existing Tau sessions and configuration unless a migration is explicitly requested.
- Trace all consumers before removing shared APIs, SDK/ACP/MCP contracts or in-process agent infrastructure.
- The supported source workflow remains `npm ci`, `npm run build`, `npm link`, and the `tau` executable; no CI build is part of this categorization.
