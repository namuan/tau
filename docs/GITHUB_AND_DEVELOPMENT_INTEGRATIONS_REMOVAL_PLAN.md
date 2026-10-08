# GitHub and Development Integrations Removal Plan

## Goal

Remove Tau's product-owned GitHub workflow and app-installation integrations, plus any development-integration surface that is actually present and independently removable. Preserve Tau's local Git workflow, provider APIs, SDK contracts, and terminal compatibility.

This is a plan only. It does not remove code or alter user configuration.

## Scope

### Remove

- `/github` and its hidden `/github-run` command, prompt builders, and GitHub CLI workflow guidance.
- `/review`, which currently discovers and reviews GitHub pull requests through `gh`.
- `/commit-push-pr` as a GitHub pull-request workflow. Decide during implementation whether to remove it entirely or split its local branch/commit/push steps into a Git-only command; do not retain its `gh pr` behavior under another name.
- `/install-github-app`, `/install-slack-app`, their lazy command registrations, setup flows, generated workflow templates, and the workflow-selection dialog.
- Related GitHub/Slack installation tips and Tau config counters when no remaining references exist.
- The unused `getGhAuthStatus` utility and its unused import in `src/main.tsx`.
- README and command documentation that advertises the removed workflows, including the `gh` runtime requirement if no other retained feature needs it.

### Preserve

- Local Git functionality: Git status/diff/branch/worktree operations, file-change tracking, commit safety, and `/commit` unless a later product decision removes them.
- Provider integrations, including GitHub Copilot authentication, API routing, and usage reporting. These are provider APIs, not GitHub workflow tooling.
- Team-memory sync and its GitHub-remote eligibility checks; it is tracked separately under account/team-memory services and has independent behavior.
- GitHub/Copilot instruction-file compatibility in `src/utils/claudemd.ts`, web-fetch domain policy, secret scanning, and repository detection used by retained local workflows.
- SDK/ACP/MCP interfaces and VS Code/xterm terminal compatibility. They are not equivalent to an IDE integration feature.
- Repository-hosted `.github` CI/workflow files unless their purpose is specifically the removed user-facing app installer.

## Current dependency findings

- The live command registry in `src/commands.ts` registers `github`, `githubRun`, `installGitHubApp`, `installSlackApp`, `commitPushPr`, and `review`.
- `src/commands/github/` owns the `/github` wizard and `/github-run` prompt command.
- `src/commands/install-github-app/` owns the GitHub App/action setup flow and is the only source importing `WorkflowMultiselectDialog` and `constants/github-app.ts`.
- `src/commands/install-slack-app/` owns Slack app setup.
- `githubActionSetupCount` and `slackAppInstallCount` are referenced by the installation commands and `src/services/tips/tipRegistry.ts`; remove them only after those consumers are removed. No config migration should rewrite existing Tau config.
- `src/commands/review.ts` invokes `gh pr` commands. `src/commands/commit-push-pr.ts` mixes local Git operations with `gh pr` operations and needs an explicit split-or-delete decision.
- `getAttributionTexts()` is also used by `/commit` and the Bash prompt, so preserve `src/utils/attribution.ts` unless its remaining non-PR consumers are independently removed. `getEnhancedPRAttribution()` appears specific to `/commit-push-pr` and can be evaluated separately.
- `getGhAuthStatus` is only imported by `src/main.tsx`; it has no remaining callsite and can be removed with its utility.
- The categorized paths `src/hooks/useIDEIntegration.tsx` and `src/services/lsp/` are not present in the current source tree. Treat those entries as stale documentation, not evidence for deleting broad editor/SDK code. `src/utils/ide.ts` and references to VS Code/xterm are not a dedicated integration surface without further proof.

## Implementation sequence

1. **Confirm the command boundary.** Decide whether `/commit-push-pr` is removed or replaced with a local-only Git command. Keep `/commit` and shared Git safety behavior either way.
2. **Remove user-facing command registrations.** Delete the selected GitHub commands from `src/commands.ts` and remove their command implementations and tests. Check command help, typeahead, merged commands, and slash-command tests for hard-coded names.
3. **Remove app installation flows.** Delete installer commands, workflow selection UI, app/action templates, install counters, and related tips. Remove installer-specific imports and dependencies only after verifying no other consumers.
4. **Remove dead auth-status and PR-only helpers.** Delete the unused GitHub auth status utility; remove PR-only attribution helpers only after confirming the retained commit and Bash consumers still build and behave correctly.
5. **Update docs and categorization.** Remove `/github`, app-installation, PR review, and `gh` requirement claims from `README.md`, `COMMANDS.md`, and `docs/PROJECT_CATEGORIZATION.md`. Document the preserved Git-only and provider APIs clearly.
6. **Validate the boundary.** Run `npm run build`, relevant command/command-registry tests, and `git diff --check`. Search for `/github`, `/github-run`, `/install-github-app`, `/install-slack-app`, installer counters, workflow-template imports, and removed utility names. Review remaining GitHub references individually; do not blanket-delete provider/API, team-memory, compatibility, or CI references.

## Data and safety constraints

- Do not read, migrate, or write Claude-owned configuration paths. Any compatibility check must use Tau's config root and `TAU_CONFIG_DIR`.
- Do not migrate Tau config merely to erase historical installation counters; stop reading/writing the keys and leave existing user data untouched.
- Do not remove application-level permission checks or Git safety protocols as part of deleting the GitHub commands.
- Do not infer dead code from the word `github` alone; several retained providers and shared services legitimately use GitHub APIs.
