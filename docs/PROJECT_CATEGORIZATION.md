# Project functionality map

This document groups Tau's source tree by purpose to support a gradual move toward a smaller core. It is an inventory and planning aid, not a decision to remove every optional feature.

## Runtime foundations

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `src/main.tsx`, `src/entrypoints`, `src/cli`, `src/bootstrap`, `src/state`, `src/context` | CLI startup, command dispatch, process state, and shared runtime context | Keep; this is the application skeleton. |
| `src/query`, `src/assistant`, `src/screens`, `src/components`, `src/hooks`, `src/ink` | Agent conversation loop and terminal interface | Keep the basic loop and UI; audit feature-specific screens and components. |
| `src/utils`, `src/constants`, `src/types`, `src/schemas` | Shared helpers, configuration, types, and validation | Keep required helpers; this is broad and should be trimmed only through import tracing. |

## Model and provider connectivity

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `src/lanes` | Provider adapters, request/response translation, and provider dispatch | Keep at least one provider; remove unused adapters if a single-provider product is intended. |
| `src/services/api`, `src/services/oauth`, `src/utils/model` | API transport, authentication, model catalogs, and model metadata | Keep the transport/auth path for supported providers; catalog refreshes and provider-specific logic can be audited separately. |

## Coding-agent capabilities

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `src/tools` | Agent-callable tools, including shell, file, Git, web, planning, task, and integration tools | Keep a small core: shell, file read/write/edit, and basic search. Audit specialized tools individually. |
| `src/services/tools`, `src/services/compact`, `src/services/snapshot`, `src/services/SessionMemory`, `src/memdir` | Tool execution support, context management, snapshots, and persistent memory | Preserve safety and core session behavior; memory/snapshot features are candidates if not wanted. |
| `src/utils/permissions`, permission-related components and hooks | Tool approval, permission rules, and execution safeguards | Keep. Do not remove these as a size optimization without a separate security review. |

## Optional integrations and extensibility

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `src/services/mcp`, MCP tools and commands | Model Context Protocol clients, servers, and configuration | Optional if external MCP integrations are not a product requirement. |
| `src/skills`, plugin services and commands | User/project skills remain supported; plugin loading, marketplaces, and lifecycle management were removed in Phase 7. | Skills are retained independently of the marketplace.
| `src/acp`, IDE-specific commands, UI, MCP transports, and editor bridges | ACP and IDE-specific integrations | Removed in Phase 5; generic MCP, provider APIs, and external editor support remain. |
| `src/upstreamproxy` | Provider proxy modes | Retain with provider/API traffic. |
| `src/remote` | Tau Web session APIs, resume, and remote model/provider traffic | Retain; this is separate from remote control of a local Tau session. |
| `src/bridge`, `src/server` | Remote control of a local Tau session | Removed in Phase 4. |
| `src/services/lsp`, language-server tools and configuration | Background code diagnostics and language-server integration | Removed in Phase 6; tree-sitter parsing, syntax highlighting, shell security parsing, and file search remain. |

## Larger or specialized features

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `src/voice`, `native/tau-voice`, `platform-packages/tau-voice-*` | Live voice conversation and platform-specific native voice addons | Removed in Phase 1; retained generic provider authentication and file/audio handling. |
| Claude in Chrome and Computer Use MCP integration | Browser automation and desktop control | Removed in Phase 3; generic web search/fetch and MCP support remain. |
| `src/services/whatsapp` and WhatsApp commands | WhatsApp connectivity | Removed in Phase 2, including its permission relay and Baileys dependency. |
| `src/services/remote`, remote commands and bridge modules | LAN pairing, remote control, and shared session control | Removed in Phase 4; generic Tau Web session APIs remain. |
| `src/buddy`, `src/vim`, `src/outputStyles`, `src/moreright`, `src/coordinator` | Specialized UI, interaction, or orchestration modes | Audit against intended product experience; likely non-core for a minimal coding CLI. |

## Commands and user-facing features

`src/commands` contains roughly 110 command modules. It includes core commands such as login, model selection, configuration, help, and session resume, alongside specialized commands for integrations, remote features, diagnostics, automation, and other workflows. Keep only commands that correspond to retained capabilities; command registration and imports should be checked before deleting a module.

## Build, packaging, and maintenance

| Paths | Responsibility | Cleanup priority |
|---|---|---|
| `build.mjs`, `build.ts`, `scripts`, `native/shell-parser`, `native/tau-tools` | Bundle generation and optional native helper builds | The current `npm run build` also attempts local native helper builds when Go is available. These are host-local helpers, not a cross-platform package matrix. |
| `packages/tau-installer`, `release`, `platform-packages` | Installer, release automation, and platform-specific voice packages | Keep only if distributing through the current installer/release model; voice platform packages can go with voice. |
| `.github/workflows` | CI automation | Currently reduced to one Node build job; it does not pack or upload platform artifacts. |
| `test`, `*.test.*` | Automated tests | Retain tests for kept functionality and remove/update tests only alongside a feature removal. |
| `docs`, `README.md`, `COMMANDS.md`, `PROVIDERS.md`, `CHANGELOG.md` | User/developer documentation | Update when capabilities are removed so docs match the reduced product. |

## Suggested minimal target

A lightweight terminal coding agent could retain:

- CLI startup and terminal conversation loop
- One or a small selected set of provider adapters
- Login/configuration and session resume
- Shell execution with permission safeguards
- File read, write, edit, and basic file/content search
- Essential Git support and build/test execution

Remaining removal candidates, if out of scope, are MCP and specialized commands/tools.

## Cleanup approach

1. Decide which integrations and providers are product requirements.
2. Trace imports from the CLI entrypoint before deleting modules; large folders contain both core and optional code.
3. Remove a feature as a unit: command registration, tools, services, UI, dependencies, native assets, tests, and docs.
4. Build after each group of removals and run focused tests for retained core behavior.
5. Compare dependency install size and `dist/tau.mjs` size after each step. A source directory's file count alone does not predict bundle or install size.
