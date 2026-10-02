import { feature } from 'bun:bundle'
import { stat } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { env } from './env.js'
import { isEnvTruthy } from './envUtils.js'
import { execFileNoThrow } from './execFileNoThrow.js'

// Functions that require execFileNoThrow and thus cannot be in env.ts

const getIsDocker = memoize(async (): Promise<boolean> => {
  if (process.platform !== 'linux') return false
  // Check for .dockerenv file
  const { code } = await execFileNoThrow('test', ['-f', '/.dockerenv'])
  return code === 0
})

function getIsBubblewrapSandbox(): boolean {
  return (
    process.platform === 'linux' &&
    isEnvTruthy(process.env.CLAUDE_CODE_BUBBLEWRAP)
  )
}

// Cache for the runtime musl detection fallback (node/unbundled only).
// In native linux builds, feature flags resolve this at compile time, so the
// cache is only consulted when both IS_LIBC_MUSL and IS_LIBC_GLIBC are false.
let muslRuntimeCache: boolean | null = null

// Fire-and-forget: populate the musl cache for the node fallback path.
// Native builds never reach this (feature flags short-circuit), so this only
// matters for unbundled node on Linux. Installer calls on native builds are
// unaffected since feature() resolves at compile time.
if (process.platform === 'linux') {
  const muslArch = process.arch === 'x64' ? 'x86_64' : 'aarch64'
  void stat(`/lib/libc.musl-${muslArch}.so.1`).then(
    () => {
      muslRuntimeCache = true
    },
    () => {
      muslRuntimeCache = false
    },
  )
}

/**
 * Checks if the system is using MUSL libc instead of glibc.
 * In native linux builds, this is statically known at compile time via IS_LIBC_MUSL/IS_LIBC_GLIBC flags.
 * In node (unbundled), both flags are false and we fall back to a runtime async stat check
 * whose result is cached at module load. If the cache isn't populated yet, returns false.
 */
function isMuslEnvironment(): boolean {
  if (feature('IS_LIBC_MUSL')) return true
  if (feature('IS_LIBC_GLIBC')) return false

  // Fallback for node: runtime detection via pre-populated cache
  if (process.platform !== 'linux') return false
  return muslRuntimeCache ?? false
}

// Combined export that includes all env properties plus dynamic functions
export const envDynamic = {
  ...env, // Include all properties from env
  getIsDocker,
  getIsBubblewrapSandbox,
  isMuslEnvironment,
}
