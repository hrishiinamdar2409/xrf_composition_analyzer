import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const KARAT_TABLE = [
  { min: 99.0, label: '24K (999)' },
  { min: 91.6, label: '22K (916)' },
  { min: 75.0, label: '18K (750)' },
  { min: 58.3, label: '14K (585)' },
  { min: 41.7, label: '10K (417)' },
  { min: 37.5, label: '9K (375)'  },
  { min: 0,    label: 'Below 9K'  },
]

function karatLabel(auPct) {
  if (auPct === null || auPct === undefined) return '—'
  const entry = KARAT_TABLE.find(k => auPct >= k.min)
  return entry ? entry.label : '—'
}

export default function SampleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sample, setSample] = useState(null)
  const [expertValues, setExpertValues] = useState({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [sendingPrint, setSendingPrint] = useState(false)

  const load = () => {
    fetch(`/api/samples/${id}`)
      .then(r => r.json())
      .then(data => {
        setSample(data)
        setNotes(data.expert_notes || '')
        // Pre-fill expert values from final_results or auto_results
        const vals = {}
        const elementNames = data.readings.flatMap(r => r.elements.map(e => e.name))
        const uniqueNames = [...new Set(elementNames)]
        for (const name of uniqueNames) {
          const fin = data.finalResults.find(f => f.element === name)
          const auto = data.autoResults.find(a => a.element === name)
          vals[name] = fin?.expert_value ?? auto?.auto_value ?? ''
        }
        setExpertValues(vals)
      })
      .catch(console.error)
  }

  useEffect(() => { load() }, [id])

  if (!sample) return <div className="py-10 text-center text-gray-400">Loading…</div>

  const isLocked = sample.status === 'report_generated'
  const elementNames = [...new Set(sample.readings.flatMap(r => r.elements.map(e => e.name)))]
  const auValue = expertValues['Au'] !== '' ? Number(expertValues['Au']) : null

  const toggleExclude = async (readingId, currentlyExcluded) => {
    await fetch(`/api/samples/${id}/readings/${readingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excluded: !currentlyExcluded }),
    })
    load()
  }

  const saveResult = async () => {
    setSaving(true)
    try {
      const numericValues = {}
      for (const [k, v] of Object.entries(expertValues)) {
        if (v !== '') numericValues[k] = Number(v)
      }
      await fetch(`/api/samples/${id}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expertValues: numericValues, notes }),
      })
      load()
    } finally {
      setSaving(false)
    }
  }

  const generateReport = async () => {
    setSendingPrint(true)
    try {
      const res = await fetch(`/api/samples/${id}/report`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || body?.error || 'Print failed')
      alert(`Print job sent${body?.printer ? ` to ${body.printer}` : ''}.`)
    } catch (err) {
      alert(`Could not print report. ${err.message}`)
    } finally {
      setSendingPrint(false)
    }
  }

  const resetToAuto = () => {
    const vals = {}
    for (const name of elementNames) {
      const auto = sample.autoResults.find(a => a.element === name)
      vals[name] = auto?.auto_value ?? ''
    }
    setExpertValues(vals)
  }

  // When the expert commits a value (onBlur), scale all other elements
  // proportionally so the total stays at 100 %.
  const normalizeOthers = (changedName) => {
    const changedVal = parseFloat(expertValues[changedName])
    if (isNaN(changedVal)) return

    const clamped = Math.min(100, Math.max(0, changedVal))
    const others = elementNames.filter(n => n !== changedName)
    if (others.length === 0) return

    const othersSum = others.reduce(
      (sum, n) => sum + (parseFloat(expertValues[n]) || 0),
      0
    )
    const remaining = 100 - clamped

    const newVals = { ...expertValues, [changedName]: clamped.toFixed(3) }
    others.forEach(n => {
      const old = parseFloat(expertValues[n]) || 0
      const scaled = othersSum === 0
        ? remaining / others.length          // distribute equally if all zero
        : (old / othersSum) * remaining
      newVals[n] = Math.max(0, scaled).toFixed(3)
    })
    setExpertValues(newVals)
  }

  const expertTotal = elementNames.reduce(
    (sum, n) => sum + (parseFloat(expertValues[n]) || 0),
    0
  )

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/samples')} className="text-sm text-gray-400 hover:text-gray-600 mb-1">
            ← Back to Jobs
          </button>
          <h1 className="text-2xl font-bold text-gold-700">{sample.job_ref}</h1>
          {sample.customer_name && <p className="text-gray-600">{sample.customer_name}</p>}
          {sample.item_desc && <p className="text-gray-500 text-sm">{sample.item_desc}</p>}
        </div>
        <div className="text-right text-sm text-gray-400">
          <div>{new Date(sample.created_at).toLocaleString()}</div>
        </div>
      </div>

      {/* Readings table */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-2">
          Individual Readings ({sample.readings.length})
        </h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-3 py-2">Include</th>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Time</th>
                {elementNames.map(n => (
                  <th key={n} className="px-3 py-2 text-right">{n} %</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sample.readings.map(r => (
                <tr
                  key={r.id}
                  className={r.excluded ? 'opacity-40 bg-gray-50' : ''}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!r.excluded}
                      disabled={isLocked}
                      onChange={() => toggleExclude(r.id, !!r.excluded)}
                      className="accent-gold-500 w-4 h-4"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{r.nbr ?? r.id}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(r.arrived_at).toLocaleTimeString()}
                  </td>
                  {elementNames.map(name => {
                    const el = r.elements.find(e => e.name === name)
                    return (
                      <td key={name} className="px-3 py-2 text-right font-mono">
                        {el?.value?.toFixed(3) ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            {/* Auto-averages row */}
            <tfoot className="bg-gold-50 font-semibold text-gold-800 text-xs">
              <tr>
                <td className="px-3 py-2" colSpan={3}>Auto Average (included readings)</td>
                {elementNames.map(name => {
                  const auto = sample.autoResults.find(a => a.element === name)
                  return (
                    <td key={name} className="px-3 py-2 text-right font-mono">
                      {auto?.auto_value?.toFixed(3) ?? '—'}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Expert result fields */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Expert Final Result</h2>
          {!isLocked && (
            <button
              onClick={resetToAuto}
              className="text-xs text-blue-500 hover:underline"
            >
              Reset to Auto Values
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {elementNames.map(name => (
            <div key={name} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">{name} %</label>
              <input
                type="number"
                step="0.001"
                value={expertValues[name] ?? ''}
                disabled={isLocked}
                onChange={e => setExpertValues(prev => ({ ...prev, [name]: e.target.value }))}
                onBlur={() => !isLocked && elementNames.length > 1 && normalizeOthers(name)}
                className="w-28 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-gray-50"
              />
            </div>
          ))}
          {/* Karat display */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Karat</label>
            <div className="w-28 border border-gold-300 rounded px-2 py-1 text-sm font-bold text-gold-700 bg-gold-50">
              {karatLabel(auValue)}
            </div>
          </div>
          {/* Live total */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Total %</label>
            <div className={`w-28 border rounded px-2 py-1 text-sm font-mono font-semibold ${
              Math.abs(expertTotal - 100) < 0.01
                ? 'border-green-300 text-green-700 bg-green-50'
                : 'border-red-300 text-red-600 bg-red-50'
            }`}>
              {expertTotal.toFixed(3)}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500">Expert Notes</label>
          <textarea
            value={notes}
            disabled={isLocked}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Explain any modifications or observations..."
            className="w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-gray-50"
          />
        </div>

        {!isLocked && (
          <button
            onClick={saveResult}
            disabled={saving}
            className="px-5 py-2 bg-blue-500 text-white rounded font-medium text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Expert Result'}
          </button>
        )}
      </div>

      {/* Report actions */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-5 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-purple-800">Customer Report</h2>
          <p className="text-sm text-purple-600">
            Preview/print directly without approval step.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/samples/${id}/export.csv`}
            download={`${sample.job_ref}.csv`}
            className="px-4 py-2 bg-white border border-purple-300 text-purple-700 rounded font-medium text-sm hover:bg-purple-50"
          >
            ⬇ CSV Export
          </a>
          <button
            onClick={generateReport}
            disabled={sendingPrint}
            className="px-6 py-2 bg-purple-600 text-white rounded font-semibold text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {sendingPrint ? 'Sending Print…' : '🖨 Print Certificate'}
          </button>
        </div>
      </div>
    </div>
  )
}
