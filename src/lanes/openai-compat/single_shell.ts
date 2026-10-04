/**
 * Single-shell filter for the openai-compat lane.
 *
 * When Bash and PowerShell are both available, frontier models can decide
 * which one to use based on context; weaker models may pick the wrong one
 * and emit cross-shell syntax.
 *
 * Strategy: when both tools are in the array passed to the lane, keep
 * exactly one. Pick based on the user's explicit shell preference, defaulting
 * to Bash.
 *
 * Selection order (first match wins):
 *   1. `CLAUDE_CODE_SHELL` env points to a shell binary → keep that
 *      shell's tool. Lets users with a strong preference override.
 *   2. Otherwise → keep Bash.
 *
 * Caller: invoke once per request from `streamAsProvider`, AFTER the
 * transformer's `filterTools()` hook so per-model tool budgets still
 * win.
 */

interface Named {
  name: string
}

const BASH_NAME = 'Bash'
const PS_NAME = 'PowerShell'

/**
 * If both shell tools are present, drop one and return a new array.
 * If only one (or neither) is present, returns the input unchanged.
 */
export function filterToSingleShell<T extends Named>(tools: T[]): T[] {
  const hasBash = tools.some(t => t.name === BASH_NAME)
  const hasPS = tools.some(t => t.name === PS_NAME)
  if (!hasBash || !hasPS) return tools

  const keep = pickPreferredShell()
  const drop = keep === BASH_NAME ? PS_NAME : BASH_NAME
  return tools.filter(t => t.name !== drop)
}

/**
 * Internal — exported only for the regression test.
 */
export function pickPreferredShell(): typeof BASH_NAME | typeof PS_NAME {
  const override = process.env.CLAUDE_CODE_SHELL?.toLowerCase() ?? ''
  if (override.includes('powershell') || override.includes('pwsh')) {
    return PS_NAME
  }
  return BASH_NAME
}
