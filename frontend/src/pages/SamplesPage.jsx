import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from "react-hot-toast";
import {
  Table,
  Button,
  Input,
  Space,
  Typography,
  Select,
  Tooltip,
  Popover,
} from "antd";
import {
  ReloadOutlined,
  SearchOutlined,
  PrinterOutlined,
  EditOutlined,
  RedoOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import "antd/dist/reset.css";

const { Title } = Typography;
const { Option } = Select;

const getStatus = (isPrinted) =>
  isPrinted
    ? { label: "Printed", color: "#10b981" }
    : { label: "Pending", color: "#f59e0b" };

export default function SamplesPage() {
  const navigate = useNavigate();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStates] = useState({});
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [sortedInfo, setSortedInfo] = useState({
    columnKey: "created_at",
    order: "descend",
  });

  // Lock body scroll while on this page
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/samples");
      if (!response.ok) throw new Error("Failed to fetch samples");
      const data = await response.json();
      setSamples(data);
      setPagination((prev) => ({ ...prev, total: data.length }));
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to load samples");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSamples();
    const handleSampleSaved = () => setTimeout(fetchSamples, 500);
    const handleSamplePrinted = () => fetchSamples();
    window.addEventListener("sampleSaved", handleSampleSaved);
    window.addEventListener("samplePrinted", handleSamplePrinted);
    return () => {
      window.removeEventListener("sampleSaved", handleSampleSaved);
      window.removeEventListener("samplePrinted", handleSamplePrinted);
    };
  }, [fetchSamples]);

  // ─── Action Handlers ──────────────────────────────

  const handleEdit = async (sampleId) => {
    setLoadingStates((prev) => ({ ...prev, [sampleId]: true }));
    try {
      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to load sample");
      const sample = await res.json();
      sessionStorage.setItem("editingSample", JSON.stringify(sample));
      navigate("/", { state: { editSampleId: sampleId } });
    } catch (err) {
      toast.error("Could not load sample for editing");
    } finally {
      setLoadingStates((prev) => ({ ...prev, [sampleId]: false }));
    }
  };

  const handleRevise = async (sampleId) => {
    setLoadingStates((prev) => ({ ...prev, [sampleId]: true }));
    try {
      const reviseRes = await fetch(`/api/samples/${sampleId}/revise`, {
        method: "POST",
      });
      const reviseBody = await reviseRes.json().catch(() => ({}));
      if (!reviseRes.ok)
        throw new Error(reviseBody?.detail || reviseBody?.error || "Could not revise sample");

      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to load sample");
      const sample = await res.json();
      sessionStorage.setItem("editingSample", JSON.stringify(sample));
      navigate("/", { state: { editSampleId: sampleId } });
    } catch (err) {
      toast.error(err.message || "Could not revise sample");
    } finally {
      setLoadingStates((prev) => ({ ...prev, [sampleId]: false }));
    }
  };

  const handlePrint = async (sampleId, srNo) => {
    setLoadingStates((prev) => ({ ...prev, [`print_${sampleId}`]: true }));
    try {
      const res = await fetch(`/api/samples/${sampleId}/report`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || body?.error || "Print failed");
      toast.success(`Print job sent${body?.printer ? ` to ${body.printer}` : ""} for ${srNo}`);
      window.dispatchEvent(new CustomEvent("samplePrinted", { detail: { sampleId, srNo } }));
      fetchSamples();
    } catch (err) {
      toast.error(err.message || `Could not print report for ${srNo}`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [`print_${sampleId}`]: false }));
    }
  };

  const handleTableChange = (pagination, filters, sorter) => {
    setPagination({
      ...pagination,
      current: pagination.current,
      pageSize: pagination.pageSize,
      total: samples.length,
    });
    setSortedInfo(sorter);
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const filteredSamples = samples.filter((sample) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      (sample.sr_no || "").toLowerCase().includes(q) ||
      (sample.customer_name || "").toLowerCase().includes(q) ||
      (sample.parsedItemDesc?.sampleCat || "").toLowerCase().includes(q) ||
      (sample.parsedItemDesc?.sampleType || "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, total: filteredSamples.length, current: 1 }));
  }, [searchText]);

  const renderElementsPopover = (elements) => (
    <div style={{ maxHeight: 220, overflow: "auto", minWidth: 160, fontSize: 12 }}>
      <table style={{ width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ textAlign: "left", padding: "2px 6px", fontWeight: 500 }}>El</th>
            <th style={{ textAlign: "right", padding: "2px 6px", fontWeight: 500 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((el) => (
            <tr key={el.element} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "1px 6px" }}>{el.element}</td>
              <td style={{ padding: "1px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {el.value != null ? Number(el.value).toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const columns = [
    {
      title: "SR",
      dataIndex: "sr_no",
      key: "sr_no",
      width: 60,
      sorter: (a, b) => (a.sr_no || "").localeCompare(b.sr_no || ""),
      sortOrder: sortedInfo.columnKey === "sr_no" && sortedInfo.order,
      render: (text) => <span style={{ fontWeight: 500, color: "#0f172a" }}>{text || "—"}</span>,
    },
    {
      title: "Customer",
      dataIndex: "customer_name",
      key: "customer_name",
      width: 100,
      ellipsis: true,
      sorter: (a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""),
      sortOrder: sortedInfo.columnKey === "customer_name" && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: "Metal",
      dataIndex: ["parsedItemDesc", "sampleCat"],
      key: "metal",
      width: 70,
      sorter: (a, b) => (a.parsedItemDesc?.sampleCat || "").localeCompare(b.parsedItemDesc?.sampleCat || ""),
      sortOrder: sortedInfo.columnKey === "metal" && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: "Type",
      dataIndex: ["parsedItemDesc", "sampleType"],
      key: "type",
      width: 90,
      ellipsis: true,
      sorter: (a, b) => (a.parsedItemDesc?.sampleType || "").localeCompare(b.parsedItemDesc?.sampleType || ""),
      sortOrder: sortedInfo.columnKey === "type" && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: "Wt (g)",
      dataIndex: ["parsedItemDesc", "weight"],
      key: "weight",
      width: 70,
      align: "right",
      sorter: (a, b) => (parseFloat(a.parsedItemDesc?.weight) || 0) - (parseFloat(b.parsedItemDesc?.weight) || 0),
      sortOrder: sortedInfo.columnKey === "weight" && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: "Rdgs",
      key: "readings",
      width: 70,
      align: "left",
      sorter: (a, b) => (a.reading_count || 0) - (b.reading_count || 0),
      sortOrder: sortedInfo.columnKey === "readings" && sortedInfo.order,
      render: (_, record) => {
        const readings = record.readings || [];
        if (readings.length === 0) return <span style={{ color: "#94a3b8" }}>—</span>;

        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
            {readings.map((r) => {
              const num = r.nbr || r.num || r.id;
              const isExcluded = r.excluded;
              return (
                <span
                  key={r.id}
                  style={{
                    display: "inline-block",
                    padding: "0 5px",
                    borderRadius: 3,
                    backgroundColor: isExcluded ? "#f1f5f9" : "#dbeafe",
                    border: isExcluded ? "1px solid #e2e8f0" : "1px solid #bfdbfe",
                    fontSize: 11,
                    lineHeight: "18px",
                    color: isExcluded ? "#94a3b8" : "#1e40af",
                    textDecoration: isExcluded ? "line-through" : "none",
                    fontWeight: 500,
                  }}
                >
                  {num}
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      title: "Composition",
      key: "elements",
      width: 160,
      render: (_, record) => {
        const elements = record.elementResults || [];
        const PRIORITY = ["Au", "Ag", "Cu", "Pt", "Pd"];
        const sorted = [...elements].sort((a, b) => {
          const ai = PRIORITY.indexOf(a.element);
          const bi = PRIORITY.indexOf(b.element);
          if (ai === -1 && bi === -1) return a.element.localeCompare(b.element);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        if (sorted.length === 0) return <span style={{ color: "#94a3b8" }}>—</span>;

        const visible = sorted.slice(0, 3);
        const hidden = sorted.slice(3);
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
            {visible.map((el) => (
              <span
                key={el.element}
                style={{
                  display: "inline-block",
                  padding: "0 4px",
                  borderRadius: 3,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: 11,
                  color: "#334155",
                  lineHeight: "18px",
                  fontWeight: el.element === "Au" ? 600 : 400,
                }}
              >
                {el.element}: {el.value != null ? Number(el.value).toFixed(2) : "—"}%
              </span>
            ))}
            {hidden.length > 0 && (
              <Popover
                content={renderElementsPopover(sorted)}
                title="Full composition"
                trigger="hover"
                placement="bottomLeft"
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "0 6px",
                    borderRadius: 3,
                    backgroundColor: "#f1f5f9",
                    border: "1px dashed #cbd5e1",
                    fontSize: 11,
                    color: "#475569",
                    cursor: "pointer",
                    lineHeight: "18px",
                  }}
                >
                  +{hidden.length}
                </span>
              </Popover>
            )}
          </div>
        );
      },
    },
    {
      title: "Status",
      key: "status",
      width: 80,
      align: "center",
      sorter: (a, b) => (a.is_printed ? 1 : 0) - (b.is_printed ? 1 : 0),
      sortOrder: sortedInfo.columnKey === "status" && sortedInfo.order,
      render: (_, record) => {
        const status = getStatus(record.is_printed);
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: status.color, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "#334155" }}>{status.label}</span>
          </div>
        );
      },
    },
    {
      title: "Created",
      dataIndex: "created_at",
      key: "created_at",
      width: 90,
      align: "center",
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      defaultSortOrder: "descend",
      sortOrder: sortedInfo.columnKey === "created_at" && sortedInfo.order,
      render: (date) => (date ? new Date(date).toLocaleDateString("en-GB") : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "center",
      render: (_, record) => {
        const isPrinted = record.is_printed;
        const isPrinting = loadingStates[`print_${record.id}`];
        const isModifying = loadingStates[record.id];

        return (
          <Space size={4}>
            <Tooltip title={isPrinted ? "Reprint" : "Print"}>
              <Button
                icon={<PrinterOutlined />}
                size="small"
                type="text"
                onClick={() => handlePrint(record.id, record.sr_no)}
                loading={isPrinting}
                disabled={isPrinting}
              />
            </Tooltip>
            <Tooltip title={isPrinted ? "Revise" : "Edit"}>
              <Button
                icon={isPrinted ? <RedoOutlined /> : <EditOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  isPrinted ? handleRevise(record.id) : handleEdit(record.id)
                }
                loading={isModifying}
                disabled={isModifying}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const pendingCount = samples.filter((s) => !s.is_printed).length;

  return (
    <div
      style={{
        height: "100%",
        backgroundColor: "#f0f2f5",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        padding: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <Toaster
        position="top-right"
        toastOptions={{
          style: { borderRadius: 8, background: "#1e293b", color: "#fff", fontSize: 14 },
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          overflow: "visible",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            borderRadius: "12px 12px 0 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <Title
              level={5}
              style={{ margin: 0, fontWeight: 600, color: "#ffffff", letterSpacing: "-0.2px" }}
            >
              Testing Reports
            </Title>
            {pendingCount > 0 && (
              <span
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  color: "#ffffff",
                  padding: "1px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {pendingCount} pending
              </span>
            )}
          </div>
          <Space size={8}>
            <Input
              placeholder="Search…"
              prefix={<SearchOutlined style={{ color: "rgba(255,255,255,0.7)" }} />}
              suffix={
                searchText && (
                  <ClearOutlined
                    style={{ color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
                    onClick={() => handleSearch("")}
                  />
                )
              }
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: 180,
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#ffffff",
              }}
              allowClear
              bordered={false}
              className="header-search"
            />
            <Select
              defaultValue={10}
              onChange={(v) =>
                setPagination((prev) => ({ ...prev, pageSize: v, current: 1 }))
              }
              style={{ width: 70, borderRadius: 6 }}
              dropdownStyle={{ borderRadius: 6 }}
            >
              <Option value={8}>8</Option>
              <Option value={10}>10</Option>
              <Option value={12}>12</Option>
              <Option value={15}>15</Option>
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchSamples}
              loading={loading}
              type="text"
              style={{ color: "#ffffff", opacity: 0.8 }}
            />
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={filteredSamples}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            position: ["bottomCenter"],
            size: "small",
          }}
          onChange={handleTableChange}
          size="small"
          rowClassName={() => "compact-row"}
        />
      </div>

      <style>{`
        .ant-table {
          font-size: 12px !important;
        }
        .ant-table-thead > tr > th {
          background: transparent !important;
          color: #64748b !important;
          font-weight: 700 !important;
          border-bottom: 2px solid #e2e8f0 !important;
          text-transform: uppercase;
          font-size: 10px !important;
          letter-spacing: 0.5px;
          padding: 4px 12px !important;
        }
        .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f1f5f9 !important;
          padding: 4px 12px !important;
          color: #334155;
          transition: background 0.15s;
          vertical-align: middle;
        }
        .compact-row:hover td {
          background-color: #f8fafd !important;
        }
        .ant-table-tbody > tr:last-child > td {
          border-bottom: none !important;
        }
        .ant-pagination-item-active {
          border-color: #3b82f6 !important;
          background: #eff6ff !important;
          border-radius: 4px;
        }
        .ant-pagination-item-active a {
          color: #2563eb !important;
        }
        .header-search input {
          color: #ffffff !important;
        }
        .header-search input::placeholder {
          color: rgba(255,255,255,0.6) !important;
        }
        .ant-select-selector {
          border-radius: 6px !important;
          font-size: 12px;
        }
        .ant-btn-text {
          color: #64748b;
        }
        .ant-btn-text:hover {
          background: #f1f5f9 !important;
        }
        .ant-badge-count {
          font-size: 11px;
          height: 18px;
          min-width: 18px;
          line-height: 18px;
        }
        .ant-table table {
          border-collapse: collapse;
        }
      `}</style>
    </div>
  );
}