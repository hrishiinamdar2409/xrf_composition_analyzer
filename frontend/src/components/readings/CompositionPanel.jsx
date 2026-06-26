import { useState } from 'react'
import {
  INCREMENT_STEPS,
  DECREMENT_STEPS,
  ELEMENT_NAMES,
  NON_EDITABLE_ELEMENTS,
  POWDER_ELEMENTS,
  ALL_ELEMENT_GROUPS
} from '../../constants/readingsConstants'
import { formatSigned, deltaTone, nameToSymbolMap } from '../../utils/readingsUtils'

export default function CompositionPanel({
  sampleCat,
  primKey,
  displayPrim,
  elementSum,
  primaryDeltaRow,
  primaryValue,
  setPrimaryValue,
  elementValues,
  setElementValues,
  rebalanceCu,
  clearDrafts,
  primaryDraft,
  setPrimaryDraft,
  elementDrafts,
  setElementDrafts,
  handleElementChange
}) {
  const nameToSym = nameToSymbolMap()
  const [localPrimaryDraft, setLocalPrimaryDraft] = useState(primaryDraft)

  const applyStep = (step) => {
    clearDrafts()
    const currentPrim = primaryValue ?? elementValues[primKey] ?? 0
    const newPrim = parseFloat(Math.max(0, Math.min(100, currentPrim + step.delta)).toFixed(3))
    setPrimaryValue(newPrim)
    setElementValues(prev => rebalanceCu(newPrim, prev))
  }

  // Filter out the primary element from ALL_ELEMENT_GROUPS
  const primaryElementName = ELEMENT_NAMES[primKey] || primKey
  const filteredElementGroups = ALL_ELEMENT_GROUPS.map(group =>
    group.filter(name => {
      if (name === primaryElementName) return false
      const sym = nameToSym[name] || name
      if (sym === primKey) return false
      return true
    })
  ).filter(group => group.length > 0)

  // Granular decimal formatters
  const formatTo3Decimals = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.000'
    return Number(val).toFixed(3)
  }

  const formatTo2Decimals = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00'
    return Number(val).toFixed(2)
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3">COMPOSITION CONTROL PANEL</p>

      {/* 3 VALUE BOXES + BUTTONS in one row */}
      <div className="flex items-center gap-3">
        {/* Primary element box */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${
            primKey === 'Au' ? 'text-amber-700' : primKey === 'Ag' ? 'text-slate-400' : 'text-[#1a73ca]'
          }`}>
            {ELEMENT_NAMES[primKey] || primKey}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={localPrimaryDraft ?? formatTo2Decimals(displayPrim)}
            onChange={e => {
              const raw = e.target.value
              setLocalPrimaryDraft(raw)
              const val = parseFloat(raw)
              if (!isNaN(val)) {
                const newPrim = parseFloat(Math.max(0, Math.min(100, val)).toFixed(3))
                setPrimaryValue(newPrim)
                setElementValues(prev => rebalanceCu(newPrim, prev))
              }
            }}
            onBlur={() => {
              setLocalPrimaryDraft(null)
              setPrimaryDraft(null)
            }}
            className={`w-24 h-10 rounded-lg border-2 text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 ${
              primKey === 'Au' ? 'bg-amber-50 border-amber-500 text-amber-700 focus:ring-amber-400' :
              primKey === 'Ag' ? 'bg-slate-100 border-slate-400 text-slate-700 focus:ring-slate-400' :
              'bg-[#1a73ca] border-[#1a73ca] text-white focus:ring-[#1a73ca]'
            }`}
          />
          <span className={`text-[9px] font-semibold ${
            primKey === 'Au' ? 'text-amber-600' : primKey === 'Ag' ? 'text-slate-500' : 'text-[#1a73ca]'
          }`}>
            {primKey} · % Pure
          </span>
        </div>

        {/* Karat Box */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Karat</span>
          <div className="w-24 h-10 rounded-lg bg-slate-50 border-2 border-slate-300 flex items-center justify-center select-none pointer-events-none">
            <span className="text-lg font-semibold text-slate-700 tabular-nums">
              {formatTo2Decimals(elementValues['x1'] ?? 0)}
            </span>
          </div>
          <span className="text-[9px] text-slate-500 font-semibold">Karat (X1)</span>
        </div>

        {/* Total Sum box */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sum Total</span>
          <div className={`w-24 h-10 rounded-lg border-2 flex items-center justify-center select-none pointer-events-none ${
            Math.abs(elementSum - 100) < 0.01 ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
          }`}>
            <span className={`text-lg font-semibold tabular-nums ${
              Math.abs(elementSum - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'
            }`}>{formatTo2Decimals(elementSum)}</span>
          </div>
          <span className={`text-[9px] font-semibold ${
            Math.abs(elementSum - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'
          }`}>
            {Math.abs(elementSum - 100) < 0.01 ? '✓ 100%' : `${(elementSum - 100) > 0 ? '+' : ''}${formatTo2Decimals(elementSum - 100)} off`}
          </span>
        </div>

        {/* Delta Summary box */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Δ {primKey}</span>
          <div className={`w-24 h-10 rounded-lg border-2 flex items-center justify-center select-none pointer-events-none ${
            primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high' ? 'bg-red-50 border-red-300' :
            primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid' ? 'bg-amber-50 border-amber-300' :
            'bg-slate-50 border-slate-300'
          }`}>
            <span className={`text-lg font-semibold tabular-nums ${
              primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high' ? 'text-red-700' :
              primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid' ? 'text-amber-700' :
              'text-slate-700'
            }`}>
              {primaryDeltaRow ? Number(primaryDeltaRow.delta).toFixed(2) : '0.00'}
            </span>
          </div>
          <span className={`text-[9px] font-semibold ${
            primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high' ? 'text-red-700' :
            primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid' ? 'text-amber-700' :
            'text-slate-500'
          }`}>Deviation</span>
        </div>

        {/* +/- buttons */}
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-1.5">
            {INCREMENT_STEPS.map(step => (
              <button
                key={step.label}
                onClick={() => applyStep(step)}
                title={`+${step.delta}%`}
                className="flex-1 h-8 rounded-md text-xs font-semibold border border-slate-400 bg-white text-slate-900 hover:bg-slate-100"
              >
                {step.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {DECREMENT_STEPS.map(step => (
              <button
                key={step.label}
                onClick={() => applyStep(step)}
                title={`${step.delta}%`}
                className="flex-1 h-8 rounded-md text-xs font-semibold border border-slate-400 bg-white text-slate-900 hover:bg-slate-100"
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ALL ELEMENTS Grid */}
      <div className="mt-3 border-t border-slate-700 pt-3">
        <p className="text-sm font-semibold text-slate-700 mb-2">ALL ELEMENTS</p>
        {filteredElementGroups.every(group => group.length === 0) ? (
          <p className="text-xs text-slate-500 italic">No other elements available</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {filteredElementGroups.map((group, gi) => (
              <div key={gi} className="flex flex-col gap-1">
                {group.map(fullName => {
                  const sym = nameToSym[fullName] || fullName
                  const val = elementValues[sym] ?? 0
                  const locked = NON_EDITABLE_ELEMENTS.has(sym) || sym === primKey
                  const isPowder = POWDER_ELEMENTS.has(sym)
                  const isRed = val < 0 || (isPowder && val > 0)

                  return (
                    <div key={sym} className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold w-28 shrink-0 text-slate-700">
                        {fullName} ({sym.toUpperCase()})
                      </span>
                      <input
                        type="number"
                        step="0.001"
                        readOnly={locked}
                        value={elementDrafts[sym] ?? formatTo3Decimals(val)}
                        onChange={e => {
                          if (locked) return
                          const raw = e.target.value
                          setElementDrafts(prev => ({ ...prev, [sym]: raw }))
                          handleElementChange(sym, raw)
                        }}
                        onBlur={() => {
                          setElementDrafts(prev => {
                            const next = { ...prev }
                            delete next[sym]
                            return next
                          })
                        }}
                        className={`flex-1 min-w-0 text-center border rounded-md px-1 py-1 text-sm font-medium tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
                          isRed
                            ? 'border-red-700 bg-red-900/30 text-red-400'
                            : 'border-slate-600 bg-slate-700 text-slate-200 hover:border-amber-500'
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}