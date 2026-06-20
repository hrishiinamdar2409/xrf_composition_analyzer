import { ENTRY_MODE } from '../../constants/readingsConstants'

export default function EntryModeSelector({ entryMode, setEntryMode }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-3 mb-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Entry Mode</p>
      <div className="flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-200">
          <input
            type="radio"
            name="entryMode"
            checked={entryMode === ENTRY_MODE.SINGLE}
            onChange={() => setEntryMode(ENTRY_MODE.SINGLE)}
            className="accent-amber-500 w-3.5 h-3.5"
          />
          1 Customer 1 Sample
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-200">
          <input
            type="radio"
            name="entryMode"
            checked={entryMode === ENTRY_MODE.MULTI}
            onChange={() => setEntryMode(ENTRY_MODE.MULTI)}
            className="accent-amber-500 w-3.5 h-3.5"
          />
          1 Customer Multiple Samples
        </label>
      </div>
    </div>
  )
}