import { ELEMENT_NAMES } from '../constants/readingsConstants'

export const formatCompact = (num) => {
  const n = Number(num)
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) < 0.0005) return '0'
  return n.toFixed(3)
}

export const formatSigned = (num) => {
  const n = Number(num)
  if (!Number.isFinite(n)) return '0.000'
  const fixed = n.toFixed(3)
  return n > 0 ? `+${fixed}` : fixed
}

export const deltaTone = (delta) => {
  const abs = Math.abs(Number(delta) || 0)
  if (abs >= 0.3) return 'high'
  if (abs >= 0.05) return 'mid'
  return 'low'
}

export const isValidIsoDate = (value) => {
  if (!value || typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime())
}

export const getElementSymbols = () => Object.keys(ELEMENT_NAMES)

export const nameToSymbolMap = () => 
  Object.fromEntries(Object.entries(ELEMENT_NAMES).map(([s, n]) => [n, s]))

export const calculateAverages = (readings, readingIds) => {
  const subset = readings.filter(r => readingIds.has(r.id))
  if (!subset.length) return {}

  const sums = {}, counts = {}
  subset.forEach(r => r.elements.forEach(el => {
    sums[el.name] = (sums[el.name] || 0) + (el.value || 0)
    counts[el.name] = (counts[el.name] || 0) + 1
  }))

  const avgs = {}
  Object.keys(sums).forEach(k => {
    avgs[k] = parseFloat((sums[k] / counts[k]).toFixed(3))
  })
  return avgs
}

export const calculateDeltaRows = (machineBaseline, elementValues, primKey, displayPrim) => {
  return Object.keys(ELEMENT_NAMES).map((sym) => {
    const baseline = machineBaseline[sym] != null ? Number(machineBaseline[sym]) : 0
    const finalValue = Number(sym === primKey ? displayPrim : (elementValues[sym] ?? 0))
    const delta = Number((finalValue - baseline).toFixed(3))
    return { sym, baseline, finalValue, delta, absDelta: Math.abs(delta) }
  })
}