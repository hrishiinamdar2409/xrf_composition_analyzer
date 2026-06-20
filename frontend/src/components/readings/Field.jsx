export default function Field({ label, required = false, helper, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-800">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {helper && <span className="text-[11px] text-slate-500">{helper}</span>}
    </div>
  )
}