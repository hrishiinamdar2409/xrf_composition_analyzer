import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";

const STATUS_LABELS = {
  pending_review: {
    label: "Not Yet Printed",
    cls: "bg-yellow-100 text-yellow-700",
  },
  expert_review: {
    label: "Not Yet Printed",
    cls: "bg-yellow-100 text-yellow-700",
  },
  approved: { label: "Not Yet Printed", cls: "bg-yellow-100 text-yellow-700" },
  report_generated: { label: "Printed", cls: "bg-green-100 text-green-700" },
};

export default function SamplesPage() {
  const navigate = useNavigate();
  const [samples, setSamples] = useState([]);
  const [loadingSample, setLoadingSample] = useState(null);
  const [printingSample, setPrintingSample] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSamples = () => {
    setLoading(true);
    fetch("/api/samples")
      .then((r) => r.json())
      .then((data) => {
        setSamples(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load samples");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSamples();
  }, []);

  const handleModify = async (sampleId) => {
    setLoadingSample(sampleId);
    try {
      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to load sample");
      const sample = await res.json();
      // Store sample data in session storage so Dashboard can retrieve it
      sessionStorage.setItem("editingSample", JSON.stringify(sample));
      navigate("/", { state: { editSampleId: sampleId } });
    } catch (err) {
      console.error(err);
      toast.error("Could not load sample for editing");
    } finally {
      setLoadingSample(null);
    }
  };

  const handleRevise = async (sampleId) => {
    setLoadingSample(sampleId);
    try {
      const reviseRes = await fetch(`/api/samples/${sampleId}/revise`, {
        method: "POST",
      });
      const reviseBody = await reviseRes.json().catch(() => ({}));
      if (!reviseRes.ok)
        throw new Error(
          reviseBody?.detail || reviseBody?.error || "Could not revise sample",
        );

      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to load sample");
      const sample = await res.json();
      sessionStorage.setItem("editingSample", JSON.stringify(sample));
      navigate("/", { state: { editSampleId: sampleId } });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Could not revise sample");
    } finally {
      setLoadingSample(null);
    }
  };

  const handlePrint = async (sampleId, jobRef) => {
    setPrintingSample(sampleId);
    try {
      const res = await fetch(`/api/samples/${sampleId}/report`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body?.detail || body?.error || "Print failed");
      toast.success(
        `Print job sent${body?.printer ? ` to ${body.printer}` : ""} for ${jobRef}`,
      );
      fetchSamples(); // Refresh to update status
    } catch (err) {
      console.error(err);
      toast.error(err.message || `Could not print report for ${jobRef}`);
    } finally {
      setPrintingSample(null);
    }
  };

  return (
    <div className="w-full">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">REPORTS QUEUE</h1>
        <button
          onClick={fetchSamples}
          className="h-8 px-3 bg-[#1a73ca] hover:bg-[#1a73ca] text-white rounded text-xs font-semibold transition-colors active:scale-95"
        >
          🔄 Refresh
        </button>
      </div>

      {loading && (
        <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
          <p className="text-slate-400 text-sm">⏳ Loading reports…</p>
        </div>
      )}

      {!loading && samples.length === 0 && (
        <div className="bg-slate-100 rounded-lg p-8 text-center">
          <p className="text-slate-500 text-sm">
            No reports yet. Go to Dashboard and SAVE a sample to see it here.
          </p>
        </div>
      )}

      {!loading && samples.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-300 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Sr No</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Metal</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Mobile</th>
                <th className="px-3 py-2 text-center">Wt (g)</th>
                <th className="px-3 py-2 text-center">Readings</th>
                <th className="px-3 py-2 text-left">Element Results</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Created</th>
                <th className="px-3 py-2 text-center">Modified</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {samples.map((s, idx) => {
                const st = STATUS_LABELS[s.status] || {
                  label: s.status,
                  cls: "bg-gray-100 text-gray-600",
                };
                const { sampleCat, sampleType, weight, srNo, mobile } =
                  s.parsedItemDesc || {};
                const readingCount = s.reading_count || 0;
                const readings = s.readings || [];
                const createdDate = new Date(s.created_at).toLocaleDateString(
                  "en-GB",
                );
                const modifiedDate = s.updated_at
                  ? new Date(s.updated_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                // Build element results display
                const elements = s.elementResults || [];
                const AU_ORDER = ["Au", "Ag", "Cu", "Pt", "Pd"];
                const sorted = [...elements].sort((a, b) => {
                  const ai = AU_ORDER.indexOf(a.element);
                  const bi = AU_ORDER.indexOf(b.element);
                  if (ai === -1 && bi === -1)
                    return a.element.localeCompare(b.element);
                  if (ai === -1) return 1;
                  if (bi === -1) return -1;
                  return ai - bi;
                });

                return (
                  <tr
                    key={s.id}
                    className={idx % 2 === 0 ? "bg-slate-800" : "bg-slate-750"}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold text-amber-400">
                      {srNo || s.job_ref}
                    </td>
                    <td className="px-3 py-2.5 text-slate-200">
                      {s.customer_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {sampleCat || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 text-xs">
                      {sampleType || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">
                      {mobile || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-300">
                      {weight || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-300">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold">{readingCount}</span>
                        {readings.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-0.5">
                            {readings.map((r) => (
                              <span
                                key={r.id}
                                title={
                                  r.excluded
                                    ? `#${r.nbr || r.num} (excluded)`
                                    : `#${r.nbr || r.num}`
                                }
                                className={`text-[10px] font-mono px-1 rounded ${
                                  r.excluded
                                    ? "bg-slate-600 text-slate-400 line-through"
                                    : "bg-slate-600 text-slate-200"
                                }`}
                              >
                                {r.nbr || r.num}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {sorted.length === 0 ? (
                        <span className="text-slate-500 text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          {sorted.map((el) => (
                            <span
                              key={el.element}
                              className={`text-xs font-mono whitespace-nowrap ${
                                el.element === "Au"
                                  ? "text-amber-400 font-bold"
                                  : el.element === "Ag"
                                    ? "text-slate-300"
                                    : "text-slate-400"
                              }`}
                            >
                              {el.element}:
                              {el.value != null
                                ? Number(el.value).toFixed(2)
                                : "—"}
                              %
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-400">
                      {createdDate}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-400">
                      {modifiedDate}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handlePrint(s.id, s.job_ref)}
                          disabled={printingSample === s.id}
                          title="Send direct print job"
                          className="h-7 px-2 bg-[#1a73ca] hover:bg-[#1a73ca] text-white rounded text-xs font-semibold transition-colors active:scale-95 disabled:opacity-50"
                        >
                          {printingSample === s.id
                            ? "⏳ Printing…"
                            : "🖨 Print"}
                        </button>
                        <button
                          onClick={() =>
                            st.label === "Printed"
                              ? handleRevise(s.id)
                              : handleModify(s.id)
                          }
                          disabled={loadingSample === s.id}
                          title={
                            st.label === "Printed"
                              ? "Re-open printed sample for revision"
                              : "Load for editing on Dashboard"
                          }
                          className="h-7 px-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-semibold transition-colors disabled:opacity-50 active:scale-95"
                        >
                          {loadingSample === s.id
                            ? "⏳ ..."
                            : st.label === "Printed"
                              ? "↺ Revise"
                              : "✎ Modify"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
