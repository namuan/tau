/**
 * Pattern lists for dangerous shell-tool allow-rule prefixes.
 *
 * An allow rule like `Bash(python:*)` lets the model run arbitrary code via
 * that interpreter, bypassing the auto-mode classifier. These lists feed the
 * Bash permission predicate in permissionSetup.ts.
 */

/**
 * Common code-execution entry points that must not be broadly allowlisted.
 */
export const CROSS_PLATFORM_CODE_EXEC = [
  // Interpreters
  'python',
  'python3',
  'python2',
  'node',
  'deno',
  'tsx',
  'ruby',
  'perl',
  'php',
  'lua',
  'pwsh',
  'powershell',
  // Package runners
  'npx',
  'bunx',
  'npm run',
  'yarn run',
  'pnpm run',
  'bun run',
  // Shells
  'bash',
  'sh',
  // Remote arbitrary-command wrapper
  'ssh',
] as const

export const DANGEROUS_BASH_PATTERNS: readonly string[] = [
  ...CROSS_PLATFORM_CODE_EXEC,
  'zsh',
  'fish',
  'eval',
  'exec',
  'env',
  'xargs',
  'sudo',
  // Anthropic internal: ant-only tools plus general tools that ant sandbox
  // dotfile data shows are commonly over-allowlisted as broad prefixes.
  // These stay ant-only — external users don't have coo, and the rest are
  // an empirical-risk call grounded in ant sandbox data, not a universal
  // "this tool is unsafe" judgment.
  ...(process.env.USER_TYPE === 'ant'
    ? [
        'fa run',
        // Cluster code launcher — arbitrary code on the cluster
        'coo',
        // Network/exfil: gh gist create --public, gh api arbitrary HTTP,
        // curl/wget POST. gh api needs its own entry — the matcher is
        // exact-shape, not prefix, so pattern 'gh' alone does not catch
        // rule 'gh api:*' (same reason 'npm run' is separate from 'npm').
        'gh',
        'gh api',
        'curl',
        'wget',
        // git config core.sshCommand / hooks install = arbitrary code
        'git',
        // Cloud resource writes (s3 public buckets, k8s mutations)
        'kubectl',
        'aws',
        'gcloud',
        'gsutil',
      ]
    : []),
]
