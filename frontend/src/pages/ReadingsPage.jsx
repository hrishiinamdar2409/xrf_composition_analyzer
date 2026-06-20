import { Toaster } from 'react-hot-toast'
import { useReadings } from '../hooks/useReadings'
import SampleDetails from '../components/readings/SampleDetails'
import EntryModeSelector from '../components/readings/EntryModeSelector'
import ActionBar from '../components/readings/ActionBar'
import CompositionPanel from '../components/readings/CompositionPanel'
import ReadingsTable from '../components/readings/ReadingsTable'
import { PRIMARY_ELEMENT } from '../constants/readingsConstants'
import { calculateDeltaRows } from '../utils/readingsUtils'

export default function ReadingsPage() {
  const {
    customerName, setCustomerName,
    mobile, setMobile,
    srNo, setSrNo,
    date, setDate,
    sampleType, setSampleType,
    weight, setWeight,
    sampleCat, setSampleCat,
    entryMode, setEntryMode,
    formErrors, setFormErrors,
    readings,
    selectedReadingIds,
    elementValues, setElementValues,
    machineBaseline,
    primaryValue, setPrimaryValue,
    primaryDraft, setPrimaryDraft,
    elementDrafts, setElementDrafts,
    saving,
    printing,
    primKey,
    displayPrim,
    impurity,
    elementSum,
    canSave,
    canPrint,
    machineDeltaRows,
    rebalanceCu,
    clearDrafts,
    clearAllErrors,
    clearFieldError,
    toggleReading,
    selectAllReadings,
    clearReadings,
    handleElementChange,
    handleSave,
    handlePrint,
    prepareFreshEntry,
  } = useReadings()

  const primaryDeltaRow = machineDeltaRows.find(row => row.sym === primKey) || null
  const changedDeltaRows = machineDeltaRows.filter(row => row.absDelta >= 0.001)

  const handleReset = () => {
    prepareFreshEntry()
  }

  return (
    <div className="w-full">
      <Toaster />

      {/* TWO-COLUMN LAYOUT — 50 / 50 */}
      <div className="flex gap-3 items-start">

        {/* ── LEFT PANEL ──────────────────────────────── */}
        <div className="flex flex-col gap-3 w-1/2 min-w-0">

          {/* Sample Details */}
          <SampleDetails
            customerName={customerName}
            setCustomerName={setCustomerName}
            sampleCat={sampleCat}
            setSampleCat={setSampleCat}
            date={date}
            setDate={setDate}
            sampleType={sampleType}
            setSampleType={setSampleType}
            srNo={srNo}
            weight={weight}
            setWeight={setWeight}
            mobile={mobile}
            setMobile={setMobile}
            formErrors={formErrors}
            clearFieldError={clearFieldError}
            clearDrafts={clearDrafts}
            setPrimaryValue={setPrimaryValue}
          />

          {/* Action Bar */}
          <ActionBar
            selectedReadingIds={selectedReadingIds}
            readings={readings}
            changedDeltaRows={changedDeltaRows}
            canSave={canSave}
            saving={saving}
            canPrint={canPrint}
            printing={printing}
            handleSave={handleSave}
            handlePrint={handlePrint}
            handleReset={handleReset}
            formErrors={formErrors}
          />

          {/* Composition Panel */}
          <CompositionPanel
            sampleCat={sampleCat}
            primKey={primKey}
            displayPrim={displayPrim}
            impurity={impurity}
            elementSum={elementSum}
            primaryDeltaRow={primaryDeltaRow}
            primaryValue={primaryValue}
            setPrimaryValue={setPrimaryValue}
            elementValues={elementValues}
            setElementValues={setElementValues}
            machineBaseline={machineBaseline}
            rebalanceCu={rebalanceCu}
            clearDrafts={clearDrafts}
            primaryDraft={primaryDraft}
            setPrimaryDraft={setPrimaryDraft}
            elementDrafts={elementDrafts}
            setElementDrafts={setElementDrafts}
            handleElementChange={handleElementChange}
          />

        </div>{/* end LEFT PANEL */}

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div className="w-1/2 min-w-0">

          {/* Entry Mode */}
          <EntryModeSelector
            entryMode={entryMode}
            setEntryMode={setEntryMode}
          />

          {/* Readings Table */}
          <ReadingsTable
            readings={readings}
            selectedReadingIds={selectedReadingIds}
            toggleReading={toggleReading}
            selectAllReadings={selectAllReadings}
            clearReadings={clearReadings}
          />

        </div>{/* end RIGHT PANEL */}

      </div>
    </div>
  )
}