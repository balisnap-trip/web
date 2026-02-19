'use client'

import { useEffect } from 'react'

export function PrintOnLoad({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    // Print dialogs generally require a user gesture; opening this tab from a click usually satisfies it.
    window.print()
  }, [enabled])

  return null
}

