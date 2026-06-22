import { useState } from 'react'
import { PROFILE_FILTERS, READING_COLUMNS } from '../../constants/readingsConstants'

export default function ReadingsTable({
  readings,
  selectedReadingIds,
  toggleReading,
  selectAllReadings,
  clearReadings,
  profileFilter,
  setProfileFilter,
  onSelectLastN,
}) {
  // Filter readings based on selected filter
  const filteredReadings = readings.filter(r => {
    if (profileFilter === 'DATA') return true
    if (profileFilter === 'ALL') return r.profile === 'ALL'
    return r.profile === profileFilter
  })

  // Sort readings: block descending, entry_index ascending
  const sortedReadings = [...filteredReadings].sort((a, b) => {
    const blockA = a.block || ''
    const blockB = b.block || ''
    if (blockA !== blockB) {
      const numA = parseInt(blockA)
      const numB = parseInt(blockB)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA
      }
      return blockB.localeCompare(blockA)
    }
    const idxA = a.entry_index ?? 0
    const idxB = b.entry_index ?? 0
    return idxA - idxB
  })

  const handleSelectLastN = (n) => {
    if (sortedReadings.length < n) return
    const selected = new Set(sortedReadings.slice(0, n).map(r => r.id))
    onSelectLastN?.(selected)
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-sm font-semibold text-slate-700">LIVE READING RETRIEVAL</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {selectedReadingIds.size} of {sortedReadings.length} selected
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

      {/* Profile Filter Buttons */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest shrink-0 mr-1">
          PROFILE
        </span>
        <button
          onClick={() => setProfileFilter('DATA')}
          className={`h-7 px-3 rounded text-xs font-semibold border transition-all active:scale-95 ${
            profileFilter === 'DATA'
              ? 'bg-[#1a73ca] text-white border-[#1a73ca]'
              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
          }`}
        >
          DATA
        </button>
        <button
          onClick={() => setProfileFilter('ALL')}
          className={`h-7 px-3 rounded text-xs font-semibold border transition-all active:scale-95 ${
            profileFilter === 'ALL'
              ? 'bg-[#1a73ca] text-white border-[#1a73ca]'
              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
          }`}
        >
          ALL
        </button>
        {PROFILE_FILTERS.filter(p => p !== 'ALL').map(profile => (
          <button
            key={profile}
            onClick={() => setProfileFilter(profile)}
            className={`h-7 px-3 rounded text-xs font-semibold border transition-all active:scale-95 ${
              profileFilter === profile
                ? 'bg-[#1a73ca] text-white border-[#1a73ca]'
                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
            }`}
          >
            {profile}
          </button>
        ))}
        <span className="text-[10px] text-slate-500 ml-1">
          ({sortedReadings.length} rows)
        </span>
      </div>

      {/* Quick-select last N readings */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest shrink-0">LAST</span>
        {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
          <button key={n}
            onClick={() => handleSelectLastN(n)}
            disabled={sortedReadings.length < n}
            className={`h-6 w-7 rounded text-xs font-bold border transition-all active:scale-95 disabled:opacity-30 ${
              selectedReadingIds.size === n && 
              [...selectedReadingIds].every(id => sortedReadings.slice(0, n).some(r => r.id === id))
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
                  checked={sortedReadings.length > 0 && selectedReadingIds.size === sortedReadings.length}
                  onChange={e => e.target.checked ? selectAllReadings() : clearReadings()}
                  className="accent-[#1a73ca] w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              <th className="px-2 py-2 text-left whitespace-nowrap">BLOCK</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">ENTRY</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">SERIAL</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">CUSTOMER</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">SAMPLE TYPE</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">WEIGHT</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">PROFILE</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">FILE</th>
              {READING_COLUMNS.map(sym => (
                <th key={sym} className="px-2 py-2 text-right whitespace-nowrap">{sym}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sortedReadings.length === 0 ? (
              <tr>
                <td colSpan={9 + READING_COLUMNS.length} className="text-center py-12 text-slate-500">
                  {readings.length === 0 ? 'Waiting for readings from WinFTM…' : `No readings with filter "${profileFilter}"`}
                </td>
              </tr>
            ) : sortedReadings.map(r => {
              const isSelected = selectedReadingIds.has(r.id)
              const elMap = {}
              if (r.elements && Array.isArray(r.elements)) {
                r.elements.forEach(el => {
                  elMap[el.name] = el.value
                })
              }
              READING_COLUMNS.forEach(sym => {
                if (r[sym] !== undefined && elMap[sym] === undefined) {
                  elMap[sym] = r[sym]
                }
              })
              
              return (
                <tr key={r.id}
                  onClick={() => {
                    toggleReading(r.id)
                  }}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#e8f1fb] border-l-2 border-l-[#1a73ca]' : 'hover:bg-slate-700/50'
                  }`}>
                  <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleReading(r.id)}
                      className="accent-[#1a73ca] w-3.5 h-3.5 cursor-pointer" />
                  </td>
                  <td className="px-2 py-1.5 font-mono font-bold text-slate-300">{r.block || '-'}</td>
                  <td className="px-2 py-1.5 text-slate-300">{r.entry_index ?? '-'}</td>
                  <td className="px-2 py-1.5 text-slate-300">{r.serial_number || '-'}</td>
                  <td className="px-2 py-1.5 text-slate-300 truncate max-w-[100px]" title={r.customer_name}>
                    {r.customer_name || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">{r.sample_type || '-'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-300">{r.weight != null ? r.weight.toFixed(3) : '-'}</td>
                  <td className="px-2 py-1.5 text-slate-300">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      r.profile === 'ALL' ? 'bg-blue-500/20 text-blue-400' :
                      r.profile === 'JEWEL' ? 'bg-amber-500/20 text-amber-400' :
                      r.profile === 'FINE' ? 'bg-emerald-500/20 text-emerald-400' :
                      r.profile === 'PURE' ? 'bg-purple-500/20 text-purple-400' :
                      r.profile === 'SILVER' ? 'bg-slate-400/20 text-slate-300' :
                      r.profile === 'TUNCH' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {r.profile || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-400 truncate max-w-[120px]" title={r.file_path}>
                    {r.file_path ? r.file_path.split(/[/\\]/).pop() : '-'}
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
              const subset = sortedReadings.filter(r => selectedReadingIds.has(r.id))
              const sums = {}, counts = {}
              subset.forEach(r => {
                const elMap = {}
                if (r.elements && Array.isArray(r.elements)) {
                  r.elements.forEach(el => {
                    elMap[el.name] = el.value
                  })
                }
                READING_COLUMNS.forEach(sym => {
                  const val = elMap[sym] ?? r[sym] ?? 0
                  sums[sym] = (sums[sym] || 0) + val
                  counts[sym] = (counts[sym] || 0) + 1
                })
              })
              return (
                <tr className="bg-[#e8f1fb] border-t-2 border-[#1a73ca] font-bold">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-[#1a73ca] text-xs uppercase tracking-wide whitespace-nowrap" colSpan="8">
                    Avg ({selectedReadingIds.size})
                  </td>
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