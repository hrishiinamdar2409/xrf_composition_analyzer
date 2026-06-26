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
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 8));
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

  // Helper function to format weight with 3 decimal places
  const formatWeight = useCallback((value) => {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(3);
  }, []);

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

  // Helper to get max date and time from selected readings
  const getMaxDateTimeFromReadings = useCallback(
    (readingIds) => {
      const subset = readings.filter((r) => readingIds.has(r.id));
      if (!subset.length) return null;

      let maxDateTime = null;

      subset.forEach((r) => {
        let readingDateTime = null;

        // Try to get date and time from reading_date + reading_time
        if (r.reading_date && r.reading_time) {
          // Format: DD-MM-YYYY HH:MM:SS
          const parts = r.reading_date.split("-");
          if (parts.length === 3) {
            // Convert DD-MM-YYYY to YYYY-MM-DD for JavaScript Date
            const isoDateStr = `${parts[2]}-${parts[1]}-${parts[0]}T${r.reading_time}`;
            const parsed = new Date(isoDateStr);
            if (!isNaN(parsed.getTime())) {
              readingDateTime = parsed;
            }
          }
        }

        // Fallback to arrived_at if reading_date/time not available
        if (!readingDateTime && r.arrived_at) {
          const dateObj = new Date(r.arrived_at);
          if (!isNaN(dateObj.getTime())) {
            readingDateTime = dateObj;
          }
        }

        // Update max date/time
        if (
          readingDateTime &&
          (!maxDateTime || readingDateTime > maxDateTime)
        ) {
          maxDateTime = readingDateTime;
        }
      });

      return maxDateTime;
    },
    [readings],
  );

  const applyReadingsSelection = useCallback(
    (readingIds) => {
      const subset = readings.filter((r) => readingIds.has(r.id));
      clearDrafts();

      if (!subset.length) {
        setElementValues({});
        setMachineBaseline({});
        setPrimaryValue(null);
        setCustomerName("");
        setSampleType("Gold Sample");
        setWeight("");
        setSampleCat("Gold");
        // Reset date to today and time to current time when no readings selected
        const now = new Date();
        setDate(now.toISOString().slice(0, 10));
        setTime(now.toTimeString().slice(0, 8));
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

      // Auto-populate Weight (handle zero values safely and format with 3 decimals)
      if (firstReading.weight != null) {
        setWeight(formatWeight(firstReading.weight));
      }

      // --- Get max date and time from all selected readings ---
      const maxDateTime = getMaxDateTimeFromReadings(readingIds);
      if (maxDateTime) {
        // Format date to YYYY-MM-DD for the date input
        const year = maxDateTime.getFullYear();
        const month = String(maxDateTime.getMonth() + 1).padStart(2, "0");
        const day = String(maxDateTime.getDate()).padStart(2, "0");
        setDate(`${year}-${month}-${day}`);

        // Format time to HH:MM:SS for the time input
        const hours = String(maxDateTime.getHours()).padStart(2, "0");
        const minutes = String(maxDateTime.getMinutes()).padStart(2, "0");
        const seconds = String(maxDateTime.getSeconds()).padStart(2, "0");
        setTime(`${hours}:${minutes}:${seconds}`);
      } else {
        // Fallback to current date/time if no valid date found
        const now = new Date();
        setDate(now.toISOString().slice(0, 10));
        setTime(now.toTimeString().slice(0, 8));
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
          // SUPPORT BACKEND SQL ALIAS: "x1 AS karat"
          let targetValue = r[sym];
          if (sym.toLowerCase() === 'x1' && r.karat !== undefined) {
            targetValue = r.karat;
          }

          if (targetValue !== undefined && elMap[sym] === undefined) {
            if (ELEMENT_NAMES[sym]) {
              elMap[sym] = targetValue;
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
    [
      clearDrafts,
      primKey,
      readings,
      rebalanceCu,
      filterValidElements,
      getMaxDateTimeFromReadings,
      formatWeight,
    ],
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
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    setTime(now.toTimeString().slice(0, 8));
    setSampleType("Gold Sample");
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
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    setTime(now.toTimeString().slice(0, 8));
    setWeight("");
    setSampleCat("Gold");
    setSampleType("Gold Sample");
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

    // Validate date and time together
    if (!date || !isValidIsoDate(date)) {
      errors.date = "Date must be a valid YYYY-MM-DD value.";
    }

    if (!time) {
      errors.time = "Time is required.";
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
    time,
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
        testTime: time || null,
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
    time,
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
        setTime(
          sample.created_at?.slice(11, 19) ||
            new Date().toTimeString().slice(0, 8),
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
        if (parsed.weight != null) setWeight(formatWeight(parsed.weight));
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
            if (wtMatch) setWeight(formatWeight(wtMatch[1]));
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
  }, [formatWeight]);

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
    time,
    setTime,
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