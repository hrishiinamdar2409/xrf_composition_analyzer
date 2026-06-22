import React from 'react'
import { READING_COLUMNS } from '../../constants/readingsConstants'

const ORDERED_PROFILES = ['TUNCH', 'FINE', 'JEWEL', 'PURE', 'SILVER']

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

  const getSelectedDateRange = () => {
  const selected = readings.filter(r => selectedReadingIds.has(r.id));
  if (!selected.length) return null;
  
  let minDate = null;
  let maxDate = null;
  
  selected.forEach(r => {
    let dateObj = null;
    if (r.reading_date && r.reading_time) {
      const dateStr = `${r.reading_date} ${r.reading_time}`;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    } else if (r.reading_date) {
      const parts = r.reading_date.split('-');
      if (parts.length === 3) {
        dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    } else if (r.arrived_at) {
      dateObj = new Date(r.arrived_at);
    }
    
    if (dateObj && !isNaN(dateObj.getTime())) {
      if (!minDate || dateObj < minDate) minDate = dateObj;
      if (!maxDate || dateObj > maxDate) maxDate = dateObj;
    }
  });
  
  return { minDate, maxDate };
};

const dateRange = getSelectedDateRange();

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

  // Group sorted readings by Block for nested display
  const groupedByBlock = sortedReadings.reduce((groups, reading) => {
    const blockName = reading.block || 'No Block'
    if (!groups[blockName]) groups[blockName] = []
    groups[blockName].push(reading)
    return groups
  }, {})

  // Get ordered list of block keys
  const blockKeys = Object.keys(groupedByBlock).sort((a, b) => {
    const numA = parseInt(a), numB = parseInt(b)
    if (!isNaN(numA) && !isNaN(numB)) return numB - numA
    return b.localeCompare(a)
  })

  const handleSelectLastN = (n) => {
    if (sortedReadings.length < n) return
    const selected = new Set(sortedReadings.slice(0, n).map(r => r.id))
    onSelectLastN?.(selected)
  }

  // Toggle selection for an entire block
  const toggleBlockSelection = (blockReadings) => {
    const allSelected = blockReadings.every(r => selectedReadingIds.has(r.id))
    blockReadings.forEach(r => {
      if (allSelected && selectedReadingIds.has(r.id)) {
        toggleReading(r.id)
      } else if (!allSelected && !selectedReadingIds.has(r.id)) {
        toggleReading(r.id)
      }
    })
  }

  // Helper method to look deep into raw reading parameters with SQL Alias Fallbacks
  const getElementValue = (reading, symbol) => {
    // CATCH BACKEND SQL ALIAS: "x1 AS karat"
    if (symbol.toLowerCase() === 'x1' && reading.karat !== undefined) {
      return Number(reading.karat)
    }

    // 1. Check inside elements sub-array if existing
    if (reading.elements && Array.isArray(reading.elements)) {
      const match = reading.elements.find(el => el && el.name && el.name.toLowerCase() === symbol.toLowerCase())
      if (match && match.value !== undefined) return Number(match.value)
    }

    // 2. Direct property fallbacks on root item object
    if (reading[symbol] !== undefined) return Number(reading[symbol])
    if (reading[symbol.toLowerCase()] !== undefined) return Number(reading[symbol.toLowerCase()])
    if (reading[symbol.toUpperCase()] !== undefined) return Number(reading[symbol.toUpperCase()])

    // 3. Nested metadata backup properties
    if (reading.metadata && reading.metadata[symbol] !== undefined) return Number(reading.metadata[symbol])

    return 0
  }

  // Helper to format date and time
  const formatDateTime = (reading) => {
    if (reading.reading_date && reading.reading_time) {
      // Format: DD-MM-YYYY HH:MM:SS
      return `${reading.reading_date} ${reading.reading_time}`
    }
    if (reading.arrived_at) {
      // Fallback to arrived_at if reading_date/time not available
      try {
        const date = new Date(reading.arrived_at)
        if (!isNaN(date.getTime())) {
          return date.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        }
      } catch (e) {
        return reading.arrived_at || '-'
      }
    }
    return '-'
  }

  // Reliable tracking condition for checking if all current visible rows are selected
  const isAllVisibleSelected = sortedReadings.length > 0 && sortedReadings.every(r => selectedReadingIds.has(r.id))

  const totalColumnsCount = 7 + READING_COLUMNS.length + 1 // Added 1 for Date/Time column at the end

  return (
    <div className="flex flex-col gap-3 w-full">
      
      {/* 1. PROFILE FILTER PANEL (COMPLETELY UNTOUCHED ORIGINALS) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest shrink-0 mr-1">
            PROFILE
          </span>
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
          {ORDERED_PROFILES.map(profile => (
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
        </div>
        <span className="text-[10px] text-slate-500 font-medium">
          ({sortedReadings.length} rows)
        </span>
      </div>

      {/* 2. LIVE READING MATRIX CONTAINER */}
      <div className="border border-slate-200 rounded bg-white shadow-sm p-4 text-slate-900 antialiased font-sans">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-xs font-bold text-slate-400 tracking-wider uppercase">LIVE READING RETRIEVAL</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {selectedReadingIds.size} of {sortedReadings.length} selected
            </span>
            <div className="flex items-center gap-1">
              <button onClick={selectAllReadings}
                className="px-2.5 h-6 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 rounded border border-slate-200 transition-colors">
                All
              </button>
              <button onClick={clearReadings}
                className="px-2.5 h-6 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 rounded border border-slate-200 transition-colors">
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Quick-Select Buttons */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">LAST</span>
          {[1, 2, 3, 4, 5, 6, 8, 10].map(n => {
            const isButtonActive = selectedReadingIds.size === n && 
              [...selectedReadingIds].every(id => sortedReadings.slice(0, n).some(r => r.id === id))

            return (
              <button key={n}
                onClick={() => handleSelectLastN(n)}
                disabled={sortedReadings.length < n}
                className={`h-6 w-9 rounded text-xs font-mono border font-bold transition-all disabled:opacity-20 ${
                  isButtonActive
                    ? 'bg-[#1a73ca] text-white border-[#1a73ca] shadow-sm shadow-[#1a73ca]/20'
                    : 'bg-slate-50 text-[#1a73ca] border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}>
                {n}
              </button>
            )
          })}
        </div>

        {/* FIXED CONTAINER: Added max-h-[440px] to limit viewport view exactly to ~10 rows vertically, scrollable internally */}
        <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-slate-200 rounded relative">
          <table className="w-full text-left border-collapse table-auto">
            {/* FIXED HEADER: Added sticky top-0 z-10 style so header stays pinned during scroll parameters */}
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider font-bold select-none border-b border-slate-300 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(203,213,225,1)]">
              <tr>
                <th className="p-2 w-10 text-center border-r border-slate-200 bg-slate-50">
                  <input type="checkbox"
                    checked={isAllVisibleSelected}
                    onChange={() => isAllVisibleSelected ? clearReadings() : selectAllReadings()}
                    className="w-3.5 h-3.5 cursor-pointer rounded accent-slate-700"
                  />
                </th>
                <th className="p-2 text-slate-700 border-r border-slate-200 whitespace-nowrap bg-slate-50">SAMPLE NO</th>
                
                {/* Dynamic Element Sequence Columns Loop */}
                {READING_COLUMNS.map(sym => (
                  <th key={sym} className="px-3 py-2 text-right text-slate-800 font-bold border-r border-slate-200 whitespace-nowrap bg-slate-50">
                    {sym} (%)
                  </th>
                ))}

                <th className="p-2 text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50">CUSTOMER</th>
                <th className="p-2 text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50">SAMPLE TYPE</th>
                <th className="p-2 text-right text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50">WEIGHT</th>
                <th className="p-2 text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50">PROFILE</th>
                <th className="p-2 text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50">FILE</th>
                {/* NEW: Date/Time Column at the end */}
                <th className="p-2 text-slate-700 whitespace-nowrap bg-slate-50 min-w-[140px]">DATE & TIME</th>
              </tr>
            </thead>
            
            <tbody className="text-xs divide-y divide-slate-200 bg-white">
              {sortedReadings.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnsCount} className="text-center py-12 text-slate-400 font-medium">
                    Waiting for real-time matrix stream updates...
                  </td>
                </tr>
              ) : (
                blockKeys.map(blockName => {
                  const blockReadings = groupedByBlock[blockName]
                  const isBlockAllSelected = blockReadings.every(r => selectedReadingIds.has(r.id))
                  
                  return (
                    <React.Fragment key={blockName}>
                      {/* Light Block Separator Header */}
                      <tr className="bg-slate-100/60 border-y border-slate-200 select-none">
                        <td className="p-1.5 text-center border-r border-slate-200">
                          <input 
                            type="checkbox" 
                            checked={isBlockAllSelected} 
                            onChange={() => toggleBlockSelection(blockReadings)}
                            className="w-3.5 h-3.5 cursor-pointer rounded accent-slate-700"
                          />
                        </td>
                        <td colSpan={totalColumnsCount - 1} className="px-3 py-1 font-bold text-slate-700 tracking-wider text-xs font-mono uppercase">
                          Block {blockName}
                        </td>
                      </tr>

                      {/* Focused Monochrome Data Table Row Listings */}
                      {blockReadings.map(r => {
                        const isSelected = selectedReadingIds.has(r.id)

                        return (
                          <tr key={r.id}
                            onClick={() => toggleReading(r.id)}
                            className={`transition-colors border-b border-slate-100 cursor-pointer ${
                              isSelected ? 'bg-slate-100/70 font-semibold' : 'hover:bg-slate-50/50'
                            }`}>
                            <td className="p-2 text-center border-r border-slate-200" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleReading(r.id)}
                                className="w-3.5 h-3.5 cursor-pointer rounded accent-slate-700" />
                            </td>
                            <td className="p-2 font-mono text-center text-slate-500 border-r border-slate-200">
                              {r.entry_index ?? '-'}
                            </td>

                            {/* Crisp, Balanced Monospaced Numeric Data Nodes */}
                            {READING_COLUMNS.map(sym => (
                              <td key={sym} className="px-3 py-2 text-right font-mono text-sm font-medium tracking-wide text-slate-900 border-r border-slate-200">
                                {getElementValue(r, sym).toFixed(3)}
                              </td>
                            ))}

                            <td className="p-2 truncate max-w-[120px] text-slate-600 border-r border-slate-200" title={r.customer_name}>
                              {r.customer_name || '-'}
                            </td>
                            <td className="p-2 text-slate-600 border-r border-slate-200 whitespace-nowrap">{r.sample_type || '-'}</td>
                            <td className="p-2 text-right font-mono text-slate-600 border-r border-slate-200">
                              {r.weight != null ? r.weight.toFixed(3) : '-'}
                            </td>
                            <td className="p-2 text-slate-600 font-mono text-xs border-r border-slate-200 uppercase tracking-wide">
                              {r.profile || '-'}
                            </td>
                            <td className="p-2 text-slate-400 font-mono truncate max-w-[120px] border-r border-slate-200" title={r.file_path}>
                              {r.file_path ? r.file_path.split(/[/\\]/).pop() : '-'}
                            </td>
                            {/* NEW: Date/Time cell at the end */}
                            <td className="p-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                              {formatDateTime(r)}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })
              )}

              {/* 3. RUNTIME ACTIVE CALCULATED SELECTION AVERAGES ROW FOOTER */}
              {selectedReadingIds.size > 0 && (() => {
                const subset = sortedReadings.filter(r => selectedReadingIds.has(r.id))
                const sums = {}, counts = {}
                
                subset.forEach(r => {
                  READING_COLUMNS.forEach(sym => {
                    const val = getElementValue(r, sym)
                    sums[sym] = (sums[sym] || 0) + val
                    counts[sym] = (counts[sym] || 0) + 1
                  })
                })
                
                return (
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold select-none sticky bottom-0 z-10 shadow-[0_-1px_0_0_rgba(203,213,225,1)]">
                    <td className="p-2 border-r border-slate-200 bg-slate-50" />
                    <td className="p-2 text-slate-800 text-[10px] uppercase tracking-wider font-bold text-center border-r border-slate-200 bg-slate-50">
                      AVG ({selectedReadingIds.size})
                    </td>
                    
                    {/* Aligned Summary Calculations Column Outputs */}
                    {READING_COLUMNS.map(sym => {
                      const avg = sums[sym] != null ? sums[sym] / counts[sym] : 0
                      return (
                        <td key={sym} className="px-3 py-2 text-right font-mono text-sm font-bold text-slate-950 border-r border-slate-200 bg-slate-50">
                          {avg.toFixed(3)}
                        </td>
                      )
                    })}

                    <td colSpan="5" className="bg-slate-50" />
                    {/* Empty cell for Date/Time column in average row */}
                    <td className="bg-slate-50" />
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}