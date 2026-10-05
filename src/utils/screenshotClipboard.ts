import { mkdir, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { type AnsiToPngOptions, ansiToPng } from './ansiToPng.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'
import { logError } from './log.js'

/**
 * Copies an image (from ANSI text) to the system clipboard.
 * Supports macOS.
 *
 * Pure-TS pipeline: ANSI text → bitmap-font render → PNG encode. No WASM,
 * no system fonts, so this works in every build (native and JS).
 */
export async function copyAnsiToClipboard(
  ansiText: string,
  options?: AnsiToPngOptions,
): Promise<{ success: boolean; message: string }> {
  try {
    const tempDir = join(tmpdir(), 'tau-screenshots')
    await mkdir(tempDir, { recursive: true })

    const pngPath = join(tempDir, `screenshot-${Date.now()}.png`)
    const pngBuffer = ansiToPng(ansiText, options)
    await writeFile(pngPath, pngBuffer)

    const result = await copyPngToClipboard(pngPath)

    try {
      await unlink(pngPath)
    } catch {
    }

    return result
  } catch (error) {
    logError(error)
    return {
      success: false,
      message: `Failed to copy screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

async function copyPngToClipboard(
  pngPath: string,
): Promise<{ success: boolean; message: string }> {
  const escapedPath = pngPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `set the clipboard to (read (POSIX file "${escapedPath}") as «class PNGf»)`
  const result = await execFileNoThrowWithCwd('osascript', ['-e', script], {
    timeout: 5000,
  })

  if (result.code === 0) {
    return { success: true, message: 'Screenshot copied to clipboard' }
  }
  return {
    success: false,
    message: `Failed to copy to clipboard: ${result.stderr}`,
  }
}
