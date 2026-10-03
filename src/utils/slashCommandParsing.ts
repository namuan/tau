export type ParsedSlashCommand = {
  commandName: string
  args: string
}

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmedInput = input.trim()
  if (!trimmedInput.startsWith('/')) return null
  const [commandName, ...args] = trimmedInput.slice(1).split(' ')
  if (!commandName) return null
  return { commandName, args: args.join(' ') }
}
