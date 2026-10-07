
import { initializeErrorLogSink } from './errorLogSink.js'

/**
 * Leaf module — kept out of setup.ts to avoid the setup → commands → bridge
 * → setup import cycle.
 */
export function initSinks(): void {
  initializeErrorLogSink()
}
