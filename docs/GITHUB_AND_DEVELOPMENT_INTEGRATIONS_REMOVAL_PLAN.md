# GitHub and Development Integrations Removal

## Goal

Remove Tau-owned GitHub/Slack workflow integrations while preserving local Git functionality, provider APIs, SDK contracts, session data, and unrelated services.

## Removed

- `/github`, `/github-run`, `/review`, `/commit-push-pr`, and the internal PR autofix command.
- `/install-github-app` and `/install-slack-app`, their setup flows, generated GitHub workflow templates, workflow-selection UI, installation tips, and Tau config counters.
- `--from-pr` session selection and the GitHub pull-request status footer, including its setting, polling hook, and badge.
- GitHub PR-specific status rendering and session-link creation from shell activity, pull-request webhooks/tools, PR worktree fetching, and the unused GitHub auth-status utility.
- PR-specific attribution generation, the `gh` runtime requirement, and user-facing workflow documentation.

`/commit` and shared Git commit safety remain. Existing Tau session/config data is not migrated or rewritten; historical PR metadata remains readable where required for compatibility.

## Preserved

- Local Git commands, status/diff/branch/worktree behavior, file-change tracking, and commit safety.
- Provider integrations, including GitHub Copilot authentication, API routing, and usage reporting.
- Team-memory sync and its GitHub-remote eligibility checks.
- GitHub/Copilot instruction-file compatibility, web-fetch domain policy, secret scanning, and repository detection.
- SDK/ACP/MCP interfaces, terminal compatibility, and repository-hosted CI/workflows.

## Implementation notes

The former command registry entries and their implementation directories are removed. The install counters and PR-footer setting are no longer read or written; no migration deletes old keys from user configuration. PR-linked session metadata stays intact to avoid altering existing Tau-owned sessions.

## Validation

Build the local application, run relevant command/registry tests and `npm run test:auth`, and run `git diff --check`. Review remaining GitHub references individually: provider/API, compatibility, team-memory, stored-session, and repository-CI references are intentional unless a separate decision removes them.

## Data and safety boundaries

Do not read, migrate, or write Claude-owned configuration paths; use Tau's config root and `TAU_CONFIG_DIR`. Do not inspect or delete E2B-owned paths or credentials. Do not remove application-level permission checks or Git safety protocols as part of integration cleanup.
