import { READING_COLUMNS, ELEMENT_NAMES } from '../../constants/readingsConstants'

export default function ReadingsTable({
  readings,
  selectedReadingIds,
  toggleReading,
  selectAllReadings,
  clearReadings,
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-sm font-semibold text-slate-700">LIVE READING RETRIEVAL</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {selectedReadingIds.size} of {readings.length} selected
          </span>
          <button onClick={selectAllReadings}
            className="px-3 h-7 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors border border-slate-600">
            All
          </button>
          <button onClick={clearReadings}
            className="px-3 h-7 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors border border-slate-600">
            Clear
          </button>
        </div>
      </div>

      {/* Quick-select last N readings */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest shrink-0">Last</span>
        {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
          <button key={n}
            onClick={() => {
              const next = new Set(readings.slice(0, n).map(r => r.id))
              // This function is passed from parent
              const selectLastN = () => {
                // Implementation in parent
              }
              // This will be handled by parent's applyReadingsSelection
            }}
            disabled={readings.length < n}
            className={`h-6 w-7 rounded text-xs font-bold border transition-all active:scale-95 disabled:opacity-30 ${
              selectedReadingIds.size === n && [...selectedReadingIds].every(id => readings.slice(0, n).some(r => r.id === id))
                ? 'bg-[#1a73ca] text-white border-[#1a73ca]'
                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
            }`}>
            {n}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-2 py-2 w-7">
                <input type="checkbox"
                  checked={readings.length > 0 && selectedReadingIds.size === readings.length}
                  onChange={e => e.target.checked ? selectAllReadings() : clearReadings()}
                  className="accent-[#1a73ca] w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Time</th>
              {READING_COLUMNS.map(sym => (
                <th key={sym} className="px-2 py-2 text-right whitespace-nowrap">{ELEMENT_NAMES[sym] || sym}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {readings.length === 0 ? (
              <tr>
                <td colSpan={3 + READING_COLUMNS.length} className="text-center py-12 text-slate-500">
                  Waiting for readings from WinFTM…
                </td>
              </tr>
            ) : readings.map(r => {
              const isSelected = selectedReadingIds.has(r.id)
              const elMap = Object.fromEntries(r.elements.map(el => [el.name, el.value]))
              return (
                <tr key={r.id}
                  onClick={() => toggleReading(r.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#e8f1fb] border-l-2 border-l-[#1a73ca]' : 'hover:bg-slate-700/50'
                  }`}>
                  <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleReading(r.id)}
                      className="accent-[#1a73ca] w-3.5 h-3.5 cursor-pointer" />
                  </td>
                  <td className="px-2 py-1.5 font-mono font-bold text-slate-300">{r.nbr ?? r.id}</td>
                  <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">
                    {new Date(r.arrived_at).toLocaleString()}
                  </td>
                  {READING_COLUMNS.map(sym => (
                    <td key={sym} className="px-2 py-1.5 text-right font-mono text-slate-300">
                      {(elMap[sym] ?? 0).toFixed(3)}
                    </td>
                  ))}
                </tr>
              )
            })}

            {/* Live average row */}
            {selectedReadingIds.size > 0 && (() => {
              const subset = readings.filter(r => selectedReadingIds.has(r.id))
              const sums = {}, counts = {}
              subset.forEach(r => r.elements.forEach(el => {
                sums[el.name] = (sums[el.name] || 0) + (el.value || 0)
                counts[el.name] = (counts[el.name] || 0) + 1
              }))
              return (
                <tr className="bg-[#e8f1fb] border-t-2 border-[#1a73ca] font-bold">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-[#1a73ca] text-xs uppercase tracking-wide whitespace-nowrap">
                    Avg ({selectedReadingIds.size})
                  </td>
                  <td className="px-2 py-1.5 text-[#1a73ca] text-xs">—</td>
                  {READING_COLUMNS.map(sym => {
                    const avg = sums[sym] != null ? sums[sym] / counts[sym] : 0
                    return (
                      <td key={sym} className="px-2 py-1.5 text-right font-mono text-[#1a73ca]">
                        {avg.toFixed(3)}
                      </td>
                    )
                  })}
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}