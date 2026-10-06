import {
  getApiKeyFromFd,
  getOauthTokenFromFd,
  setApiKeyFromFd,
  setOauthTokenFromFd,
} from '../bootstrap/state.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { getFsImplementation } from './fsOperations.js'

function getCredentialFromFd({
  envVar,
  label,
  getCached,
  setCached,
}: {
  envVar: string
  label: string
  getCached: () => string | null | undefined
  setCached: (value: string | null) => void
}): string | null {
  const cached = getCached()
  if (cached !== undefined) {
    return cached
  }

  const fdEnv = process.env[envVar]
  if (!fdEnv) {
    setCached(null)
    return null
  }

  const fd = parseInt(fdEnv, 10)
  if (Number.isNaN(fd)) {
    logForDebugging(
      `${envVar} must be a valid file descriptor number, got: ${fdEnv}`,
      { level: 'error' },
    )
    setCached(null)
    return null
  }

  try {
    const fsOps = getFsImplementation()
    const fdPath =
      process.platform === 'darwin' || process.platform === 'freebsd'
        ? `/dev/fd/${fd}`
        : `/proc/self/fd/${fd}`
    const token = fsOps.readFileSync(fdPath, { encoding: 'utf8' }).trim()
    if (!token) {
      logForDebugging(`File descriptor contained empty ${label}`, {
        level: 'error',
      })
      setCached(null)
      return null
    }
    logForDebugging(`Successfully read ${label} from file descriptor ${fd}`)
    setCached(token)
    return token
  } catch (error) {
    logForDebugging(
      `Failed to read ${label} from file descriptor ${fd}: ${errorMessage(error)}`,
      { level: 'error' },
    )
    setCached(null)
    return null
  }
}

export function getOAuthTokenFromFileDescriptor(): string | null {
  return getCredentialFromFd({
    envVar: 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
    label: 'OAuth token',
    getCached: getOauthTokenFromFd,
    setCached: setOauthTokenFromFd,
  })
}

export function getApiKeyFromFileDescriptor(): string | null {
  return getCredentialFromFd({
    envVar: 'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
    label: 'API key',
    getCached: getApiKeyFromFd,
    setCached: setApiKeyFromFd,
  })
}
