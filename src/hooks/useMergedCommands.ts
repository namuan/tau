import { useMemo } from 'react'
import type { Command } from '../commands.js'

export function useMergedCommands(initialCommands: Command[]): Command[] {
  return useMemo(() => initialCommands, [initialCommands])
}
