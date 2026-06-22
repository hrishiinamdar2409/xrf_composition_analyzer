import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast, Toaster } from "react-hot-toast";
import { 
  Table, 
  Button, 
  Input, 
  Space, 
  Tag, 
  Card, 
  Typography, 
  Select,
  Tooltip,
  Badge,
} from "antd";
import { 
  ReloadOutlined, 
  SearchOutlined, 
  PrinterOutlined, 
  EditOutlined, 
  RedoOutlined,
  ClearOutlined,
  EyeOutlined
} from "@ant-design/icons";
import "antd/dist/reset.css";

const { Title } = Typography;
const { Option } = Select;

const STATUS_LABELS = {
  pending_review: {
    label: "Pending Review",
    color: "warning",
  },
  expert_review: {
    label: "Expert Review",
    color: "processing",
  },
  approved: { 
    label: "Approved", 
    color: "success",
  },
  report_generated: { 
    label: "Printed", 
    color: "success",
  },
};

export default function SamplesPage() {
  const navigate = useNavigate();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingStates, setLoadingStates] = useState({});
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 25,
    total: 0,
  });
  const [sortedInfo, setSortedInfo] = useState({
    columnKey: 'created_at',
    order: 'descend',
  });

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/samples");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || "Failed to fetch samples");
      }
      const data = await response.json();
      setSamples(data);
      setPagination(prev => ({ ...prev, total: data.length }));
    } catch (error) {
      console.error("Error fetching samples:", error);
      toast.error(error.message || "Failed to load samples");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and event listeners
  useEffect(() => {
    fetchSamples();

    // Listen for sample saved events from the readings page
    const handleSampleSaved = (event) => {
      console.log("Sample saved event received:", event.detail);
      // Refresh the samples list after a short delay
      setTimeout(() => {
        fetchSamples();
      }, 500);
    };

    // Listen for print events
    const handleSamplePrinted = (event) => {
      console.log("Sample printed event received:", event.detail);
      fetchSamples();
    };

    window.addEventListener('sampleSaved', handleSampleSaved);
    window.addEventListener('samplePrinted', handleSamplePrinted);

    return () => {
      window.removeEventListener('sampleSaved', handleSampleSaved);
      window.removeEventListener('samplePrinted', handleSamplePrinted);
    };
  }, [fetchSamples]);

  const handleModify = async (sampleId) => {
    setLoadingStates(prev => ({ ...prev, [sampleId]: true }));
    try {
      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to load sample");
      const sample = await res.json();
      sessionStorage.setItem("editingSample", JSON.stringify(sample));
      navigate("/", { state: { editSampleId: sampleId } });
    } catch (err) {
      console.error(err);
      toast.error("Could not load sample for editing");
    } finally {
      setLoadingStates(prev => ({ ...prev, [sampleId]: false }));
    }
  };

  const handleRevise = async (sampleId) => {
    setLoadingStates(prev => ({ ...prev, [sampleId]: true }));
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
      setLoadingStates(prev => ({ ...prev, [sampleId]: false }));
    }
  };

  const handlePrint = async (sampleId, jobRef) => {
    setLoadingStates(prev => ({ ...prev, [`print_${sampleId}`]: true }));
    try {
      const res = await fetch(`/api/samples/${sampleId}/report`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body?.detail || body?.error || "Print failed");
      
      toast.success(
        `Print job sent${body?.printer ? ` to ${body.printer}` : ""} for ${jobRef}`,
        { duration: 3000, position: 'top-right' }
      );
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('samplePrinted', { 
        detail: { sampleId, jobRef }
      }));
      
      fetchSamples();
    } catch (err) {
      console.error(err);
      toast.error(err.message || `Could not print report for ${jobRef}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`print_${sampleId}`]: false }));
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
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handlePageSizeChange = (value) => {
    setPagination(prev => ({ ...prev, pageSize: value, current: 1 }));
  };

  // Filter samples based on search text
  const filteredSamples = samples.filter(sample => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    const srNo = sample.parsedItemDesc?.srNo || sample.job_ref || "";
    const customer = sample.customer_name || "";
    const metal = sample.parsedItemDesc?.sampleCat || "";
    const mobile = sample.parsedItemDesc?.mobile || "";
    const jobRef = sample.job_ref || "";
    const sampleType = sample.parsedItemDesc?.sampleType || "";
    
    return (
      srNo.toString().toLowerCase().includes(searchLower) ||
      customer.toLowerCase().includes(searchLower) ||
      metal.toLowerCase().includes(searchLower) ||
      mobile.toLowerCase().includes(searchLower) ||
      jobRef.toLowerCase().includes(searchLower) ||
      sampleType.toLowerCase().includes(searchLower)
    );
  });

  // Update pagination total when filtering
  useEffect(() => {
    setPagination(prev => ({ ...prev, total: filteredSamples.length, current: 1 }));
  }, [searchText]);

  // Table columns configuration
  const columns = [
    {
      title: 'SR NO',
      dataIndex: ['parsedItemDesc', 'srNo'],
      key: 'sr_no',
      width: 100,
      sorter: (a, b) => {
        const aVal = a.parsedItemDesc?.srNo || a.job_ref || "";
        const bVal = b.parsedItemDesc?.srNo || b.job_ref || "";
        return aVal.toString().localeCompare(bVal.toString());
      },
      sortOrder: sortedInfo.columnKey === 'sr_no' && sortedInfo.order,
      render: (text, record) => (
        <span style={{ fontWeight: 600, color: '#1e293b' }}>
          {text || record.job_ref || '—'}
        </span>
      ),
    },
    {
      title: 'CUSTOMER',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 150,
      sorter: (a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""),
      sortOrder: sortedInfo.columnKey === 'customer_name' && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: 'METAL',
      dataIndex: ['parsedItemDesc', 'sampleCat'],
      key: 'metal',
      width: 100,
      sorter: (a, b) => (a.parsedItemDesc?.sampleCat || "").localeCompare(b.parsedItemDesc?.sampleCat || ""),
      sortOrder: sortedInfo.columnKey === 'metal' && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: 'TYPE',
      dataIndex: ['parsedItemDesc', 'sampleType'],
      key: 'type',
      width: 120,
      sorter: (a, b) => (a.parsedItemDesc?.sampleType || "").localeCompare(b.parsedItemDesc?.sampleType || ""),
      sortOrder: sortedInfo.columnKey === 'type' && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: 'MOBILE',
      dataIndex: ['parsedItemDesc', 'mobile'],
      key: 'mobile',
      width: 120,
      sorter: (a, b) => (a.parsedItemDesc?.mobile || "").localeCompare(b.parsedItemDesc?.mobile || ""),
      sortOrder: sortedInfo.columnKey === 'mobile' && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: 'WT (G)',
      dataIndex: ['parsedItemDesc', 'weight'],
      key: 'weight',
      width: 80,
      align: 'center',
      sorter: (a, b) => {
        const aVal = parseFloat(a.parsedItemDesc?.weight) || 0;
        const bVal = parseFloat(b.parsedItemDesc?.weight) || 0;
        return aVal - bVal;
      },
      sortOrder: sortedInfo.columnKey === 'weight' && sortedInfo.order,
      render: (text) => text || "—",
    },
    {
      title: 'READINGS',
      key: 'readings',
      width: 120,
      align: 'center',
      sorter: (a, b) => (a.reading_count || 0) - (b.reading_count || 0),
      sortOrder: sortedInfo.columnKey === 'readings' && sortedInfo.order,
      render: (_, record) => {
        const readingCount = record.reading_count || 0;
        const readings = record.readings || [];
        return (
          <div>
            <Badge count={readingCount} showZero style={{ backgroundColor: '#3b82f6' }} />
            {readings.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {readings.slice(0, 3).map((r) => (
                  <Tooltip key={r.id} title={r.excluded ? `Reading ${r.nbr || r.num} (excluded)` : `Reading ${r.nbr || r.num}`}>
                    <Tag 
                      color={r.excluded ? "default" : "blue"}
                      style={{ 
                        margin: '2px',
                        opacity: r.excluded ? 0.5 : 1,
                        textDecoration: r.excluded ? 'line-through' : 'none'
                      }}
                    >
                      {r.nbr || r.num}
                    </Tag>
                  </Tooltip>
                ))}
                {readings.length > 3 && (
                  <Tooltip title={readings.slice(3).map(r => `${r.nbr || r.num}`).join(', ')}>
                    <Tag style={{ margin: '2px', cursor: 'pointer' }}>
                      +{readings.length - 3}
                    </Tag>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'ELEMENTS',
      key: 'elements',
      width: 300,
      render: (_, record) => {
        const elements = record.elementResults || [];
        const AU_ORDER = ["Au", "Ag", "Cu", "Pt", "Pd"];
        const sorted = [...elements].sort((a, b) => {
          const ai = AU_ORDER.indexOf(a.element);
          const bi = AU_ORDER.indexOf(b.element);
          if (ai === -1 && bi === -1) return a.element.localeCompare(b.element);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sorted.length === 0 ? (
              <span style={{ color: '#94a3b8' }}>—</span>
            ) : (
              sorted.slice(0, 5).map((el) => (
                <Tag 
                  key={el.element}
                  color={el.element === "Au" ? "gold" : el.element === "Ag" ? "cyan" : "default"}
                  style={{ margin: 0 }}
                >
                  {el.element}: {el.value != null ? Number(el.value).toFixed(2) : "—"}%
                </Tag>
              ))
            )}
            {sorted.length > 5 && (
              <Tooltip title={sorted.slice(5).map(el => `${el.element}: ${Number(el.value).toFixed(2)}%`).join(', ')}>
                <Tag style={{ margin: 0, cursor: 'pointer' }}>
                  +{sorted.length - 5}
                </Tag>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      align: 'center',
      sorter: (a, b) => {
        const aStatus = STATUS_LABELS[a.status]?.label || a.status;
        const bStatus = STATUS_LABELS[b.status]?.label || b.status;
        return aStatus.localeCompare(bStatus);
      },
      sortOrder: sortedInfo.columnKey === 'status' && sortedInfo.order,
      render: (status) => {
        const statusInfo = STATUS_LABELS[status] || { label: status || 'Unknown', color: "default" };
        return (
          <Tag color={statusInfo.color} style={{ fontSize: '12px', padding: '2px 12px' }}>
            {statusInfo.label}
          </Tag>
        );
      },
    },
    {
      title: 'CREATED',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      align: 'center',
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      sortOrder: sortedInfo.columnKey === 'created_at' && sortedInfo.order,
      defaultSortOrder: 'descend',
      render: (date) => date ? new Date(date).toLocaleDateString("en-GB") : "—",
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 200,
      align: 'center',
      fixed: 'right',
      render: (_, record) => {
        const statusInfo = STATUS_LABELS[record.status] || { label: record.status };
        const isPrinted = statusInfo.label === "Printed" || record.status === 'report_generated';
        const isPrinting = loadingStates[`print_${record.id}`];
        const isModifying = loadingStates[record.id];
        
        return (
          <Space size="small">
            <Tooltip title="View Sample">
              <Button
                icon={<EyeOutlined />}
                size="small"
                onClick={() => handleModify(record.id)}
              >
                View
              </Button>
            </Tooltip>
            <Tooltip title={isPrinted ? "Re-print Report" : "Print Report"}>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                size="small"
                onClick={() => handlePrint(record.id, record.job_ref)}
                loading={isPrinting}
                disabled={isPrinting}
              >
                Print
              </Button>
            </Tooltip>
            <Tooltip title={isPrinted ? "Revise Sample" : "Modify Sample"}>
              <Button
                icon={isPrinted ? <RedoOutlined /> : <EditOutlined />}
                size="small"
                onClick={() => isPrinted ? handleRevise(record.id) : handleModify(record.id)}
                loading={isModifying}
                disabled={isModifying}
              >
                {isPrinted ? "Revise" : "Modify"}
              </Button>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const pendingCount = samples.filter(s => s.status === 'pending_review' || s.status === 'expert_review').length;

  return (
    <div style={{ padding: '24px', background: '#f5f7fa', minHeight: '100vh' }}>
      <Toaster position="top-right" />
      
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <Title level={3} style={{ margin: 0, color: '#1e293b' }}>
            REPORTS QUEUE
            {pendingCount > 0 && (
              <Badge 
                count={pendingCount} 
                style={{ marginLeft: 12, backgroundColor: '#f59e0b' }}
              />
            )}
          </Title>
          
          <Space>
            <Input
              placeholder="Search by Sr No, Customer, Metal, Mobile, or Job Ref..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              suffix={searchText && (
                <ClearOutlined 
                  style={{ color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => handleSearch('')}
                />
              )}
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 350 }}
              allowClear
            />
            
            <Select
              defaultValue={25}
              onChange={handlePageSizeChange}
              style={{ width: 120 }}
            >
              <Option value={10}>10 / page</Option>
              <Option value={25}>25 / page</Option>
              <Option value={50}>50 / page</Option>
              <Option value={100}>100 / page</Option>
            </Select>
            
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchSamples}
              loading={loading}
            >
              Refresh
            </Button>
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
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
            position: ['bottomCenter'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1600 }}
          bordered
          style={{ 
            background: 'white',
            borderRadius: 8,
          }}
          rowClassName={(record, index) => index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}
        />
      </Card>

      <style>{`
        .table-row-even {
          background-color: #ffffff;
        }
        .table-row-odd {
          background-color: #fafbff;
        }
        .ant-table-thead > tr > th {
          background-color: #f8fafc !important;
          font-weight: 600 !important;
          color: #475569 !important;
          border-bottom: 2px solid #e2e8f0 !important;
        }
        .ant-table-tbody > tr:hover > td {
          background-color: #f1f5f9 !important;
        }
        .ant-tag {
          border-radius: 6px;
        }
        .ant-badge-count {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}