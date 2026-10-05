import { execa } from 'execa'
import memoize from 'lodash-es/memoize.js'
import { tmpdir } from 'os'
import { join } from 'path'
import { logForDebugging } from './debug.js'
import { getFsImplementation } from './fsOperations.js'

const SCREENSHOT_FILENAME = 'tau_latest_screenshot.png'

function getScreenshotPath(): string {
  return join(tmpdir(), SCREENSHOT_FILENAME)
}

function getShellClipboardCommands(screenshotPath: string): {
  checkImage: string
  saveImage: string
  deleteFile: string
} {
  return {
    checkImage: `osascript -e 'the clipboard as «class PNGf»'`,
    saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
    deleteFile: `rm -f "${screenshotPath}"`,
  }
}

export function getClipboardTextCommand(): string {
  return `osascript -e 'get POSIX path of (the clipboard as «class furl»)'`
}

async function readClipboardImageViaTempFile(): Promise<Buffer | null> {
  const screenshotPath = getScreenshotPath()
  const commands = getShellClipboardCommands(screenshotPath)
  const fs = getFsImplementation()

  await execa(commands.deleteFile, { shell: true, reject: false })

  const saveResult = await execa(commands.saveImage, {
    shell: true,
    reject: false,
  })
  if (saveResult.exitCode !== 0) return null

  try {
    const buffer = fs.readFileBytesSync(screenshotPath)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  } finally {
    void execa(commands.deleteFile, { shell: true, reject: false })
  }
}

export function looksLikeImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.subarray(0, 8).equals(PNG_MAGIC)) return true
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  if (buffer.subarray(0, 3).toString('latin1') === 'GIF') return true
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true
  return (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  )
}

export async function readClipboardImageBytes(): Promise<Buffer | null> {
  const bytes = await readClipboardImageViaTempFile()
  if (!bytes) return null
  if (!looksLikeImageBuffer(bytes)) {
    logForDebugging('clipboard: image payload had no recognizable header', {
      level: 'warn',
    })
    return null
  }
  return bytes
}

export async function hasClipboardImage(): Promise<boolean> {
  const commands = getShellClipboardCommands(getScreenshotPath())
  const result = await execa(commands.checkImage, {
    shell: true,
    reject: false,
  })
  return result.exitCode === 0
}

export const isClipboardImageSupported = memoize((): boolean => true)

export const getClipboardImageSetupHint = memoize(
  async (): Promise<string | null> => null,
)
