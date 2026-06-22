import { useEffect } from 'react'
import Field from './Field'

const INPUT = 'w-full border border-slate-600 rounded-lg px-2.5 py-1.5 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white bg-slate-700 text-slate-100 placeholder-slate-400'

// Fixed category match function with strict fallback
const detectCategoryFromType = (sampleType) => {
  // RULE: Always fall back to Gold if sample type is unselected, cleared, or empty
  if (!sampleType) return 'Gold'
  
  const upperType = sampleType.toUpperCase().trim()

  if (upperType.includes('SILVER')) {
    return 'Silver'
  }
  if (upperType.includes('GOLD')) {
    return 'Gold'
  }
  
  return 'Gold' // Default fallback
}

export default function SampleDetails({
  customerName,
  setCustomerName,
  sampleCat,
  setSampleCat,
  date,
  setDate,
  time,
  setTime,
  sampleType,
  setSampleType,
  srNo,
  weight,
  setWeight,
  formErrors,
  clearFieldError,
  clearDrafts,
  setPrimaryValue,
}) {

  // Log when customerName changes for debugging
  useEffect(() => {
    console.log('SampleDetails - customerName updated:', customerName)
  }, [customerName])

  // ─── POWERFUL LIVE AUTO-SYNC REACTION LAYER ───────────────────────────────
  // Automatically updates Sample Category whenever sampleType shifts. 
  // If sampleType is cleared/unselected, it explicitly forces it to "Gold".
  useEffect(() => {
    const detectedCat = detectCategoryFromType(sampleType)
    if (detectedCat !== sampleCat) {
      clearDrafts()
      setSampleCat(detectedCat)
      setPrimaryValue(null)
    }
  }, [sampleType, sampleCat, setSampleCat, clearDrafts, setPrimaryValue])

  // Handle manual changes to the dropdown selector
  const handleSampleTypeChange = (value) => {
    setSampleType(value ? value.toUpperCase().trim() : '')
    clearFieldError('sampleType')
    clearFieldError('general')
  }

  // Handle manual adjustments to category radios
  const handleCategoryChange = (cat) => {
    clearDrafts()
    setSampleCat(cat)
    setPrimaryValue(null)
    clearFieldError('general')
  }

  // Ensure uppercase conformity so the select tag value matches option keys perfectly
  const normalizedSampleType = sampleType ? sampleType.toUpperCase().trim() : ''

  // Format weight to display exactly 3 decimal numbers without breaking raw inputs
  let displayWeightValue = ''
  if (weight !== null && weight !== undefined && weight !== '') {
    const parsedNum = parseFloat(weight)
    displayWeightValue = !isNaN(parsedNum) && !String(weight).endsWith('.')
      ? parsedNum.toFixed(3)
      : weight
  }

  // Combine date and time into datetime-local string
  const getDateTimeValue = () => {
    if (date && time) {
      return `${date}T${time}`
    }
    return ''
  }

  // Handle datetime-local change
  const handleDateTimeChange = (e) => {
    const value = e.target.value
    if (value) {
      const [datePart, timePart] = value.split('T')
      setDate(datePart)
      setTime(timePart)
    } else {
      setDate('')
      setTime('')
    }
    clearFieldError('date')
    clearFieldError('time')
    clearFieldError('general')
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
      <p className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">SAMPLE DETAILS</p>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        
        {/* Field 1: Customer Name */}
        <Field label="Customer Name" required>
          <input 
            className={INPUT} 
            value={customerName || ''} 
            onChange={e => { 
              setCustomerName(e.target.value)
              clearFieldError('customerName')
              clearFieldError('general')
            }} 
            placeholder="e.g. Raj Jewellers" 
          />
          {formErrors.customerName && <span className="text-xs text-red-400 mt-1 block">{formErrors.customerName}</span>}
        </Field>

        {/* Field 2: Sample Category Radio Matrix Options */}
        <Field label="Sample Category" required>
          <div className="flex gap-4 items-center h-[38px]">
            {['Gold', 'Silver', 'Platinum'].map(cat => (
              <label key={cat} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                  type="radio" 
                  name="sampleCat" 
                  value={cat} 
                  checked={sampleCat === cat}
                  onChange={() => handleCategoryChange(cat)}
                  className="accent-amber-500 w-4 h-4 cursor-pointer" 
                />
                <span className="text-sm font-semibold text-slate-200">{cat}</span>
              </label>
            ))}
          </div>
          {formErrors.sampleCat && <span className="text-xs text-red-400 mt-1 block">{formErrors.sampleCat}</span>}
        </Field>

        {/* Field 3: Date & Time Combined Input Box */}
        <Field label="Date & Time" required>
          <input 
            className={INPUT} 
            type="datetime-local"
            value={getDateTimeValue()} 
            onChange={handleDateTimeChange}
          />
          {(formErrors.date || formErrors.time) && (
            <span className="text-xs text-red-400 mt-1 block">
              {formErrors.date || formErrors.time}
            </span>
          )}
        </Field>

        {/* Field 4: Sample Type Custom Selector Dropdown */}
        <Field label="Sample Type" required>
          <select 
            value={normalizedSampleType} 
            onChange={e => handleSampleTypeChange(e.target.value)}
            className="w-full border border-slate-600 rounded-lg px-2.5 py-1.5 text-[15px] font-medium bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
          >
            <option value="">-- SELECT TYPE --</option>
            {[
              'GOLD SAMPLE', 
              'GOLD SKIN TEST', 
              'GOLD ORNAMENT', 
              'SILVER SAMPLE', 
              'SILVER SKIN TEST', 
              'SILVER ORNAMENT'
            ].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {formErrors.sampleType && <span className="text-xs text-red-400 mt-1 block">{formErrors.sampleType}</span>}
        </Field>

        {/* Field 5: Weight Management Node */}
        <Field label="Weight (gm)" required>
          <input 
            className={INPUT} 
            type="number" 
            step="0.001" 
            min="0" 
            value={displayWeightValue}
            onChange={e => { 
              setWeight(e.target.value)
              clearFieldError('weight')
              clearFieldError('general')
            }} 
            placeholder="0.000" 
          />
          {formErrors.weight && <span className="text-xs text-red-400 mt-1 block">{formErrors.weight}</span>}
        </Field>

        {/* Field 6: Sr. No Input Node */}
        <Field label="Sr. No.">
          <input 
            className={`${INPUT} opacity-60 bg-slate-800 cursor-not-allowed`} 
            type="text" 
            value={srNo || ''} 
            disabled 
            placeholder="Calculating next Sr.No..." 
          />
        </Field>

      </div>
    </div>
  )
}