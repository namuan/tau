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

## Phase 2: WhatsApp

**Likely scope:** `src/services/whatsapp`, `src/commands/whatsapp`, WhatsApp UI/registration/configuration, related tests/docs, and `@whiskeysockets/baileys`.

**Check before deleting:** Separate this integration from generic messaging tools, MCP integrations, and ordinary WebSocket use. Remove only its dependency edges and settings.

**Verify:** Build; run WhatsApp-specific tests if present; confirm the dependency is absent from `package.json` and lockfile and no WhatsApp command or startup registration remains.

## Phase 3: Browser and computer use

**Likely scope:** `src/services/browser`, browser and computer-use tools, `src/utils/computerUse`, browser/Chrome setup and commands, related components/tests, and optional computer-use packages such as `@computer-use/nut-js`.

**Check before deleting:** Browser automation, Chrome-specific integration, and desktop computer use may have separate registries and permissions. Trace each from tool registration and remove all three only if all are out of scope. Preserve generic web search/fetch unless separately unwanted.

**Verify:** Build; run affected browser/computer tests during removal; confirm no browser/computer tools or onboarding remain and generic web search/fetch still works.

## Phase 4: Remote control

**Likely scope:** The remote-control bridge (`src/bridge`), its bridge/remote commands, remote session UI and transport, and tests/docs specific to controlling a local Tau session remotely.

**Check before deleting:** Distinguish remote control from generic provider API traffic, session resume, remote model/provider APIs, and `src/services/remoteManagedSettings`. Do not remove those just because their names contain “remote”; follow their imports and intended behavior first.

**Verify:** Build; test normal local CLI startup, prompt handling, and session resume; confirm bridge commands and startup no longer open or configure remote-control transports.

## Phase 5: IDE and ACP bridges

**Likely scope:** `src/acp`, the `tau acp` entrypoint and package dependency, IDE-specific commands/detection, and IDE/client protocol bridge code not already removed with remote control.

**Check before deleting:** `src/bridge` is primarily remote control, not a generic IDE bridge. IDE integrations may also be implemented as MCP servers or editor-detection helpers; remove only IDE-specific registrations and retain generic MCP support for now.

**Verify:** Build; test standard terminal startup and CLI invocation; ensure no ACP or IDE-only command/protocol dependency remains.

## Phase 6: LSP

**Likely scope:** `src/services/lsp`, LSP settings and UI, language-server startup/cleanup, LSP-only tests, and direct language-server runtime dependencies such as `bash-language-server`, `pyright`, `yaml-language-server`, and language-server protocol packages where not used elsewhere.

**Check before deleting:** Keep syntax highlighting, tree-sitter parsing, shell security parsing, and file search if they are used independently of LSP. Search each dependency's imports before removing it.

**Verify:** Build; test file read/edit/search and shell permission behavior without LSP; confirm Tau does not spawn language-server processes and LSP packages are pruned from the dependency tree.

## Phase 7: Plugins and marketplaces

**Likely scope:** `src/plugins`, plugin services and utilities, plugin commands/UI, bundled plugins, marketplace/install/update logic, related schemas/tests/docs, and plugin-only dependencies.

**Check before deleting:** Skills, MCP configuration, and ordinary project-local hooks may exist independently of the plugin marketplace. Decide whether user-authored skills/hooks remain supported; do not remove them merely because plugin code can also provide them. This phase precedes MCP removal so plugin-specific behavior is isolated first.

**Verify:** Build; test retained project-local skills/hooks if applicable; confirm plugin commands, marketplace downloads, plugin startup scans, and plugin-specific dependencies are gone.

## Phase 8: MCP

**Likely scope:** `src/services/mcp`, MCP tools/commands/components, MCP server startup and registries, MCP config and persistence, MCP-specific migrations/tests/docs, and `@modelcontextprotocol/sdk` plus other dependencies used only by MCP.

**Check before deleting:** MCP may underpin plugin-provided tools, IDE integrations, external resources, and optional browser/computer integrations. Phases 3, 5, and 7 should already have removed those consumers. Check remaining MCP imports across `src` before removing the shared layer; preserve generic local tools and their command execution.

**Verify:** Build; test the retained core agent tools and provider flow; confirm startup makes no MCP discovery/connection attempts and no MCP-only command, server config, package, or UI remains.

## Completion criteria

- `npm ci` and `npm run build` succeed from a clean checkout.
- Each retained feature has a focused smoke test or documented manual check.
- Removed packages no longer appear in `package.json` or the lockfile unless another feature requires them.
- No dead feature registrations, settings, migration paths, documentation, or platform assets remain.
- The final bundle and clean-install footprint are measured against the recorded baseline.
