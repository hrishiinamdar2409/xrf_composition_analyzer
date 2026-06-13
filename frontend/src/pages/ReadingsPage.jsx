import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { useWebSocket } from '../hooks/useWebSocket'

// ─── Constants ───────────────────────────────────────────────────────────────

const POWDER_ELEMENTS = new Set(['Ir', 'Os', 'Ru', 'Re', 'W'])
const NON_EDITABLE_ELEMENTS = new Set(['Cu'])
const PRIMARY_ELEMENT = { Gold: 'Au', Silver: 'Ag', Platinum: 'Pt' }
const ELEMENT_SYMBOL_RX = /^[A-Z][a-z]?$/

const INCREMENT_STEPS = [
  { label: '+0.05', delta:  0.05 },
  { label: '+0.1',  delta:  0.1  },
  { label: '+0.2',  delta:  0.2  },
  { label: '+0.3',  delta:  0.3  },
  { label: 'UR',    snap: 'upper_range' },
]
const DECREMENT_STEPS = [
  { label: '-0.05', delta: -0.05 },
  { label: '-0.1',  delta: -0.1  },
  { label: '-0.2',  delta: -0.2  },
  { label: '-0.3',  delta: -0.3  },
  { label: 'UL',    snap: 'upper_limit' },
]

const UPPER_RANGE = { Gold: 99.9,  Silver: 99.9,  Platinum: 99.9  }
const UPPER_LIMIT = { Gold: 91.67, Silver: 92.5,  Platinum: 95.0  }
const ENTRY_MODE = {
  SINGLE: 'single',
  MULTI: 'multi',
}

// Full friendly names for every element the machine can return
const ELEMENT_NAMES = {
  Au: 'Gold',      Ag: 'Silver',    Cu: 'Copper',    Zn: 'Zinc',
  Cd: 'Cadmium',   Ni: 'Nickel',    Bi: 'Bismuth',   As: 'Arsenic',
  Ir: 'Iridium',   Ru: 'Ruthenium', Os: 'Osmium',    Re: 'Rhenium',
  Fe: 'Iron',      Pd: 'Palladium', Sn: 'Tin',       Pb: 'Lead',
  W:  'Tungsten',  Pt: 'Platinum',  Co: 'Cobalt',    Rh: 'Rhodium',
  Cr: 'Chromium',  Mn: 'Manganese', Ti: 'Titanium',  In: 'Indium',
  Sb: 'Antimony',  Te: 'Tellurium', Se: 'Selenium',  Mo: 'Molybdenum',
  Nb: 'Niobium',   Hf: 'Hafnium',   Ta: 'Tantalum',  V:  'Vanadium',
}

// Fixed ordered columns for the readings table (Gold shown separately in panel)
const READING_COLUMNS = [
  'Au',
  'Ag','Cu','Zn','Cd','Ni','In',
  'Fe','Sn','Ir','Ru','Os','Re',
  'Co','Pb','Cr','Pt','Pd','Rh',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, required = false, helper, children }) {
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

const INPUT = 'w-full border border-slate-600 rounded-lg px-2.5 py-1.5 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white bg-slate-700 text-slate-100 placeholder-slate-400'

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReadingsPage() {
  const navigate = useNavigate()

  const formatCompact = (num) => {
    const n = Number(num)
    if (!Number.isFinite(n)) return '0'
    if (Math.abs(n) < 0.0005) return '0'
    return n.toFixed(3)
  }

  const [customerName, setCustomerName] = useState('')
  const [mobile,       setMobile]       = useState('')
  const [srNo,         setSrNo]         = useState('') // Auto-generated, display only
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [sampleType,   setSampleType]   = useState('Silver Sample')
  const [weight,       setWeight]       = useState('')
  const [sampleCat,    setSampleCat]    = useState('Gold')
  const [entryMode,    setEntryMode]    = useState(ENTRY_MODE.SINGLE)
  const [formErrors,   setFormErrors]   = useState({})

  const [readings,          setReadings]          = useState([])
  const [selectedReadingIds, setSelectedReadingIds] = useState(new Set())
  const [elementValues,      setElementValues]      = useState({})
  const [machineBaseline,    setMachineBaseline]    = useState({})
  const [primaryValue,       setPrimaryValue]       = useState(null)
  const [primaryDraft,       setPrimaryDraft]       = useState(null)
  const [elementDrafts,      setElementDrafts]      = useState({})
  const [saving,             setSaving]             = useState(false)
  const [printing,           setPrinting]           = useState(false)
  const [editingSampleId,    setEditingSampleId]    = useState(null)
  const isLoadingEditRef = useRef(false)
  const nextItemTimerRef = useRef(null)

  const clearDrafts = useCallback(() => {
    setPrimaryDraft(null)
    setElementDrafts({})
  }, [])

  const formatSigned = useCallback((num) => {
    const n = Number(num)
    if (!Number.isFinite(n)) return '0.000'
    const fixed = n.toFixed(3)
    return n > 0 ? `+${fixed}` : fixed
  }, [])

  const deltaTone = useCallback((delta) => {
    const abs = Math.abs(Number(delta) || 0)
    if (abs >= 0.3) return 'high'
    if (abs >= 0.05) return 'mid'
    return 'low'
  }, [])

  const fetchNextSrNo = useCallback(() => {
    fetch('/api/samples/next-sr')
      .then(r => r.json())
      .then(data => {
        if (data && data.nextSrNo) {
          setSrNo(data.nextSrNo)
        }
      })
      .catch(err => {
        console.error('[fetchNextSrNo] Failed to fetch next Sr.No:', err)
      })
  }, [])

  const setFieldError = useCallback((field, message) => {
    setFormErrors(prev => ({ ...prev, [field]: message }))
  }, [])

  const clearFieldError = useCallback((field) => {
    setFormErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearAllErrors = useCallback(() => {
    setFormErrors({})
  }, [])

  const isValidIsoDate = useCallback((value) => {
    if (!value || typeof value !== 'string') return false
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const d = new Date(`${value}T00:00:00`)
    return !Number.isNaN(d.getTime())
  }, [])

  // Load sample data if editing an existing sample
  useEffect(() => {
    const editingData = sessionStorage.getItem('editingSample')
    if (editingData) {
      isLoadingEditRef.current = true
      try {
        const sample = JSON.parse(editingData)
        setEditingSampleId(sample.id)
        setCustomerName(sample.customer_name || '')
        setSrNo(sample.job_ref || '') // Display Sr.No (read-only)
        setDate(sample.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10))

        let parsedCat = 'Gold' // default

        // Prefer backend-parsed fields (from DB) to avoid brittle client parsing.
        const parsed = sample.parsedItemDesc || {}
        if (parsed.sampleCat && ['Gold', 'Silver', 'Platinum'].includes(parsed.sampleCat)) {
          parsedCat = parsed.sampleCat
          setSampleCat(parsed.sampleCat)
        }
        if (parsed.sampleType) setSampleType(parsed.sampleType)
        if (parsed.weight != null) setWeight(String(parsed.weight))
        if (parsed.mobile) setMobile(parsed.mobile)

        // Fallback parse only when structured fields are unavailable.
        if (sample.item_desc && (!parsed.sampleCat || !parsed.sampleType || parsed.weight == null || !parsed.mobile)) {
          const parts = sample.item_desc.split('|').map(p => p.trim())
          
          // Extract category and type from first part
          if (parts[0]) {
            const catTypeMatch = parts[0].match(/^(\w+)\s+(.+)$/)
            if (catTypeMatch) {
              const cat = catTypeMatch[1]
              const type = catTypeMatch[2]
              if (['Gold', 'Silver', 'Platinum'].includes(cat)) {
                parsedCat = cat
                setSampleCat(cat)
              }
              setSampleType(type)
            }
          }
          
          // Extract weight from second part
          if (parts[1]) {
            const wtMatch = parts[1].match(/Wt:([0-9.]+)g/)
            if (wtMatch) setWeight(wtMatch[1])
          }
          
          // Sr.No is auto-generated by backend, no need to parse or store it
          
          // Extract mobile from fourth part
          if (parts[3] && !parsed.mobile) {
            const mobileStr = parts[3].trim()
            const cleanMobile = mobileStr.replace(/\D/g, '').slice(-15)
            setMobile(cleanMobile)
          }
        }

        // Load final results (manual adjustments) if available, otherwise use auto results
        let elemVals = {}
        
        if (sample.finalResults && sample.finalResults.length > 0) {
          // Use final results (expert-adjusted values)
          sample.finalResults.forEach(fr => {
            elemVals[fr.element] = fr.expert_value ?? fr.auto_value
          })
        } else if (sample.autoResults && sample.autoResults.length > 0) {
          // Fall back to auto results if no final results
          sample.autoResults.forEach(ar => {
            elemVals[ar.element] = ar.auto_value
          })
        }

        const baselineVals = {}
        if (sample.autoResults && sample.autoResults.length > 0) {
          sample.autoResults.forEach(ar => {
            baselineVals[ar.element] = ar.auto_value
          })
        }
        setMachineBaseline(baselineVals)
        
        if (Object.keys(elemVals).length > 0) {
          setElementValues(elemVals)
          // Set primary value using parsed category
          const primKey = PRIMARY_ELEMENT[parsedCat] || 'Au'
          if (elemVals[primKey] != null) {
            setPrimaryValue(elemVals[primKey])
          }
        }

        // Pre-select the readings that belong to this sample
        if (sample.readings) {
          const readingIds = new Set(sample.readings.map(r => r.id))
          setSelectedReadingIds(readingIds)
        }

        sessionStorage.removeItem('editingSample')
      } catch (e) {
        console.error('Failed to load editing sample:', e)
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/readings').then(r => r.json()).then(setReadings).catch(console.error)

    // Do not overwrite Sr.No when opening an existing entry in modify mode.
    if (!isLoadingEditRef.current) {
      fetchNextSrNo()
    }
  }, [fetchNextSrNo])

  useWebSocket(useCallback((msg) => {
    if (msg.type === 'NEW_READING') setReadings(prev => [msg.payload, ...prev])
  }, []))

  const primKey       = PRIMARY_ELEMENT[sampleCat] || 'Au'
  const displayPrim   = parseFloat((primaryValue ?? elementValues[primKey] ?? 0).toFixed(3))
  const impurity      = parseFloat(Math.max(0, 100 - displayPrim).toFixed(3))
  const elementSum    = parseFloat((
    displayPrim + Object.entries(elementValues).filter(([k]) => k !== primKey).reduce((s, [, v]) => s + (v || 0), 0)
  ).toFixed(3))
  const hasComposition = Object.keys(elementValues).length > 0
  const canSave = !saving && hasComposition && selectedReadingIds.size > 0
  const canPrint = !printing && !saving && hasComposition && selectedReadingIds.size > 0

  const machineDeltaRows = Object.keys(ELEMENT_NAMES).map((sym) => {
    const baseline = machineBaseline[sym] != null ? Number(machineBaseline[sym]) : 0
    const finalValue = Number(sym === primKey ? displayPrim : (elementValues[sym] ?? 0))
    const delta = Number((finalValue - baseline).toFixed(3))
    return { sym, baseline, finalValue, delta, absDelta: Math.abs(delta) }
  })
  const deltaBySymbol = Object.fromEntries(machineDeltaRows.map(row => [row.sym, row]))
  const changedDeltaRows = machineDeltaRows.filter(row => row.absDelta >= 0.001)
  const topDelta = changedDeltaRows.slice().sort((a, b) => b.absDelta - a.absDelta)[0] || null
  const primaryDeltaRow = machineDeltaRows.find(row => row.sym === primKey) || null

  const validateForm = useCallback(() => {
    const errors = {}

    if (!customerName.trim() || customerName.trim().length < 2 || customerName.trim().length > 120) {
      errors.customerName = 'Customer name must be 2-120 characters.'
    }

    if (!/^\d{10}$/.test(mobile)) {
      errors.mobile = 'Mobile number must be exactly 10 digits.'
    }

    if (!weight || Number(weight) <= 0) {
      errors.weight = 'Weight must be greater than 0.'
    }

    if (!date || !isValidIsoDate(date)) {
      errors.date = 'Date must be a valid YYYY-MM-DD value.'
    }

    if (!sampleType || sampleType.trim().length < 2) {
      errors.sampleType = 'Sample type is required.'
    }

    if (selectedReadingIds.size === 0) {
      errors.readingIds = 'Select at least one reading.'
    }

    if (!hasComposition) {
      errors.composition = 'Composition is empty. Select readings first.'
    }

    if (displayPrim < 0 || displayPrim > 100) {
      errors.primaryValue = `${primKey} must be between 0 and 100.`
    }

    if (Math.abs(elementSum - 100) > 0.05) {
      errors.elementSum = `Composition total must be close to 100. Current: ${formatCompact(elementSum)}`
    }

    for (const [symbol, raw] of Object.entries(elementValues || {})) {
      if (!ELEMENT_SYMBOL_RX.test(symbol)) {
        errors.composition = 'Found invalid element symbol in composition.'
        break
      }
      const val = Number(raw)
      if (!Number.isFinite(val)) {
        errors.composition = `${symbol} must be numeric.`
        break
      }
      if (val < 0) {
        errors.composition = `${symbol} cannot be negative.`
        break
      }
      if (POWDER_ELEMENTS.has(symbol) && val > 0) {
        errors.composition = `${symbol} should be 0 for this workflow.`
        break
      }
    }

    setFormErrors(errors)
    return { ok: Object.keys(errors).length === 0, errors }
  }, [
    customerName,
    mobile,
    weight,
    date,
    sampleType,
    selectedReadingIds,
    hasComposition,
    displayPrim,
    primKey,
    elementSum,
    elementValues,
    formatCompact,
    isValidIsoDate,
  ])

  const mapServerErrors = useCallback((body) => {
    if (!body || !Array.isArray(body.errors)) return {}
    const mapped = {}
    for (const e of body.errors) {
      const f = e?.field
      const msg = e?.message || 'Invalid value.'
      if (!f) continue
      if (f === 'readingIds') mapped.readingIds = msg
      else if (f === 'customerName') mapped.customerName = msg
      else if (f === 'mobile') mapped.mobile = msg
      else if (f === 'itemDesc') mapped.sampleType = msg
      else if (f === 'testDate') mapped.date = msg
      else if (f === 'id') mapped.general = msg
      else if (f.startsWith('expertValues.')) mapped.composition = msg
      else if (f === 'expertValues') mapped.composition = msg
      else mapped.general = msg
    }
    return mapped
  }, [])

  // ── Core balancing rule ─────────────────────────────────────────────────
  // Cu = 100 - newPrim - sum(all elements except primary and Cu)
  // Called any time any element or the primary value changes.
  const rebalanceCu = useCallback((newPrim, elValues) => {
    const sumOthers = Object.entries(elValues)
      .filter(([k]) => k !== 'Cu' && k !== primKey)
      .reduce((s, [, v]) => s + (v || 0), 0)
    return {
      ...elValues,
      Cu: parseFloat((100 - newPrim - sumOthers).toFixed(3)),
    }
  }, [primKey])

  const applyStep = (step) => {
    clearDrafts()
    const currentPrim = primaryValue ?? elementValues[primKey] ?? 0
    let newPrim
    if (step.snap === 'upper_range') {
      newPrim = UPPER_RANGE[sampleCat] ?? 99.9
    } else if (step.snap === 'upper_limit') {
      newPrim = UPPER_LIMIT[sampleCat] ?? 91.67
    } else {
      newPrim = parseFloat(Math.max(0, Math.min(100, currentPrim + step.delta)).toFixed(3))
    }
    setPrimaryValue(newPrim)
    setElementValues(prev => rebalanceCu(newPrim, prev))
  }

  const applyReadingsSelection = useCallback((readingIds) => {
    const subset = readings.filter(r => readingIds.has(r.id))
    clearDrafts()

    if (!subset.length) {
      setElementValues({})
      setMachineBaseline({})
      setPrimaryValue(null)
      return
    }

    const sums = {}, counts = {}
    subset.forEach(r => r.elements.forEach(el => {
      sums[el.name] = (sums[el.name] || 0) + (el.value || 0)
      counts[el.name] = (counts[el.name] || 0) + 1
    }))

    const avgs = {}
    Object.keys(sums).forEach(k => {
      avgs[k] = parseFloat((sums[k] / counts[k]).toFixed(3))
    })

    const newPrim = avgs[primKey] ?? 0
    const normalizedAvgs = rebalanceCu(newPrim, avgs)
    setPrimaryValue(newPrim)
    setElementValues(normalizedAvgs)
    setMachineBaseline(normalizedAvgs)
  }, [clearDrafts, primKey, readings, rebalanceCu])

  const toggleReading = (id) => {
    setSelectedReadingIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      applyReadingsSelection(next)
      return next
    })
  }

  const selectAllReadings = () => {
    const next = new Set(readings.map(r => r.id))
    setSelectedReadingIds(next)
    applyReadingsSelection(next)
  }

  const clearReadings = () => {
    const next = new Set()
    setSelectedReadingIds(next)
    applyReadingsSelection(next)
  }

  const prepareNextItem = useCallback(() => {
    isLoadingEditRef.current = false
    setSrNo('')
    setDate(new Date().toISOString().slice(0, 10))
    setSampleType('Silver Sample')
    setWeight('')
    setElementValues({})
    setMachineBaseline({})
    setPrimaryValue(null)
    clearDrafts()
    setSelectedReadingIds(new Set())
    setEditingSampleId(null)
    clearAllErrors()
    fetchNextSrNo()
  }, [clearAllErrors, clearDrafts, fetchNextSrNo])

  const prepareFreshEntry = useCallback(() => {
    isLoadingEditRef.current = false
    setCustomerName('')
    setMobile('')
    setSrNo('')
    setDate(new Date().toISOString().slice(0, 10))
    setWeight('')
    setSampleCat('Gold')
    setSampleType('Silver Sample')
    setElementValues({})
    setMachineBaseline({})
    setPrimaryValue(null)
    clearDrafts()
    setSelectedReadingIds(new Set())
    setEditingSampleId(null)
    clearAllErrors()
    fetchNextSrNo()
  }, [clearAllErrors, clearDrafts, fetchNextSrNo])

  useEffect(() => {
    return () => {
      if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current)
    }
  }, [])

  // When any non-primary, non-Cu element is manually edited → rebalance Cu
  const handleElementChange = (name, raw) => {
    if (NON_EDITABLE_ELEMENTS.has(name)) return // Cu is fixed
    if (name === primKey) return // primary managed via big box
    const val = parseFloat(raw)
    const safeVal = isNaN(val) ? 0 : val
    setElementValues(prev => {
      const updated = { ...prev, [name]: safeVal }
      return rebalanceCu(displayPrim, updated)
    })
  }

  const saveSampleToDb = async () => {
    const validation = validateForm()
    if (!validation.ok) return null

    const subset = readings.filter(r => selectedReadingIds.has(r.id))

    setSaving(true)
    try {
      const payload = {
        customerName: customerName.trim() || 'Unknown',
        itemDesc: `${sampleCat} ${sampleType} | Wt:${weight||'?'}g | ${mobile}`,
        testDate: date || null,
        readingIds: subset.map(r => r.id),
        composition: {
          primaryElement: primKey,
          primaryValue: displayPrim,
          elements: elementValues,
        },
      }

      console.log('[handleSave] Payload:', payload)

      let res, data
      let targetSampleId = editingSampleId

      if (editingSampleId) {
        // Update existing sample
        console.log('[handleSave] PATCH /api/samples/' + editingSampleId)
        res = await fetch(`/api/samples/${editingSampleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Create new sample
        console.log('[handleSave] POST /api/samples')
        res = await fetch('/api/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      console.log('[handleSave] Response status:', res.status)

      try {
        data = await res.json()
      } catch (_) {
        // Keep data as null and let unified error handling below decide message.
      }

      console.log('[handleSave] Response data:', data)

      if (!res.ok || !data?.id) {
        const mapped = mapServerErrors(data)
        if (Object.keys(mapped).length) {
          setFormErrors(prev => ({ ...prev, ...mapped }))
        }
        throw new Error(data?.error || 'Unable to save sample right now.')
      }

      targetSampleId = Number(data.id)

      // Display the auto-generated Sr.No to user
      if (data.srNo) {
        setSrNo(data.srNo)
      }

      // Save manual composition adjustments as final results
      const sampleId = targetSampleId
      const finalPayload = { ...elementValues }
      // Make sure to include the primary element with its adjusted value
      finalPayload[primKey] = displayPrim
      if (Object.keys(finalPayload).length > 0) {
        const deltaMeta = {
          primaryElement: primKey,
          primaryDelta: primaryDeltaRow?.delta ?? null,
          changedElements: changedDeltaRows.length,
          topDeltas: changedDeltaRows
            .slice()
            .sort((a, b) => b.absDelta - a.absDelta)
            .slice(0, 3)
            .map(row => ({
              element: row.sym,
              machine: row.baseline,
              final: row.finalValue,
              delta: row.delta,
            })),
        }
        console.log('[handleSave] Saving final results for sample', sampleId, finalPayload)
        const resultRes = await fetch(`/api/samples/${sampleId}/result`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expertValues: finalPayload, deltaMeta }),
        })
        const resultBody = await resultRes.json().catch(() => ({}))
        if (!resultRes.ok) {
          const mapped = mapServerErrors(resultBody)
          if (Object.keys(mapped).length) {
            setFormErrors(prev => ({ ...prev, ...mapped }))
          }
          throw new Error(resultBody?.detail || resultBody?.error || 'Could not save composition adjustments.')
        }
      }

      // Keep edit context anchored to this row so repeated save/print updates the same entry.
      setEditingSampleId(targetSampleId)

      return { sampleId, srNo: data.srNo, jobRef: data.jobRef }
    } catch (err) {
      console.error('[saveSampleToDb] Error:', err)
      setFieldError('general', err.message || 'Save failed. Please try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const saved = await saveSampleToDb()
    if (!saved?.sampleId) return
    
    const srNo = saved.srNo || saved.jobRef || saved.sampleId
    
    // Using react-hot-toast
    toast.success(`Saved Sr No ${srNo}`, {
      duration: 3000,
      position: 'top-right',
    })

    if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current)
    if (entryMode === ENTRY_MODE.MULTI) {
      nextItemTimerRef.current = setTimeout(() => {
        prepareNextItem()
      }, 1500)
      return
    }

    // Single mode must reset deterministically right after successful save.
    prepareFreshEntry()
  }

  const handlePrint = async () => {
    if (!canPrint) {
      setFieldError('readingIds', 'Nothing to print yet. Select at least one reading first.')
      return
    }

    if (printing || saving) return
    setPrinting(true)
    try {
      // Dashboard print must always use persisted data: save first, then print.
      const saved = await saveSampleToDb()
      if (!saved?.sampleId) return

      const res = await fetch(`/api/samples/${saved.sampleId}/report`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const mapped = mapServerErrors(body)
        if (Object.keys(mapped).length) {
          setFormErrors(prev => ({ ...prev, ...mapped }))
        }
        throw new Error(body?.detail || body?.error || 'Print failed')
      }

      const srNo = saved.srNo || saved.jobRef || saved.sampleId
      
      // Using react-hot-toast
      toast.success(`Printed Sr No ${srNo}${body?.printer ? ` (${body.printer})` : ''}`, {
        duration: 3000,
        position: 'top-right',
      })

      if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current)
      if (entryMode === ENTRY_MODE.MULTI) {
        nextItemTimerRef.current = setTimeout(() => {
          prepareNextItem()
        }, 1500)
      } else {
        // Single mode must reset deterministically right after successful print.
        prepareFreshEntry()
      }
    } catch (err) {
      console.error('[handlePrint] Error:', err)
      toast.error(err.message || 'Could not print. Please try again.')
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    prepareFreshEntry()
  }

  // When sample category changes, rebalance Cu using new primKey
  useEffect(() => {
    if (Object.keys(elementValues).length === 0) return
    const newKey = PRIMARY_ELEMENT[sampleCat] || 'Au'
    const prim = elementValues[newKey] ?? 0
    setElementValues(prev => {
      const sumOthers = Object.entries(prev)
        .filter(([k]) => k !== 'Cu' && k !== newKey)
        .reduce((s, [, v]) => s + (v || 0), 0)
      return { ...prev, Cu: parseFloat((100 - prim - sumOthers).toFixed(3)) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleCat])

  const nameToSym = Object.fromEntries(Object.entries(ELEMENT_NAMES).map(([s, n]) => [n, s]))
  const ALL_ELEMENT_GROUPS = [
    ['Silver','Copper','Zinc','Cadmium','Nickel','Indium'],
    ['Iron','Tin','Iridium','Ruthenium','Osmium','Rhenium'],
    ['Cobalt','Lead','Chromium','Platinum','Palladium','Rhodium'],
  ]
  const primaryFullName = ELEMENT_NAMES[primKey] || primKey
  const elementGroupsForDisplay = ALL_ELEMENT_GROUPS.map(group =>
    group.map(name => {
      if (name === primaryFullName) return primaryFullName
      return name
    })
  )

  return (
    <div className="w-full">
      {/* Add Toaster component at the top level */}
      <Toaster />

      {/* TWO-COLUMN LAYOUT — 50 / 50 */}
      <div className="flex gap-3 items-start">

        {/* ── LEFT PANEL ──────────────────────────────── */}
        <div className="flex flex-col gap-3 w-1/2 min-w-0">

          {/* SECTION 1 — Sample Header Details */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">SAMPLE DETAILS</p>
            <div className="grid grid-cols-2 gap-3">

              <Field label="Customer Name" required>
                <input className={INPUT} value={customerName} onChange={e => { setCustomerName(e.target.value); clearFieldError('customerName'); clearFieldError('general') }} placeholder="e.g. Raj Jewellers" />
                {formErrors.customerName && <span className="text-xs text-red-400">{formErrors.customerName}</span>}
              </Field>

              <Field label="Sample Category" required>
                <div className="flex gap-4 mt-1">
                  {['Gold','Silver','Platinum'].map(cat => (
                    <label key={cat} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input type="radio" name="sampleCat" value={cat} checked={sampleCat===cat}
                        onChange={() => { clearDrafts(); setSampleCat(cat); setPrimaryValue(null) }}
                        className="accent-amber-500 w-3.5 h-3.5" />
                      <span className="text-sm font-semibold text-slate-200">{cat}</span>
                    </label>
                  ))}
                </div>
              </Field>

              {/* Date + Sample Type share one grid cell */}
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-700">Date</span>
                    <input className={INPUT} type="date" value={date} onChange={e => { setDate(e.target.value); clearFieldError('date'); clearFieldError('general') }} />
                    {formErrors.date && <span className="text-xs text-red-400">{formErrors.date}</span>}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-700">Sample Type <span className="text-red-500">*</span></span>
                    <select value={sampleType} onChange={e => { setSampleType(e.target.value); clearFieldError('sampleType'); clearFieldError('general') }}
                      className="border border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 w-full">
                      {['Silver Sample','Gold Sample','Platinum Sample','Fine Gold','Coin','Bar']
                        .map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {formErrors.sampleType && <span className="text-xs text-red-400">{formErrors.sampleType}</span>}
                  </div>
                </div>
              </div>

              <Field label="Sr. No." helper="Auto-generated (calculated before save)">
                <input className={INPUT} type="text" value={srNo} disabled 
                  placeholder="Calculating next Sr.No..." />
              </Field>

              <Field label="Weight (gm)" required>
                <input className={INPUT} type="number" step="0.001" min="0" value={weight}
                  onChange={e => { setWeight(e.target.value); clearFieldError('weight'); clearFieldError('general') }} placeholder="0.000" />
                {formErrors.weight && <span className="text-xs text-red-400">{formErrors.weight}</span>}
              </Field>

              <Field label="Mobile">
                <input className={INPUT} type="tel" value={mobile}
                  onChange={e => { setMobile(e.target.value.replace(/\D/g,'').slice(0,10)); clearFieldError('mobile'); clearFieldError('general') }}
                  placeholder="10-digit mobile"
                  maxLength={10} />
                {formErrors.mobile && <span className="text-xs text-red-400">{formErrors.mobile}</span>}
              </Field>

            </div>
          </div>

          {/* COMPACT ACTION BAR */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              {/* LEFT: DELTA DETAILS */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto whitespace-nowrap pr-2">
                <span className="text-xs font-semibold text-slate-400 shrink-0">
                  {selectedReadingIds.size} readings
                </span>
                {machineDeltaRows.length > 0 && changedDeltaRows.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {changedDeltaRows.map((row, idx) => (
                      <span
                        key={idx}
                        className={`text-[11px] leading-5 font-semibold px-2 py-0.5 rounded-md border ${
                          row.absDelta >= 0.3
                            ? 'text-red-700 border-red-200 bg-red-50'
                            : row.absDelta >= 0.05
                              ? 'text-amber-700 border-amber-200 bg-amber-50'
                              : 'text-slate-700 border-slate-300 bg-slate-50'
                        }`}
                      >
                        {(ELEMENT_NAMES[row.sym] || row.sym)}: {row.baseline.toFixed(3)} to {row.finalValue.toFixed(3)} ({formatSigned(row.delta)})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT: ACTION BUTTONS */}
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

          {/* SECTION 2 — Composition Control Panel */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">COMPOSITION CONTROL PANEL</p>

            {/* 3 VALUE BOXES + BUTTONS in one row */}
            <div className="flex items-center gap-3">

              {/* Primary element box */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                  primKey === 'Au' ? 'text-amber-700' : 'text-[#1a73ca]'
                }`}>{ELEMENT_NAMES[primKey] || primKey}</span>
                <input
                  type="number" step="0.001" min="0" max="100"
                  value={primaryDraft ?? formatCompact(displayPrim)}
                  onChange={e => {
                    const raw = e.target.value
                    setPrimaryDraft(raw)
                    const val = parseFloat(raw)
                    if (!isNaN(val)) {
                      const newPrim = parseFloat(Math.max(0, Math.min(100, val)).toFixed(3))
                      setPrimaryValue(newPrim)
                      setElementValues(prev => rebalanceCu(newPrim, prev))
                    }
                  }}
                  onBlur={() => setPrimaryDraft(null)}
                  className={`w-24 h-10 rounded-lg border-2 text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 ${
                    primKey === 'Au'
                      ? 'bg-amber-50 border-amber-500 text-amber-700 focus:ring-amber-400'
                      : 'bg-[#1a73ca] border-[#1a73ca] text-white focus:ring-[#1a73ca]'
                  }`}
                />
                <span className={`text-[9px] font-semibold ${
                  primKey === 'Au' ? 'text-amber-600' : 'text-[#1a73ca]'
                }`}>{primKey} · % Pure</span>
              </div>

              {/* Impurity box */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Impurity</span>
                <div className="w-24 h-10 rounded-lg bg-slate-50 border-2 border-slate-300 flex items-center justify-center select-none pointer-events-none">
                  <span className="text-lg font-semibold text-slate-700 tabular-nums">{formatCompact(impurity)}</span>
                </div>
                <span className="text-[9px] text-slate-500 font-semibold">100 - {primKey}</span>
              </div>

              {/* Total Sum box */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sum Total</span>
                <div className={`w-24 h-10 rounded-lg border-2 flex items-center justify-center select-none pointer-events-none ${
                  Math.abs(elementSum - 100) < 0.01
                    ? 'bg-green-50 border-green-300'
                    : 'bg-amber-50 border-amber-300'
                }`}>
                  <span className={`text-lg font-semibold tabular-nums ${
                    Math.abs(elementSum - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'
                  }`}>{formatCompact(elementSum)}</span>
                </div>
                <span className={`text-[9px] font-semibold ${
                  Math.abs(elementSum - 100) < 0.01 ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {Math.abs(elementSum - 100) < 0.01 ? '✓ 100%' : `${(elementSum-100)>0?'+':''}${formatCompact(elementSum-100)} off`}
                </span>
              </div>

              {/* Delta Summary box — shows primary deviation */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Δ {primKey}</span>
                <div className={`w-24 h-10 rounded-lg border-2 flex items-center justify-center select-none pointer-events-none ${
                  primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high'
                    ? 'bg-red-50 border-red-300'
                    : primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid'
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-slate-50 border-slate-300'
                }`}>
                  <span className={`text-lg font-semibold tabular-nums ${
                    primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high'
                      ? 'text-red-700'
                      : primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid'
                        ? 'text-amber-700'
                        : 'text-slate-700'
                  }`}>
                    {primaryDeltaRow ? formatSigned(primaryDeltaRow.delta) : '0.000'}
                  </span>
                </div>
                <span className={`text-[9px] font-semibold ${
                  primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'high'
                    ? 'text-red-700'
                    : primaryDeltaRow && deltaTone(primaryDeltaRow.delta) === 'mid'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}>
                  Deviation
                </span>
              </div>

              {/* +/- buttons */}
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex gap-1.5">
                  {INCREMENT_STEPS.map(step => (
                    <button key={step.label} onClick={() => applyStep(step)}
                      title={step.snap === 'upper_range' ? `Upper Range (${UPPER_RANGE[sampleCat]}%)` : `+${step.delta}%`}
                      className={`flex-1 h-8 rounded-md text-xs font-semibold border transition-all active:scale-95 shadow-sm ${
                        step.snap
                          ? 'border-[#1a73ca] bg-[#1a73ca] text-white hover:bg-[#1a73ca]'
                          : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-100'
                      }`}>
                      {step.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {DECREMENT_STEPS.map(step => (
                    <button key={step.label} onClick={() => applyStep(step)}
                      title={step.snap === 'upper_limit' ? `Upper Limit (${UPPER_LIMIT[sampleCat]}%)` : `${step.delta}%`}
                      className={`flex-1 h-8 rounded-md text-xs font-semibold border transition-all active:scale-95 shadow-sm ${
                        step.snap
                          ? 'border-[#1a73ca] bg-[#1a73ca] text-white hover:bg-[#1a73ca]'
                          : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-100'
                      }`}>
                      {step.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* ALL ELEMENTS — 3 columns */}
            <div className="mt-3 border-t border-slate-700 pt-3">
              <p className="text-sm font-semibold text-slate-700 mb-2">ALL ELEMENTS</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                {elementGroupsForDisplay.map((group, gi) => (
                  <div key={gi} className="flex flex-col gap-1">
                    {group.map(fullName => {
                      const sym      = nameToSym[fullName] || fullName
                      const val      = elementValues[sym] ?? 0
                      const locked   = NON_EDITABLE_ELEMENTS.has(sym) || sym === primKey
                      const isPowder = POWDER_ELEMENTS.has(sym)
                      const isRed    = val < 0 || (isPowder && val > 0)
                      const deltaRow = deltaBySymbol[sym]
                      const delta    = deltaRow ? deltaRow.delta : null
                      return (
                        <div key={sym} className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold w-28 shrink-0 text-slate-700">
                            {fullName} ({sym.toUpperCase()})
                          </span>
                          <input
                            type="number" step="0.001" readOnly={locked}
                            value={elementDrafts[sym] ?? formatCompact(val)}
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
                            className={`flex-1 min-w-0 text-center border rounded-md px-1 py-1 text-sm font-medium tabular-nums
                              focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors
                              ${ isRed
                                  ? 'border-red-700 bg-red-900/30 text-red-400'
                                  : 'border-slate-600 bg-slate-700 text-slate-200 hover:border-amber-500'
                              }`}
                          />
                          <span className={`w-16 text-center text-[10px] font-medium tracking-tight ${
                            delta == null
                              ? 'text-slate-500'
                              : deltaTone(delta) === 'high'
                                ? 'text-red-400'
                                : deltaTone(delta) === 'mid'
                                  ? 'text-amber-400'
                                  : 'text-slate-400'
                          }`}>
                            {delta == null ? 'Δ —' : `Δ ${formatSigned(delta)}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>{/* end LEFT PANEL */}

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div className="w-1/2 min-w-0">

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

          {/* SECTION 3 — Live Reading Retrieval */}
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
              {[1,2,3,4,5,6,8,10].map(n => (
                <button key={n}
                  onClick={() => {
                    const next = new Set(readings.slice(0, n).map(r => r.id))
                    setSelectedReadingIds(next)
                    applyReadingsSelection(next)
                  }}
                  disabled={readings.length < n}
                  className={`h-6 w-7 rounded text-xs font-bold border transition-all active:scale-95 disabled:opacity-30 ${
                    selectedReadingIds.size === n && [...selectedReadingIds].every(id => readings.slice(0,n).some(r=>r.id===id))
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
                      sums[el.name]   = (sums[el.name]   || 0) + (el.value || 0)
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

        </div>{/* end RIGHT PANEL */}

      </div>
    </div>
  )
}