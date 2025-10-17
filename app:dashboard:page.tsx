import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function Dashboard() {
  // Fetch derniers événements
  const { data: events } = await supabase
    .from('carbon_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  // Calcul supply actuel (simulation)
  const totalBurned = events
    ?.filter(e => e.decision === 'BURN')
    .reduce((sum, e) => sum + e.amount_crbn, 0) || 0
  
  const totalMinted = events
    ?.filter(e => e.decision === 'MINT')
    .reduce((sum, e) => sum + e.amount_crbn, 0) || 0
  
  const initialSupply = 1_000_000_000
  const currentSupply = initialSupply - totalBurned + totalMinted

  return (
    <div className="container mx-auto p-6">
      {/* Stats Header */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard 
          title="Supply Actuel" 
          value={currentSupply.toLocaleString()} 
          subtitle="CBWD"
        />
        <StatCard 
          title="Total Brûlé" 
          value={totalBurned.toLocaleString()} 
          subtitle="🔥"
          color="green"
        />
        <StatCard 
          title="Total Créé" 
          value={totalMinted.toLocaleString()} 
          subtitle="➕"
          color="red"
        />
      </div>

      {/* Events Feed */}
      <h2 className="text-2xl font-bold mb-4">Événements Récents</h2>
      <div className="space-y-4">
        {events?.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle, color = 'blue' }) {
  return (
    <div className={`bg-${color}-50 p-6 rounded-lg border-2 border-${color}-200`}>
      <div className="text-sm text-gray-600">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{subtitle}</div>
    </div>
  )
}

function EventCard({ event }) {
  const isBurn = event.decision === 'BURN'
  
  return (
    <div className={`p-4 rounded-lg border-2 ${
      isBurn ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
    }`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-bold text-lg">{event.event_title}</h3>
          <p className="text-sm text-gray-600 mt-1">{event.justification}</p>
          <a 
            href={event.event_url} 
            target="_blank"
            className="text-sm text-blue-600 hover:underline mt-2 inline-block"
          >
            Source →
          </a>
        </div>
        
        <div className="text-right ml-4">
          <div className={`text-2xl font-bold ${isBurn ? 'text-green-600' : 'text-red-600'}`}>
            {isBurn ? '🔥' : '➕'} {event.amount_crbn.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">
            Confiance: {event.confidence}/10
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {new Date(event.created_at).toLocaleDateString('fr-FR')}
          </div>
        </div>
      </div>
    </div>
  )
}