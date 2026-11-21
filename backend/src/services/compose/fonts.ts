import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { GlobalFonts } from '@napi-rs/canvas'

let registered: string | null = null

function findSarabun(): string | null {
  const roots = [
    '/System/Library/AssetsV2/com_apple_MobileAsset_Font8',
    '/System/Library/AssetsV2/PreinstalledAssetsV2/InstallWithOs/com_apple_MobileAsset_Font7',
  ]
  for (const root of roots) {
    try {
      for (const dir of readdirSync(root)) {
        const file = path.join(root, dir, 'AssetData', 'Sarabun.ttc')
        if (existsSync(file)) return file
      }
    } catch {
      // The folder is missing on other systems.
    }
  }
  return null
}

/**
 * A family that can draw Thai. COMPOSE_FONT_PATH points at any font file
 * (Noto Sans Thai, Inter plus a Thai face, and so on); otherwise Sarabun when
 * the system carries it, otherwise Thonburi, which ships with macOS.
 */
export function thaiFontFamily(): string {
  if (registered) return registered
  const wanted = process.env.COMPOSE_FONT_PATH?.trim()
  const file = wanted && existsSync(wanted) ? wanted : findSarabun()
  if (file) {
    try {
      if (GlobalFonts.registerFromPath(file, 'ComposeThai')) {
        registered = 'ComposeThai'
        return registered
      }
    } catch {
      // Fall through to the system family.
    }
  }
  registered = 'Thonburi'
  return registered
}
