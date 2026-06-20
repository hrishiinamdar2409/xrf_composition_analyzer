import { formatSigned } from '../../utils/readingsUtils'

export default function DeltaBadge({ delta, label, showLabel = true }) {
  const abs = Math.abs(delta || 0)
  const tone = abs >= 0.3 ? 'high' : abs >= 0.05 ? 'mid' : 'low'
  
  const colorClasses = {
    high: 'text-red-700 border-red-200 bg-red-50',
    mid: 'text-amber-700 border-amber-200 bg-amber-50',
    low: 'text-slate-700 border-slate-300 bg-slate-50'
  }

  return (
    <span className={`text-[11px] leading-5 font-semibold px-2 py-0.5 rounded-md border ${colorClasses[tone]}`}>
      {label && `${label}: `}
      {formatSigned(delta)}
    </span>
  )
}