import { useEffect } from 'react'
import Field from './Field'

const INPUT = 'w-full border border-slate-600 rounded-lg px-2.5 py-1.5 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white bg-slate-700 text-slate-100 placeholder-slate-400'

// Helper function to detect sample category from sample type
const detectCategoryFromType = (sampleType) => {
  if (!sampleType) return 'Gold'
  
  const typeLower = sampleType.toLowerCase()
  
  // Silver detection
  if (typeLower.includes('silver') || 
      typeLower.includes('chandi') || 
      typeLower.includes('payal') || 
      typeLower.includes('925')) {
    return 'Silver'
  }
  
  // Platinum detection
  if (typeLower.includes('platinum') || 
      typeLower.includes('plat') || 
      typeLower.includes('950')) {
    return 'Platinum'
  }
  
  // Gold detection (default)
  if (typeLower.includes('gold') || 
      typeLower.includes('sona') || 
      typeLower.includes('kdm') || 
      typeLower.includes('hallmark') || 
      typeLower.includes('coin') || 
      typeLower.includes('bar') || 
      typeLower.includes('fine')) {
    return 'Gold'
  }
  
  return 'Gold' // Default
}

export default function SampleDetails({
  customerName,
  setCustomerName,
  sampleCat,
  setSampleCat,
  date,
  setDate,
  sampleType,
  setSampleType,
  srNo,
  weight,
  setWeight,
  mobile,
  setMobile,
  formErrors,
  clearFieldError,
  clearDrafts,
  setPrimaryValue,
}) {
  // Log when customerName changes for debugging
  useEffect(() => {
    console.log('SampleDetails - customerName updated:', customerName)
  }, [customerName])

  // Auto-detect sample category when sample type changes
  useEffect(() => {
    if (sampleType) {
      const detectedCat = detectCategoryFromType(sampleType)
      if (detectedCat !== sampleCat) {
        // Only update if different and not during initial load
        clearDrafts()
        setSampleCat(detectedCat)
        setPrimaryValue(null)
      }
    }
  }, [sampleType, sampleCat, clearDrafts, setSampleCat, setPrimaryValue])

  // Handle sample type change with category auto-detection
  const handleSampleTypeChange = (value) => {
    setSampleType(value)
    clearFieldError('sampleType')
    clearFieldError('general')
    
    // Auto-detect category
    const detectedCat = detectCategoryFromType(value)
    if (detectedCat !== sampleCat) {
      clearDrafts()
      setSampleCat(detectedCat)
      setPrimaryValue(null)
    }
  }

  // Handle manual category change
  const handleCategoryChange = (cat) => {
    clearDrafts()
    setSampleCat(cat)
    setPrimaryValue(null)
    clearFieldError('general')
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3">SAMPLE DETAILS</p>
      <div className="grid grid-cols-2 gap-3">
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
          {formErrors.customerName && <span className="text-xs text-red-400">{formErrors.customerName}</span>}
        </Field>

        <Field label="Sample Category" required>
          <div className="flex gap-4 mt-1">
            {['Gold', 'Silver', 'Platinum'].map(cat => (
              <label key={cat} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                  type="radio" 
                  name="sampleCat" 
                  value={cat} 
                  checked={sampleCat === cat}
                  onChange={() => handleCategoryChange(cat)}
                  className="accent-amber-500 w-3.5 h-3.5" 
                />
                <span className="text-sm font-semibold text-slate-200">{cat}</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Date</span>
              <input 
                className={INPUT} 
                type="date" 
                value={date || ''} 
                onChange={e => { 
                  setDate(e.target.value)
                  clearFieldError('date')
                  clearFieldError('general')
                }} 
              />
              {formErrors.date && <span className="text-xs text-red-400">{formErrors.date}</span>}
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-700">Sample Type <span className="text-red-500">*</span></span>
              <select 
                value={sampleType || ''} 
                onChange={e => handleSampleTypeChange(e.target.value)}
                className="border border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
              >
                {['Silver Sample', 'Gold Sample', 'Platinum Sample', 'Fine Gold', 'Coin', 'Bar', 'all samples', 'copper sample']
                  .map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {formErrors.sampleType && <span className="text-xs text-red-400">{formErrors.sampleType}</span>}
            </div>
          </div>
        </div>

        <Field label="Sr. No.">
          <input className={INPUT} type="text" value={srNo || ''} disabled placeholder="Calculating next Sr.No..." />
        </Field>

        <Field label="Weight (gm)" required>
          <input 
            className={INPUT} 
            type="number" 
            step="0.001" 
            min="0" 
            value={weight || ''}
            onChange={e => { 
              setWeight(e.target.value)
              clearFieldError('weight')
              clearFieldError('general')
            }} 
            placeholder="0.000" 
          />
          {formErrors.weight && <span className="text-xs text-red-400">{formErrors.weight}</span>}
        </Field>

        <Field label="Mobile">
          <input 
            className={INPUT} 
            type="tel" 
            value={mobile || ''}
            onChange={e => { 
              setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))
              clearFieldError('mobile')
              clearFieldError('general')
            }}
            placeholder="10-digit mobile"
            maxLength={10} 
          />
          {formErrors.mobile && <span className="text-xs text-red-400">{formErrors.mobile}</span>}
        </Field>
      </div>
    </div>
  )
}