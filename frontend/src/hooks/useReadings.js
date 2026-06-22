import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useWebSocket } from "./useWebSocket";
import {
  PRIMARY_ELEMENT,
  ENTRY_MODE,
  ELEMENT_NAMES,
  NON_EDITABLE_ELEMENTS,
  POWDER_ELEMENTS,
  READING_COLUMNS,
} from "../constants/readingsConstants";
import {
  formatCompact,
  isValidIsoDate,
  calculateAverages,
  calculateDeltaRows,
} from "../utils/readingsUtils";

export function useReadings() {
  const navigate = useNavigate();

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [srNo, setSrNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sampleType, setSampleType] = useState("Gold Sample");
  const [weight, setWeight] = useState("");
  const [sampleCat, setSampleCat] = useState("Gold");
  const [entryMode, setEntryMode] = useState(ENTRY_MODE.SINGLE);
  const [formErrors, setFormErrors] = useState({});

  // Reading state
  const [readings, setReadings] = useState([]);
  const [selectedReadingIds, setSelectedReadingIds] = useState(new Set());
  const [elementValues, setElementValues] = useState({});
  const [machineBaseline, setMachineBaseline] = useState({});
  const [primaryValue, setPrimaryValue] = useState(null);
  const [primaryDraft, setPrimaryDraft] = useState(null);
  const [elementDrafts, setElementDrafts] = useState({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editingSampleId, setEditingSampleId] = useState(null);
  const [profileFilter, setProfileFilter] = useState("ALL");

  const isLoadingEditRef = useRef(false);
  const nextItemTimerRef = useRef(null);

  const primKey = PRIMARY_ELEMENT[sampleCat] || "Au";
  const displayPrim = parseFloat(
    (primaryValue ?? elementValues[primKey] ?? 0).toFixed(3),
  );
  const impurity = parseFloat(Math.max(0, 100 - displayPrim).toFixed(3));
  const elementSum = parseFloat(
    (
      displayPrim +
      Object.entries(elementValues)
        .filter(([k]) => k !== primKey)
        .reduce((s, [, v]) => s + (v || 0), 0)
    ).toFixed(3),
  );
  const hasComposition = Object.keys(elementValues).length > 0;
  const canSave = !saving && hasComposition && selectedReadingIds.size > 0;
  const canPrint =
    !printing && !saving && hasComposition && selectedReadingIds.size > 0;

  const rebalanceCu = useCallback(
    (newPrim, elValues) => {
      const sumOthers = Object.entries(elValues)
        .filter(([k]) => k !== "Cu" && k !== primKey)
        .reduce((s, [, v]) => s + (v || 0), 0);
      return {
        ...elValues,
        Cu: parseFloat((100 - newPrim - sumOthers).toFixed(3)),
      };
    },
    [primKey],
  );

  const clearDrafts = useCallback(() => {
    setPrimaryDraft(null);
    setElementDrafts({});
  }, []);

  const clearAllErrors = useCallback(() => {
    setFormErrors({});
  }, []);

  const setFieldError = useCallback((field, message) => {
    setFormErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const fetchNextSrNo = useCallback(() => {
    fetch("/api/samples/next-sr")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.nextSrNo) {
          setSrNo(data.nextSrNo);
        }
      })
      .catch((err) => {
        console.error("[fetchNextSrNo] Failed to fetch next Sr.No:", err);
      });
  }, []);

  const filterValidElements = useCallback((obj) => {
    const validSymbols = new Set(Object.keys(ELEMENT_NAMES));
    const result = {};
    Object.keys(obj).forEach((key) => {
      if (validSymbols.has(key)) {
        result[key] = obj[key];
      }
    });
    return result;
  }, []);

  const applyReadingsSelection = useCallback(
    (readingIds) => {
      const subset = readings.filter((r) => readingIds.has(r.id));
      clearDrafts();

      if (!subset.length) {
        setElementValues({});
        setMachineBaseline({});
        setPrimaryValue(null);
        setCustomerName("");
        setSampleType("Silver Sample");
        setWeight("");
        setSampleCat("Gold");
        return;
      }

      const firstReading = subset[0];

      // Auto-populate Customer Name
      if (firstReading.customer_name) {
        setCustomerName(firstReading.customer_name);
      }

      // Auto-populate Sample Type
      if (firstReading.sample_type) {
        setSampleType(firstReading.sample_type);
      }

      // Auto-populate Weight (handle zero values safely)
      if (firstReading.weight != null) {
        setWeight(String(firstReading.weight));
      }

      // Auto-populate Date from reading_date
      if (firstReading.reading_date) {
        // Format date to YYYY-MM-DD
        const dateObj = new Date(firstReading.reading_date);
        if (!isNaN(dateObj.getTime())) {
          setDate(dateObj.toISOString().slice(0, 10));
        }
      } else if (firstReading.arrived_at) {
        // Fallback to arrived_at if reading_date not available
        const dateObj = new Date(firstReading.arrived_at);
        if (!isNaN(dateObj.getTime())) {
          setDate(dateObj.toISOString().slice(0, 10));
        }
      } else if (firstReading.created_at) {
        // Fallback to created_at if reading_date not available
        const dateObj = new Date(firstReading.created_at);
        if (!isNaN(dateObj.getTime())) {
          setDate(dateObj.toISOString().slice(0, 10));
        }
      } else if (firstReading.created_at) {
        // Fallback to created_at if reading_date not available
        const dateObj = new Date(firstReading.created_at);
        if (!isNaN(dateObj.getTime())) {
          setDate(dateObj.toISOString().slice(0, 10));
        }
      }

      // Detect category from sample type
      let detectedCat = "Gold";
      if (firstReading.elements && Array.isArray(firstReading.elements)) {
        const hasAu = firstReading.elements.some(
          (el) => el.name === "Au" && el.value > 0,
        );
        const hasAg = firstReading.elements.some(
          (el) => el.name === "Ag" && el.value > 0,
        );
        const hasPt = firstReading.elements.some(
          (el) => el.name === "Pt" && el.value > 0,
        );

        if (hasAu) detectedCat = "Gold";
        else if (hasAg) detectedCat = "Silver";
        else if (hasPt) detectedCat = "Platinum";
      }
      setSampleCat(detectedCat);

      // Calculate averages for selected readings
      const avgs = {};
      const counts = {};

      subset.forEach((r) => {
        const elMap = {};
        if (r.elements && Array.isArray(r.elements)) {
          r.elements.forEach((el) => {
            if (ELEMENT_NAMES[el.name]) {
              elMap[el.name] = el.value;
            }
          });
        }
        READING_COLUMNS.forEach((sym) => {
          if (r[sym] !== undefined && elMap[sym] === undefined) {
            if (ELEMENT_NAMES[sym]) {
              elMap[sym] = r[sym];
            }
          }
        });

        Object.keys(elMap).forEach((key) => {
          avgs[key] = (avgs[key] || 0) + (elMap[key] || 0);
          counts[key] = (counts[key] || 0) + 1;
        });
      });

      const averagedValues = {};
      Object.keys(avgs).forEach((key) => {
        averagedValues[key] = parseFloat((avgs[key] / counts[key]).toFixed(3));
      });

      const validAverages = filterValidElements(averagedValues);

      const newPrim = validAverages[primKey] ?? 0;
      const normalizedAvgs = rebalanceCu(newPrim, validAverages);
      setPrimaryValue(newPrim);
      setElementValues(normalizedAvgs);
      setMachineBaseline(normalizedAvgs);
    },
    [clearDrafts, primKey, readings, rebalanceCu, filterValidElements],
  );

  const toggleReading = (id) => {
    setSelectedReadingIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      applyReadingsSelection(next);
      return next;
    });
  };

  const selectAllReadings = () => {
    const next = new Set(readings.map((r) => r.id));
    setSelectedReadingIds(next);
    applyReadingsSelection(next);
  };

  const clearReadings = () => {
    const next = new Set();
    setSelectedReadingIds(next);
    applyReadingsSelection(next);
  };

  const handleSelectLastN = useCallback(
    (selectedIds) => {
      setSelectedReadingIds(selectedIds);
      applyReadingsSelection(selectedIds);
    },
    [applyReadingsSelection],
  );

  const handleElementChange = (name, raw) => {
    if (NON_EDITABLE_ELEMENTS.has(name)) return;
    if (name === primKey) return;
    const val = parseFloat(raw);
    const safeVal = isNaN(val) ? 0 : val;
    setElementValues((prev) => {
      const updated = { ...prev, [name]: safeVal };
      return rebalanceCu(displayPrim, updated);
    });
  };

  const prepareNextItem = useCallback(() => {
    isLoadingEditRef.current = false;
    setSrNo("");
    setDate(new Date().toISOString().slice(0, 10));
    setSampleType("Silver Sample");
    setWeight("");
    setElementValues({});
    setMachineBaseline({});
    setPrimaryValue(null);
    clearDrafts();
    setSelectedReadingIds(new Set());
    setEditingSampleId(null);
    clearAllErrors();
    fetchNextSrNo();
  }, [clearAllErrors, clearDrafts, fetchNextSrNo]);

  const prepareFreshEntry = useCallback(() => {
    isLoadingEditRef.current = false;
    setCustomerName("");
    setMobile("");
    setSrNo("");
    setDate(new Date().toISOString().slice(0, 10));
    setWeight("");
    setSampleCat("Gold");
    setSampleType("Silver Sample");
    setElementValues({});
    setMachineBaseline({});
    setPrimaryValue(null);
    clearDrafts();
    setSelectedReadingIds(new Set());
    setEditingSampleId(null);
    clearAllErrors();
    fetchNextSrNo();
  }, [clearAllErrors, clearDrafts, fetchNextSrNo]);

  const mapServerErrors = useCallback((body) => {
    if (!body || !Array.isArray(body.errors)) return {};
    const mapped = {};
    for (const e of body.errors) {
      const f = e?.field;
      const msg = e?.message || "Invalid value.";
      if (!f) continue;
      if (f === "readingIds") mapped.readingIds = msg;
      else if (f === "customerName") mapped.customerName = msg;
      else if (f === "mobile") mapped.mobile = msg;
      else if (f === "itemDesc") mapped.sampleType = msg;
      else if (f === "testDate") mapped.date = msg;
      else if (f === "id") mapped.general = msg;
      else if (f.startsWith("expertValues.")) mapped.composition = msg;
      else if (f === "expertValues") mapped.composition = msg;
      else mapped.general = msg;
    }
    return mapped;
  }, []);

  const validateForm = useCallback(() => {
    const errors = {};

    if (
      !customerName.trim() ||
      customerName.trim().length < 2 ||
      customerName.trim().length > 120
    ) {
      errors.customerName = "Customer name must be 2-120 characters.";
    }

    if (mobile && !/^\d{10}$/.test(mobile)) {
      errors.mobile = "Mobile number must be exactly 10 digits.";
    }

    if (!weight || Number(weight) <= 0) {
      errors.weight = "Weight must be greater than 0.";
    }

    if (!date || !isValidIsoDate(date)) {
      errors.date = "Date must be a valid YYYY-MM-DD value.";
    }

    if (!sampleType || sampleType.trim().length < 2) {
      errors.sampleType = "Sample type is required.";
    }

    if (selectedReadingIds.size === 0) {
      errors.readingIds = "Select at least one reading.";
    }

    if (!hasComposition) {
      errors.composition = "Composition is empty. Select readings first.";
    }

    if (displayPrim < 0 || displayPrim > 100) {
      errors.primaryValue = `${primKey} must be between 0 and 100.`;
    }

    if (Math.abs(elementSum - 100) > 0.05) {
      errors.elementSum = `Composition total must be close to 100. Current: ${formatCompact(elementSum)}`;
    }

    const validSymbols = new Set(Object.keys(ELEMENT_NAMES));
    for (const [symbol, raw] of Object.entries(elementValues || {})) {
      if (!validSymbols.has(symbol)) {
        continue;
      }
      const val = Number(raw);
      if (!Number.isFinite(val)) {
        errors.composition = `${symbol} must be numeric.`;
        break;
      }
      if (val < 0) {
        errors.composition = `${symbol} cannot be negative.`;
        break;
      }
    }

    setFormErrors(errors);
    return { ok: Object.keys(errors).length === 0, errors };
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
  ]);

  const saveSampleToDb = useCallback(async () => {
    const validation = validateForm();
    if (!validation.ok) return null;

    const subset = readings.filter((r) => selectedReadingIds.has(r.id));

    setSaving(true);
    try {
      const payload = {
        customerName: customerName.trim() || "Unknown",
        itemDesc: `${sampleCat} ${sampleType} | Wt:${weight || "?"}g | ${mobile || ""}`,
        testDate: date || null,
        readingIds: subset.map((r) => r.id),
        composition: {
          primaryElement: primKey,
          primaryValue: displayPrim,
          elements: elementValues,
        },
      };

      let res, data;
      let targetSampleId = editingSampleId;

      if (editingSampleId) {
        res = await fetch(`/api/samples/${editingSampleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok || !data?.id) {
        const mapped = mapServerErrors(data);
        if (Object.keys(mapped).length) {
          setFormErrors((prev) => ({ ...prev, ...mapped }));
        }
        throw new Error(data?.error || "Unable to save sample right now.");
      }

      targetSampleId = Number(data.id);

      if (data.srNo) {
        setSrNo(data.srNo);
      }

      // Filter element values to only valid symbols before sending
      const validSymbols = new Set(Object.keys(ELEMENT_NAMES));
      const finalPayload = {};
      Object.keys(elementValues).forEach((key) => {
        if (validSymbols.has(key)) {
          finalPayload[key] = elementValues[key];
        }
      });
      finalPayload[primKey] = displayPrim;

      if (Object.keys(finalPayload).length > 0) {
        const machineDeltaRows = calculateDeltaRows(
          machineBaseline,
          elementValues,
          primKey,
          displayPrim,
        );
        const changedDeltaRows = machineDeltaRows.filter(
          (row) => row.absDelta >= 0.001,
        );
        const deltaMeta = {
          primaryElement: primKey,
          primaryDelta:
            machineDeltaRows.find((row) => row.sym === primKey)?.delta ?? null,
          changedElements: changedDeltaRows.length,
          topDeltas: changedDeltaRows
            .slice()
            .sort((a, b) => b.absDelta - a.absDelta)
            .slice(0, 3)
            .map((row) => ({
              element: row.sym,
              machine: row.baseline,
              final: row.finalValue,
              delta: row.delta,
            })),
        };

        const resultRes = await fetch(`/api/samples/${targetSampleId}/result`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expertValues: finalPayload, deltaMeta }),
        });
        const resultBody = await resultRes.json().catch(() => ({}));
        if (!resultRes.ok) {
          const mapped = mapServerErrors(resultBody);
          if (Object.keys(mapped).length) {
            setFormErrors((prev) => ({ ...prev, ...mapped }));
          }
          throw new Error(
            resultBody?.detail ||
              resultBody?.error ||
              "Could not save composition adjustments.",
          );
        }
      }

      setEditingSampleId(targetSampleId);

      // After successful save, trigger a refresh of the reports queue
      // This will notify the Reports page to refresh
      window.dispatchEvent(
        new CustomEvent("sampleSaved", {
          detail: { sampleId: targetSampleId, srNo: data.srNo },
        }),
      );

      return { sampleId: targetSampleId, srNo: data.srNo, jobRef: data.jobRef };
    } catch (err) {
      console.error("[saveSampleToDb] Error:", err);
      setFieldError("general", err.message || "Save failed. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    validateForm,
    readings,
    selectedReadingIds,
    customerName,
    sampleCat,
    sampleType,
    weight,
    mobile,
    date,
    primKey,
    displayPrim,
    elementValues,
    editingSampleId,
    machineBaseline,
    setFieldError,
    mapServerErrors,
  ]);

  const handleSave = useCallback(async () => {
    const saved = await saveSampleToDb();
    if (!saved?.sampleId) return;

    const srNoDisplay = saved.srNo || saved.jobRef || saved.sampleId;
    toast.success(`Saved Sr No ${srNoDisplay}`, {
      duration: 3000,
      position: "top-right",
    });

    if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current);
    if (entryMode === ENTRY_MODE.MULTI) {
      nextItemTimerRef.current = setTimeout(() => {
        prepareNextItem();
      }, 1500);
      return;
    }

    prepareFreshEntry();
  }, [saveSampleToDb, entryMode, prepareNextItem, prepareFreshEntry]);

  const handlePrint = useCallback(async () => {
    if (!canPrint) {
      setFieldError(
        "readingIds",
        "Nothing to print yet. Select at least one reading first.",
      );
      return;
    }

    if (printing || saving) return;
    setPrinting(true);
    try {
      const saved = await saveSampleToDb();
      if (!saved?.sampleId) return;

      const res = await fetch(`/api/samples/${saved.sampleId}/report`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const mapped = mapServerErrors(body);
        if (Object.keys(mapped).length) {
          setFormErrors((prev) => ({ ...prev, ...mapped }));
        }
        throw new Error(body?.detail || body?.error || "Print failed");
      }

      const srNoDisplay = saved.srNo || saved.jobRef || saved.sampleId;
      toast.success(
        `Printed Sr No ${srNoDisplay}${body?.printer ? ` (${body.printer})` : ""}`,
        {
          duration: 3000,
          position: "top-right",
        },
      );

      if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current);
      if (entryMode === ENTRY_MODE.MULTI) {
        nextItemTimerRef.current = setTimeout(() => {
          prepareNextItem();
        }, 1500);
      } else {
        prepareFreshEntry();
      }
    } catch (err) {
      console.error("[handlePrint] Error:", err);
      toast.error(err.message || "Could not print. Please try again.");
    } finally {
      setPrinting(false);
    }
  }, [
    canPrint,
    printing,
    saving,
    saveSampleToDb,
    entryMode,
    prepareNextItem,
    prepareFreshEntry,
    setFieldError,
    mapServerErrors,
  ]);

  // WebSocket connection
  useWebSocket(
    useCallback((msg) => {
      if (msg.type === "NEW_READING")
        setReadings((prev) => [msg.payload, ...prev]);
    }, []),
  );

  // Load edit state from sessionStorage
  useEffect(() => {
    const editingData = sessionStorage.getItem("editingSample");
    if (editingData) {
      isLoadingEditRef.current = true;
      try {
        const sample = JSON.parse(editingData);
        setEditingSampleId(sample.id);
        setCustomerName(sample.customer_name || "");
        setSrNo(sample.job_ref || "");
        setDate(
          sample.created_at?.slice(0, 10) ||
            new Date().toISOString().slice(0, 10),
        );

        let parsedCat = "Gold";
        const parsed = sample.parsedItemDesc || {};
        if (
          parsed.sampleCat &&
          ["Gold", "Silver", "Platinum"].includes(parsed.sampleCat)
        ) {
          parsedCat = parsed.sampleCat;
          setSampleCat(parsed.sampleCat);
        }
        if (parsed.sampleType) setSampleType(parsed.sampleType);
        if (parsed.weight != null) setWeight(String(parsed.weight));
        if (parsed.mobile) setMobile(parsed.mobile);

        if (
          sample.item_desc &&
          (!parsed.sampleCat ||
            !parsed.sampleType ||
            parsed.weight == null ||
            !parsed.mobile)
        ) {
          const parts = sample.item_desc.split("|").map((p) => p.trim());
          if (parts[0]) {
            const catTypeMatch = parts[0].match(/^(\w+)\s+(.+)$/);
            if (catTypeMatch) {
              const cat = catTypeMatch[1];
              if (["Gold", "Silver", "Platinum"].includes(cat)) {
                parsedCat = cat;
                setSampleCat(cat);
              }
              setSampleType(catTypeMatch[2]);
            }
          }
          if (parts[1]) {
            const wtMatch = parts[1].match(/Wt:([0-9.]+)g/);
            if (wtMatch) setWeight(wtMatch[1]);
          }
          if (parts[3] && !parsed.mobile) {
            const mobileStr = parts[3].trim();
            const cleanMobile = mobileStr.replace(/\D/g, "").slice(-15);
            setMobile(cleanMobile);
          }
        }

        let elemVals = {};
        if (sample.finalResults && sample.finalResults.length > 0) {
          sample.finalResults.forEach((fr) => {
            if (ELEMENT_NAMES[fr.element]) {
              elemVals[fr.element] = fr.expert_value ?? fr.auto_value;
            }
          });
        } else if (sample.autoResults && sample.autoResults.length > 0) {
          sample.autoResults.forEach((ar) => {
            if (ELEMENT_NAMES[ar.element]) {
              elemVals[ar.element] = ar.auto_value;
            }
          });
        }

        const baselineVals = {};
        if (sample.autoResults && sample.autoResults.length > 0) {
          sample.autoResults.forEach((ar) => {
            if (ELEMENT_NAMES[ar.element]) {
              baselineVals[ar.element] = ar.auto_value;
            }
          });
        }
        setMachineBaseline(baselineVals);

        if (Object.keys(elemVals).length > 0) {
          setElementValues(elemVals);
          const primKeyFromCat = PRIMARY_ELEMENT[parsedCat] || "Au";
          if (elemVals[primKeyFromCat] != null) {
            setPrimaryValue(elemVals[primKeyFromCat]);
          }
        }

        if (sample.readings) {
          const readingIds = new Set(sample.readings.map((r) => r.id));
          setSelectedReadingIds(readingIds);
        }

        sessionStorage.removeItem("editingSample");
      } catch (e) {
        console.error("Failed to load editing sample:", e);
      }
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetch("/api/readings")
      .then((r) => r.json())
      .then((data) => {
        setReadings(data);
      })
      .catch(console.error);
    if (!isLoadingEditRef.current) {
      fetchNextSrNo();
    }
  }, [fetchNextSrNo]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (nextItemTimerRef.current) clearTimeout(nextItemTimerRef.current);
    };
  }, []);

  // When sample category changes, rebalance Cu
  useEffect(() => {
    if (Object.keys(elementValues).length === 0) return;
    const newKey = PRIMARY_ELEMENT[sampleCat] || "Au";
    const prim = elementValues[newKey] ?? 0;
    setElementValues((prev) => {
      const sumOthers = Object.entries(prev)
        .filter(([k]) => k !== "Cu" && k !== newKey)
        .reduce((s, [, v]) => s + (v || 0), 0);
      return { ...prev, Cu: parseFloat((100 - prim - sumOthers).toFixed(3)) };
    });
  }, [sampleCat]);

  useEffect(() => {
    if (customerName) {
      clearFieldError("customerName");
    }
  }, [customerName, clearFieldError]);

  return {
    customerName,
    setCustomerName,
    mobile,
    setMobile,
    srNo,
    setSrNo,
    date,
    setDate,
    sampleType,
    setSampleType,
    weight,
    setWeight,
    sampleCat,
    setSampleCat,
    entryMode,
    setEntryMode,
    formErrors,
    setFormErrors,
    readings,
    selectedReadingIds,
    elementValues,
    setElementValues,
    machineBaseline,
    primaryValue,
    setPrimaryValue,
    primaryDraft,
    setPrimaryDraft,
    elementDrafts,
    setElementDrafts,
    saving,
    printing,
    editingSampleId,
    setEditingSampleId,
    isLoadingEditRef,
    nextItemTimerRef,
    profileFilter,
    setProfileFilter,

    primKey,
    displayPrim,
    impurity,
    elementSum,
    hasComposition,
    canSave,
    canPrint,
    machineDeltaRows: calculateDeltaRows(
      machineBaseline,
      elementValues,
      primKey,
      displayPrim,
    ),

    rebalanceCu,
    clearDrafts,
    clearAllErrors,
    setFieldError,
    clearFieldError,
    fetchNextSrNo,
    applyReadingsSelection,
    toggleReading,
    selectAllReadings,
    clearReadings,
    handleSelectLastN,
    handleElementChange,
    prepareNextItem,
    prepareFreshEntry,
    mapServerErrors,
    validateForm,
    saveSampleToDb,
    handleSave,
    handlePrint,
  };
}
