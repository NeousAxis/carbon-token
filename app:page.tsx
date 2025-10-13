import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function Home() {
  // Fetch supply actuel
  const { data: events } = await supabase
    .from('carbon_events')
    .select('decision, amount_crbn')
  
  const totalBurned = events?.filter(e => e.decision === 'BURN')
    .reduce((sum, e) => sum + e.amount_crbn, 0) || 0
  const totalMinted = events?.filter(e => e.decision === 'MINT')
    .reduce((sum, e) => sum + e.amount_crbn, 0) || 0
  const currentSupply = 1_000_000_000 - totalBurned + totalMinted
  const changePercent = ((currentSupply - 1_000_000_000) / 1_000_000_000 * 100).toFixed(3)

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-b from-green-50 to-white py-20">
        <div className="container mx-auto text-center px-6">
          <h1 className="text-6xl font-bold mb-6">
            CARBON
          </h1>
          <p className="text-2xl text-gray-700 mb-8">
            Le token qui disparaît si on sauve la planète
          </p>
          
          {/* Supply Live */}
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl mx-auto mb-8">
            <div className="text-sm text-gray-600 mb-2">Supply Actuel</div>
            <div className="text-5xl font-bold mb-2">
              {currentSupply.toLocaleString()}
            </div>
            <div className="text-sm">
              <span className={changePercent > 0 ? 'text-red-600' : 'text-green-600'}>
                {changePercent > 0 ? '↑' : '↓'} {Math.abs(parseFloat(changePercent))}%
              </span>
              {' '}depuis le lancement
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center">
            <Link 
              href="/buy"
              className="bg-green-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition"
            >
              Acheter CRBN
            </Link>
            <Link 
              href="/whitepaper"
              className="bg-gray-200 text-gray-800 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-300 transition"
            >
              Livre Blanc
            </Link>
          </div>
        </div>
      </section>

      {/* Concept Expliqué */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-4xl font-bold text-center mb-12">
            Comment ça marche ?
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <ConceptCard 
              icon="🔥"
              title="Action Positive"
              description="Loi climat, projet vert, objectif atteint → Tokens BRÛLÉS"
              color="green"
            />
            <ConceptCard 
              icon="➕"
              title="Action Négative"
              description="Pollution, déforestation, objectif raté → Tokens CRÉÉS"
              color="red"
            />
          </div>

          <div className="mt-12 p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
            <p className="text-lg text-center">
              <strong>Le paradoxe révolutionnaire :</strong><br/>
              Si l'humanité réussit → Supply diminue → Valeur augmente<br/>
              Si l'humanité échoue → Supply explose → Valeur s'effondre<br/>
              <span className="text-blue-600 font-bold">
                Impossible de s'enrichir en pariant contre la planète.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="container mx-auto">
          <h2 className="text-4xl font-bold text-center mb-8">
            Événements en Direct
          </h2>
          <div className="text-center mb-8">
            <Link 
              href="/dashboard"
              className="text-blue-600 hover:underline text-lg"
            >
              Voir tous les événements →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function ConceptCard({ icon, title, description, color }) {
  return (
    <div className={`p-6 rounded-lg border-2 border-${color}-300 bg-${color}-50`}>
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-700">{description}</p>
    </div>
  )
}