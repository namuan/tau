import { readdir } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { getFsImplementation } from './fsOperations.js'
import { logError } from './log.js'

export type Platform = 'macos' | 'windows' | 'wsl' | 'linux' | 'unknown'

export const SUPPORTED_PLATFORMS: Platform[] = ['macos']

export const getPlatform = memoize((): Platform => {
  try {
    if (process.platform === 'darwin') {
      return 'macos'
    }

    if (process.platform === 'win32') {
      return 'windows'
    }

    if (process.platform === 'linux') {
      return 'linux'
    }

    // Unknown platform
    return 'unknown'
  } catch (error) {
    logError(error)
    return 'unknown'
  }
})

const VCS_MARKERS: Array<[string, string]> = [
  ['.git', 'git'],
  ['.hg', 'mercurial'],
  ['.svn', 'svn'],
  ['.p4config', 'perforce'],
  ['$tf', 'tfs'],
  ['.tfvc', 'tfs'],
  ['.jj', 'jujutsu'],
  ['.sl', 'sapling'],
]

export async function detectVcs(dir?: string): Promise<string[]> {
  const detected = new Set<string>()

  // Check for Perforce via env var
  if (process.env.P4PORT) {
    detected.add('perforce')
  }

  try {
    const targetDir = dir ?? getFsImplementation().cwd()
    const entries = new Set(await readdir(targetDir))
    for (const [marker, vcs] of VCS_MARKERS) {
      if (entries.has(marker)) {
        detected.add(vcs)
      }
    }
  } catch {
    // Directory may not be readable
  }

  return [...detected]
}
