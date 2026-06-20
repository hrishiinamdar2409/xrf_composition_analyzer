import DeltaBadge from './DeltaBadge'
import { formatSigned } from '../../utils/readingsUtils'

export default function ActionBar({
  selectedReadingIds,
  readings,
  changedDeltaRows,
  canSave,
  saving,
  canPrint,
  printing,
  handleSave,
  handlePrint,
  handleReset,
  formErrors,
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto whitespace-nowrap pr-2">
          <span className="text-xs font-semibold text-slate-400 shrink-0">
            {selectedReadingIds.size} readings
          </span>
          {changedDeltaRows.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {changedDeltaRows.slice(0, 3).map((row, idx) => (
                <DeltaBadge 
                  key={idx}
                  delta={row.delta}
                  label={`${row.sym}`}
                />
              ))}
              {changedDeltaRows.length > 3 && (
                <span className="text-xs text-slate-500">+{changedDeltaRows.length - 3} more</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="h-8 px-3 bg-[#1a73ca] hover:bg-[#1a73ca] disabled:opacity-40 text-white rounded-md font-semibold text-xs shadow transition-colors"
          >
            {saving ? '💾 SAVING...' : '💾 SAVE'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!canPrint || printing || saving}
            className="h-8 px-3 bg-[#1a73ca] hover:bg-[#1a73ca] disabled:opacity-40 text-white border border-[#1a73ca] rounded-md font-semibold text-xs shadow transition-colors"
          >
            {printing ? '🖨 PRINTING...' : '🖨 PRINT'}
          </button>
          <button
            onClick={handleReset}
            className="h-8 px-3 bg-[#1a73ca] hover:bg-[#1a73ca] text-white rounded-md font-semibold text-xs shadow transition-colors"
          >
            ↺ RESET
          </button>
        </div>
      </div>
      {(formErrors.general || formErrors.readingIds || formErrors.composition || formErrors.primaryValue || formErrors.elementSum) && (
        <div className="mt-2 rounded-md border border-red-600/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
          {formErrors.general && <div>{formErrors.general}</div>}
          {formErrors.readingIds && <div>{formErrors.readingIds}</div>}
          {formErrors.composition && <div>{formErrors.composition}</div>}
          {formErrors.primaryValue && <div>{formErrors.primaryValue}</div>}
          {formErrors.elementSum && <div>{formErrors.elementSum}</div>}
        </div>
      )}
    </div>
  )
}