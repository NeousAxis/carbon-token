'use client'

import { useEffect } from 'react'

export default function Buy() {
  useEffect(() => {
    // Redirection automatique vers Jupiter avec CBWD pré-sélectionné
    const jupiterUrl = `https://jup.ag/swap/SOL-CBWD_MINT_ADDRESS_ICI`
    window.location.href = jupiterUrl
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-6xl mb-4">⏳</div>
        <p className="text-xl">Redirection vers Jupiter DEX...</p>
      </div>
    </div>
  )
}