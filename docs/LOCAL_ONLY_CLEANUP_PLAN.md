# Local-only Tau cleanup plan

## Goal

Keep Tau as a private, locally built coding CLI. No npm publishing or public installer is required. Preserve the agent loop, supported providers, authentication, core tools, permissions and safeguards, settings, sessions/resume, SSH, and Tau Web/session APIs.

The installed command must remain `tau` and work from any directory through a machine-local npm link.

## Required local workflow

From the repository root:

```sh
npm ci
npm run build
npm link
```

`package.json` must retain:

```json
"bin": {
  "tau": "dist/cli.mjs"
}
```

Validate the link from outside the checkout with `tau --version` and a basic CLI smoke check. `npm link` creates a local global symlink; it does not publish the package. After changing the package's local name, unlink it using that package name, for example `npm unlink -g tau-local`; the command users run remains `tau` because it comes from the `bin` key.

## Cleanup phases

### 1. Freeze and verify the local-link contract

- Keep the `tau` bin mapping and document the `npm ci` → `npm run build` → `npm link` flow.
- Check the generated `dist/cli.mjs` launcher and dependency verifier with an npm-linked checkout. A source checkout should be recognized as development/local and must never trigger an attempt to install a different package globally.
- Verify `tau` runs from a directory outside the repository and still reads/writes only Tau-owned configuration and state.

### 2. Remove public npm identity

- Change the root package name to a private local identifier such as `tau-local`; keep the bin name `tau`.
- Remove public-only npm metadata, badges, publishing instructions, and registry-specific troubleshooting text.
- Keep the repository URL only if it remains useful for source updates or issue tracking.
- Do not publish the `tau-local` package.

### 3. Remove the standalone installer and repair machinery

- Remove the `packages/tau-installer` workspace and its release verification/publishing dependencies.
- Remove npm lifecycle repair logic that exists only to support global installation or publication, including `scripts/verify-deps.mjs` and installer-only preinstall/postinstall behavior, after confirming a linked checkout does not need it.
- Keep build-time generation of the CLI launcher and any native helpers required at runtime.
- Remove installer-specific tests and docs along with the implementation; retain tests for the local CLI build and link contract.

### 4. Remove registry-driven updating

- Remove `tau update` and automatic update checks that query npm, package-manager metadata, or release endpoints.
- Remove npm-global/local installation detection and update locks that become unused.
- Do not replace this with automatic `git pull`; updating a personal checkout should remain an explicit developer action.
- Keep ordinary doctor diagnostics that are useful for local runtime health, but remove install-method guidance.

### 5. Simplify manifests and release scaffolding

- Remove `publishConfig`, `prepublishOnly`, `prepack`, `postpack`, production shrinkwrap generation/checks, and installer publication verification if no remaining local workflow consumes them.
- Keep the dependency lockfile required by the chosen local install tool (`package-lock.json` for `npm ci`; `bun.lock` only if Bun remains a supported local install path).
- Keep build and focused test scripts; keep CI build-only if it remains useful for this private repository.

### 6. Final audit and validation

- Search for registry package names, installer commands, `npm publish`, global install repair, package-manager updater paths, and stale public badges/instructions.
- Confirm no compatibility path reads or writes Claude-owned config or project data.
- Run a clean `npm ci`, `npm run build`, production runtime smoke check, and focused tests for startup, providers, permissions, storage, resume, and the global link.
- From a temporary directory, run `tau --version`, then run `npm unlink -g tau-local` and confirm the link is removed without touching the checkout.

## Explicitly out of scope

Do not remove provider traffic, Anthropic SDK compatibility needed by other providers, OAuth/authentication that Tau still supports, permission and sandbox safeguards, core tools, sessions/resume, SSH, Tau Web APIs, or user/project skills as part of packaging cleanup.
