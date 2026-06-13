import { useState, useEffect, useMemo, useCallback } from 'react'
import toast, { Toaster } from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const PIN_STORAGE_KEY = 'configPin'
const API = {
  settings: '/api/settings',
  printers: '/api/settings/printers',
  browse: '/api/settings/browse-exp',
}

// ─── Small presentational helpers ──────────────────────────────────────────────
function StatusPill({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger:  'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

function SectionCard({ title, description, children, aside }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  )
}

function SummaryRow({ label, value, mono = false, missing = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm text-right ${missing ? 'text-amber-600 italic' : 'text-slate-700'} ${mono ? 'font-mono break-all' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(null)
  const [printers, setPrinters] = useState([])

  const [pinInput, setPinInput] = useState('')
  const [configPin, setConfigPin] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const authHeaders = useMemo(() => (configPin ? { 'x-config-pin': configPin } : {}), [configPin])

  const isDirty = useMemo(() => {
    if (!settings || !draft) return false
    return settings.expFilePath !== draft.expFilePath || settings.printerName !== draft.printerName
  }, [settings, draft])

  const loadProtectedData = useCallback(async (pin) => {
    setLoading(true)
    try {
      const sRes = await fetch(API.settings, { headers: { 'x-config-pin': pin } })
      if (!sRes.ok) throw new Error('Unauthorized')
      const sBody = await sRes.json()
      setSettings(sBody)
      setDraft(sBody)

      const pRes = await fetch(API.printers, { headers: { 'x-config-pin': pin } })
      const pBody = await pRes.json().catch(() => ({}))
      setPrinters(Array.isArray(pBody?.printers) ? pBody.printers : [])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshPrinters = async () => {
    if (!configPin) return
    try {
      const pRes = await fetch(API.printers, { headers: { 'x-config-pin': configPin } })
      const pBody = await pRes.json().catch(() => ({}))
      const printerList = Array.isArray(pBody?.printers) ? pBody.printers : []
      setPrinters(printerList)
      toast.success(`Found ${printerList.length} printer${printerList.length === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error('Failed to refresh printers')
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem(PIN_STORAGE_KEY) || ''
    if (cached) setConfigPin(cached)
  }, [])

  useEffect(() => {
    if (!configPin) return
    loadProtectedData(configPin).catch(() => {
      sessionStorage.removeItem(PIN_STORAGE_KEY)
      setConfigPin('')
      setSettings(null)
      setDraft(null)
      setIsEditing(false)
    })
  }, [configPin, loadProtectedData])

  const update = (key, val) => setDraft(s => ({ ...s, [key]: val }))

  const clearError = (key) => setErrors(prev => {
    if (!prev[key]) return prev
    const next = { ...prev }
    delete next[key]
    return next
  })

  const mapServerErrors = (body) => {
    if (!body || !Array.isArray(body.errors)) return {}
    return body.errors.reduce((acc, e) => {
      if (e?.field) acc[e.field] = e.message || 'Invalid value.'
      return acc
    }, {})
  }

  const validate = () => {
    const next = {}
    const exp = String(draft?.expFilePath || '').trim()
    const printer = String(draft?.printerName || '').trim()

    if (!/^[a-zA-Z]:\\/.test(exp)) next.expFilePath = 'Use an absolute Windows path (e.g. C:\\FischerExport\\results.exp).'
    else if (!exp.toLowerCase().endsWith('.exp')) next.expFilePath = 'Export file must end with .exp'
    else if (exp.length > 260) next.expFilePath = 'Path is too long (max 260 characters).'

    if (!printer) next.printerName = 'Please select a printer.'
    else if (printer.length > 120) next.printerName = 'Printer name is too long (max 120).'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const enterEdit = () => {
    setDraft(settings)
    setErrors({})
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraft(settings)
    setErrors({})
    setIsEditing(false)
  }

  const save = async () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields')
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch(API.settings, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(draft),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const mapped = mapServerErrors(body)
        if (Object.keys(mapped).length) setErrors(prev => ({ ...prev, ...mapped }))
        throw new Error(body?.error || 'Could not save configuration.')
      }
      setSettings(body)
      setDraft(body)
      setIsEditing(false)
      toast.success('Configuration saved')
    } catch (err) {
      toast.error(err.message || 'Could not save configuration')
    } finally {
      setSaving(false)
    }
  }

  const browseExpPath = async () => {
    console.log('Browse button clicked')
    
    if (!isEditing) {
      console.log('Not in edit mode, enabling edit mode first')
      setIsEditing(true)
    }
    
    setBrowsing(true)
    toast.loading('Opening file browser...', { id: 'browse' })
    
    try {
      const currentPath = draft?.expFilePath || ''
      console.log('Current path:', currentPath)
      console.log('Auth headers:', authHeaders)
      
      const response = await fetch(API.browse, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          ...authHeaders 
        },
        body: JSON.stringify({ currentPath }),
      })
      
      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        throw new Error(`Server responded with ${response.status}: ${errorText}`)
      }
      
      const data = await response.json()
      console.log('Response data:', data)
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      if (!data.cancelled && data.path) {
        console.log('Selected path:', data.path)
        update('expFilePath', data.path)
        clearError('expFilePath')
        toast.success('File path selected', { id: 'browse' })
      } else if (data.cancelled) {
        console.log('User cancelled browsing')
        toast('Selection cancelled', { id: 'browse', icon: '📁' })
      } else {
        console.log('No path returned')
        toast.error('No file selected', { id: 'browse' })
      }
    } catch (err) {
      console.error('Browse error:', err)
      toast.error(err.message || 'Could not open file browser', { id: 'browse' })
    } finally {
      setBrowsing(false)
    }
  }

  const unlock = async () => {
    const pin = pinInput.trim()
    if (!pin) { 
      setUnlockError('Enter the configuration PIN.')
      return 
    }
    
    setUnlocking(true)
    setUnlockError('')
    try {
      await loadProtectedData(pin)
      setConfigPin(pin)
      sessionStorage.setItem(PIN_STORAGE_KEY, pin)
      setPinInput('')
      toast.success('Configuration unlocked')
    } catch {
      setUnlockError('Invalid PIN. Configuration is restricted.')
      toast.error('Invalid PIN')
    } finally {
      setUnlocking(false)
    }
  }

  const lock = () => {
    sessionStorage.removeItem(PIN_STORAGE_KEY)
    setConfigPin('')
    setSettings(null)
    setDraft(null)
    setIsEditing(false)
    setPrinters([])
    setErrors({})
    toast.success('Configuration locked')
  }

  // ── Locked / unlock screen ────────────────────────────────────────────────
  if (!configPin || !settings || !draft) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Toaster position="top-right" />
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
              <span aria-hidden>🔒</span> Restricted Area
            </div>
            <h1 className="mt-1 text-lg font-bold">Configuration Access</h1>
            <p className="mt-1 text-xs text-slate-300">Admin only. Enter the configuration PIN to manage system settings.</p>
          </div>
          <form
            className="px-6 py-5 space-y-4"
            onSubmit={e => { e.preventDefault(); unlock() }}
          >
            <div>
              <label htmlFor="config-pin" className="text-xs font-semibold text-slate-600">Configuration PIN</label>
              <input
                id="config-pin"
                type="password"
                inputMode="numeric"
                autoFocus
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setUnlockError('') }}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                placeholder="••••"
                aria-invalid={Boolean(unlockError)}
              />
              {unlockError && <p className="mt-1 text-xs text-red-600">{unlockError}</p>}
            </div>
            <button
              type="submit"
              disabled={unlocking}
              className="w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-50 transition-colors"
            >
              {unlocking ? 'Verifying…' : 'Unlock Configuration'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const printerMissing = Boolean(draft.printerName) && !printers.includes(draft.printerName)

  // ── Unlocked configuration screen ─────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      <Toaster position="top-right" />
      
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">System Configuration</h1>
          <p className="text-xs text-slate-500">Manage the WinFTM export source and the print destination.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone="success">Unlocked</StatusPill>
          <button
            onClick={lock}
            className="rounded-md border border-[#1a73ca] px-3 py-1.5 text-xs font-semibold text-[#1a73ca] hover:bg-[#e8f1fb] transition-colors"
          >
            Lock
          </button>
        </div>
      </div>

      {/* Current configuration summary */}
      <SectionCard
        title="Current Configuration"
        description="The values currently in use by the system."
        aside={
          <div className="flex items-center gap-2">
            {isEditing
              ? <StatusPill tone="warning">Editing</StatusPill>
              : <StatusPill tone="neutral">View only</StatusPill>}
          </div>
        }
      >
        <div className="divide-y divide-slate-100">
          <SummaryRow label="Export File" value={settings.expFilePath || 'Not set'} mono missing={!settings.expFilePath} />
          <SummaryRow label="Printer" value={settings.printerName || 'Not selected'} missing={!settings.printerName} />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isEditing ? (
            <button
              onClick={enterEdit}
              className="rounded-md bg-[#1a73ca] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a73ca] transition-colors"
            >
              Edit Configuration
            </button>
          ) : (
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-md border border-[#1a73ca] px-4 py-2 text-sm font-semibold text-[#1a73ca] hover:bg-[#e8f1fb] disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => loadProtectedData(configPin)}
            disabled={loading || saving}
            className="rounded-md border border-[#1a73ca] px-4 py-2 text-sm font-semibold text-[#1a73ca] hover:bg-[#e8f1fb] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </SectionCard>

      {/* Export file */}
      <SectionCard
        title="WinFTM Export File"
        description="Path the system watches for new measurement readings."
      >
        <div>
          <label htmlFor="exp-path" className="text-xs font-semibold text-slate-600">Path to .exp export file</label>
          <div className="mt-1 flex items-stretch gap-2">
            <input
              id="exp-path"
              type="text"
              value={draft.expFilePath || ''}
              onChange={e => { update('expFilePath', e.target.value); clearError('expFilePath') }}
              disabled={!isEditing}
              aria-invalid={Boolean(errors.expFilePath)}
              placeholder="C:\FischerExport\results.exp"
              className={`block w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-colors ${
                errors.expFilePath
                  ? 'border-red-300 focus:ring-red-300'
                  : 'border-slate-300 focus:ring-[#1a73ca] focus:border-[#1a73ca]'
              } disabled:bg-slate-50 disabled:text-slate-500`}
            />
            <button
              type="button"
              onClick={browseExpPath}
              disabled={browsing || saving}
              className="shrink-0 rounded-md bg-[#1a73ca] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a73ca] disabled:opacity-50 transition-colors"
            >
              {browsing ? 'Opening…' : 'Browse'}
            </button>
          </div>
          {errors.expFilePath
            ? <p className="mt-1 text-xs text-red-600">{errors.expFilePath}</p>
            : <p className="mt-1 text-xs text-slate-400">Must match WinFTM's Online Export path. Example: C:\FischerExport\results.exp</p>}
        </div>
      </SectionCard>

      {/* Printer */}
      <SectionCard
        title="Print Destination"
        description="Printer used when the Print button sends a report."
        aside={
          isEditing && (
            <button
              onClick={refreshPrinters}
              disabled={loading}
              className="text-xs font-semibold text-[#1a73ca] hover:text-[#1a73ca] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading…' : 'Reload printers'}
            </button>
          )
        }
      >
        <div>
          <label htmlFor="printer-name" className="text-xs font-semibold text-slate-600">Select printer</label>
          <select
            id="printer-name"
            value={draft.printerName || ''}
            onChange={e => { update('printerName', e.target.value); clearError('printerName') }}
            disabled={!isEditing}
            aria-invalid={Boolean(errors.printerName)}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 transition-colors ${
              errors.printerName
                ? 'border-red-300 focus:ring-red-300'
                : 'border-slate-300 focus:ring-gold-400 focus:border-gold-400'
            } disabled:bg-slate-50 disabled:text-slate-500`}
          >
            <option value="">Select printer…</option>
            {printerMissing && (
              <option value={draft.printerName}>{draft.printerName} (saved · currently offline)</option>
            )}
            {printers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>

          {errors.printerName && <p className="mt-1 text-xs text-red-600">{errors.printerName}</p>}
          {!errors.printerName && printers.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No printers detected. Check Windows printers, then click "Reload printers".</p>
          )}
          {!errors.printerName && printerMissing && (
            <p className="mt-1 text-xs text-amber-600">The saved printer is not currently available on this machine.</p>
          )}
          {!errors.printerName && printers.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">{printers.length} printer{printers.length === 1 ? '' : 's'} detected.</p>
          )}
        </div>
      </SectionCard>

      {/* Sticky action bar (edit mode) */}
      {isEditing && (
        <div className="sticky bottom-3 z-10">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-xs text-slate-500">
              {isDirty ? 'You have unsaved changes.' : 'No changes yet.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-md border border-[#1a73ca] px-4 py-2 text-sm font-semibold text-[#1a73ca] hover:bg-[#e8f1fb] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !isDirty}
                className="rounded-md bg-[#1a73ca] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a73ca] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}