import { execa } from 'execa'
import memoize from 'lodash-es/memoize.js'
import { getCwd } from './cwd.js'

export const getGitEmail = memoize(async (): Promise<string | undefined> => {
  const result = await execa('git config --get user.email', {
    shell: true,
    reject: false,
    cwd: getCwd(),
  })
  return result.exitCode === 0 && result.stdout
    ? result.stdout.trim()
    : undefined
})
