# Optional feature removal plan

Remove one feature per change, in the order below. Each phase should be reviewed, built, and committed before starting the next. This keeps regressions attributable and makes it easy to revert one removal without restoring unrelated code.

## Before each phase

1. Record baseline: `npm run build`, current `dist/tau.mjs` size, and relevant tests.
2. Trace imports from the CLI entrypoint and command/tool registries. Search for feature names, config keys, settings fields, environment variables, tests, docs, and package references.
3. Remove the feature end-to-end: registration and entrypoints, UI, commands/tools, services, settings/migrations, dependencies, native/package assets, tests, and documentation.
4. Regenerate the lockfile after changing `package.json`; do not hand-edit lockfile package trees.
5. Run the build and focused tests; check for stale imports and user-facing references. Compare the output bundle and install footprint with baseline.
6. Commit the phase independently. The current GitHub Actions workflow checks the build only, so run the focused tests locally or add only the minimal test needed for the phase.

## Phase 1: Voice — completed

The live voice conversation feature and its native/platform packaging were removed. Provider authentication and other generic audio/file handling remain intact. The phase build, lifecycle/shrinkwrap checks, and focused OpenAI authentication/routing tests pass.

**Likely scope:** `src/voice`, voice commands and UI, voice services and settings, `native/tau-voice`, `platform-packages/tau-voice-*`, voice build/release scripts, voice tests, and the optional `@abdoknbgit/tau-voice-*` dependencies.

**Check before deleting:** Search for voice hooks and settings referenced from shared prompt/input components. Remove only voice-specific configuration; preserve general audio/file handling used elsewhere.

**Verify:** Build; run voice-related tests only while removing the feature; confirm no voice command, UI control, package, postinstall path, or platform binary reference remains.

## Phase 2: WhatsApp — completed

The WhatsApp command, messaging client, mirroring, permission relays, special turn state, Baileys dependency, and associated script permissions were removed. Removing the turn-state shortcut also restores normal sandbox and tool-permission prompts for all remaining input paths. `npm ci`, the build, production shrinkwrap check, and 51 lifecycle/installer tests pass.

**Likely scope:** `src/services/whatsapp`, `src/commands/whatsapp`, WhatsApp UI/registration/configuration, related tests/docs, and `@whiskeysockets/baileys`.

**Check before deleting:** Separate this integration from generic messaging tools, MCP integrations, and ordinary WebSocket use. Remove only its dependency edges and settings.

**Verify:** Build; run WhatsApp-specific tests if present; confirm the dependency is absent from `package.json` and lockfile and no WhatsApp command or startup registration remains.

## Phase 3: Browser and computer use — completed

Removed Claude in Chrome integration, its native host/onboarding/settings/commands and browser-specific prompts/rendering, plus the Computer Use server, approvals, session state, cleanup paths, and optional desktop-control dependency. Generic web search/fetch remain.

**Verification:** Build passes; focused tests and source/dependency audits were completed during Phase 8.

## Phase 4: Remote control — completed

Removed the `src/bridge` control plane, LAN pairing service, bridge and remote-control commands, local direct-connect server/client, bridge-driven UI and state, remote-control-only notification settings, and obsolete assistant-session history viewer. Generic Tau Web session APIs, session resume, remote model/provider traffic, SSH sessions, and `src/services/remoteManagedSettings` remain.

**Verification:** `npm run build` succeeds at about 17.4 MB; `node dist/cli.mjs --help` and `--version` start normally and expose no remote-control/server commands; the prompt/session persistence test suite and lifecycle/auth tests pass. The CLI's local `--print` prompt flow could not be exercised end-to-end without usable provider credentials. Startup no longer configures a bridge transport, and the retained `RemoteIO` path is limited to generic session-ingress APIs.

## Phase 5: IDE and ACP bridges — completed

Removed the ACP server and command, VS Code ACP client and companion extension, IDE-specific commands and UI, editor-selection/open-file plumbing, IDE diff integration, VS Code SDK MCP notifications, and the `sse-ide`/`ws-ide` MCP transports and filters. Removed the ACP SDK dependency. Generic MCP transports and commands remain available, along with editor-independent external editor support and generic provider/API traffic; LSP diagnostics were subsequently removed in Phase 6.

**Verification:** Build succeeds at 17.2 MB; production shrinkwrap and `git diff --check` pass. CLI help/version start normally and the `acp` command is absent. Focused MCP and LSP suites pass (77 passed, 1 platform-specific skip).

## Phase 6: LSP — completed

Removed `src/services/lsp`, LSP settings and UI, language-server startup/cleanup, diagnostic attachments and rendering, plugin LSP integration, LSP-only tests and fixture, and direct language-server runtime dependencies. Preserved tree-sitter parsing, syntax highlighting, shell security parsing, and file search. `vscode-languageserver-types` remains only as a transitive dependency of `dockerfile-ast` via `e2b`.

**Verification:** Build succeeds at 17.1 MB; production shrinkwrap and `git diff --check` pass. Focused file-read, file-edit, shell, and grep-ignore tests pass. The larger real-ripgrep `GrepTool.test.ts` suite fails in Bun with an unnamed `AssertionError` before reporting any assertions. The language-server process check found no server processes, and `npm ls --depth=0` confirms direct language-server packages are absent.

## Phase 7: Plugins and marketplaces — completed

Removed plugin commands and UI, loading and startup checks, marketplace/install/update logic, bundled plugin contributions, plugin state and telemetry, channel notifications/permissions, and plugin-specific keybindings and guidance. User/project skills, ordinary hooks, and legacy managed customization policy remain supported. Legacy managed plugin-only customization policy remains fail-closed for backward-compatible security behavior.

**Verification:** Production build, shrinkwrap check, and `git diff --check` pass. Real-ripgrep GrepTool tests pass (45); focused agent tests pass (31), skill tests pass (4), and focused MCP suites pass (43, 1 skipped).

## Phase 8: MCP — completed

Removed MCP clients/servers, connection startup, tools/resources, settings and persistence, commands and UI, hooks and elicitation, tool-search integration, protocol SDK dependency, and MCP-only docs/tests. Preserved generic provider tool compatibility, external editor support, user/project skills, ordinary hooks, core tools, permissions, and Tau session APIs.

**Verification:** Production build, production shrinkwrap check, and `git diff --check` pass. Focused core, session, provider, Cursor, Gemini schema, and placeholder-argument suites pass. One combined test run hit a temporary-directory cleanup collision; the affected suite passed when rerun alone. The standalone ToolSearch Bun test remains blocked by the missing `src/entrypoints/sdk/runtimeTypes.js` module. Source, manifest, and lockfile audits show no MCP client/server implementation or SDK dependency.

## Phase 9: Claude inference — in progress

Remove first-party Anthropic inference and Claude-specific Bedrock, Vertex AI, and Foundry routes. Preserve the Anthropic SDK only where it remains a shared message/error contract for other providers, and preserve unrelated Tau Web/session APIs and provider adapters.

The provider picker no longer offers these backends, legacy selections and provider aliases are rejected, first-run setup no longer treats Anthropic credentials as a configured inference provider, and the shared client rejects removed native-provider selections before making a request. The Anthropic model catalog, Bedrock token-count/profile discovery, and Bedrock region aliasing are removed, along with Bedrock/AWS proxy and GCP auth dependencies. AWS credential-export/auth-refresh and GCP auth-refresh settings and execution paths are removed. Cloud setup choices in the OAuth flow, cloud-specific status displays, AWS/Vertex region resolvers, and Bedrock-specific beta/header/body shaping are removed. Legacy Bedrock/Vertex environment flags no longer trigger startup credential prefetches or cloud-specific auth retries. SDK-compatible AgentRouter routing and shared Anthropic message types remain. OAuth-backed Tau product/session APIs are intentionally retained; remote-managed-settings eligibility no longer depends on the removed inference provider selection.

**Remaining scope:** Remove unreachable first-party-only model capability/default branches and stale cloud setup UI/request shaping. Preserve canonical Claude IDs used by third-party providers, Tau product/session auth, remote-managed settings, and provider compatibility contracts.

**Verification so far:** Clean `npm ci`, production build and shrinkwrap checks pass. Focused provider routing, OpenRouter execution, agent-model, and context-window tests pass. The standalone provider-name test remains blocked under Bun by the missing `src/entrypoints/sdk/runtimeTypes.js` module. Node regression tests cover provider-picker exclusion, client rejection, and remote-settings eligibility independence.

## Clean-checkout verification and footprint

Measured on clean worktrees using `npm ci`, `npm run build`, `du -sk node_modules`, and exact byte counts for `dist/tau.mjs`. Baseline is pre-removal commit `98c0255`; final is `50f48f9`.

| Metric | Baseline (`98c0255`) | Final (`490e9b4`) | Change |
|---|---:|---:|---:|
| `dist/tau.mjs` | 18,807,779 bytes (17.9 MiB) | 15,224,841 bytes (14.5 MiB) | −3,582,938 bytes (19.1%) |
| Clean `node_modules` allocation | 541,592 KiB | 298,728 KiB | −242,864 KiB (44.8%) |
| `package-lock.json` | 351,861 bytes | 191,871 bytes | −159,990 bytes (45.5%) |
| Direct production dependencies | 80 | 73 | −7 |
| Packages installed by `npm ci` | 682 | 348 | −334 |

Both clean checkouts passed `npm ci` and `npm run build`. Focused provider, session, core-tool, Cursor, Gemini schema, placeholder-argument, and Node YAML runtime tests passed. The TTY smoke check reached the interactive Bash setup dialog; CLI `--help` and `--version` exit normally. MCP service/command/component paths and the MCP SDK are absent from the source tree, manifest, and lockfiles. Historical transcript compatibility code remains for old saved sessions. The `yaml` runtime dependency is explicitly declared so installed Node builds can load user/project skill frontmatter.

## Completion criteria

- `npm ci` and `npm run build` succeed from a clean checkout.
- Each retained feature has a focused smoke test or documented manual check.
- Removed packages no longer appear in `package.json` or the lockfile unless another feature requires them.
- No dead feature registrations, settings, migration paths, documentation, or platform assets remain.
- The final bundle and clean-install footprint are measured against the recorded baseline.
