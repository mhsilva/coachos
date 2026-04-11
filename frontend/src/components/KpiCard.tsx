interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function KpiCard({ label, value, sub, accent = false }: Props) {
  return (
    <div className="bg-white rounded-card border border-teal/[0.09] shadow-card p-5">
      <p className="text-sm text-teal/50 mb-1">{label}</p>
      <p className={`font-jetbrains text-3xl font-medium ${accent ? 'text-copper' : 'text-teal'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-teal/40 mt-1">{sub}</p>}
    </div>
  )
}
