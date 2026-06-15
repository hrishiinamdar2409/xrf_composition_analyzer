# WinFTM® Export — Technical Reference Document
### Project: Fischer GOLDSCOPE SD Dashboard App
**Created:** May 14, 2026  
**Purpose:** Complete technical reference for integrating with WinFTM® software data export. This document covers all confirmed findings from official Fischer documentation and manuals, to be used as the foundation for building the data logger and reporting dashboard application.

---

## 1. Overview

The **Fischer GOLDSCOPE SD 550** (and related FISCHERSCOPE X-RAY family) runs on a Windows PC using **WinFTM®** (Windows Fischer Test Management) software. WinFTM has a built-in data export feature that can automatically write measurement results to a file after every test — without any manual intervention.

Our application integrates with this export by:
1. Instructing business owners to enable the **Online Export** feature in WinFTM (one-time setup, 5 minutes)
2. Watching the export destination file/folder for new data
3. Parsing the tab-separated `.exp` file format
4. Storing results in a local SQLite database
5. Displaying live data on a web dashboard

---

## 2. WinFTM® Software — Background

| Property | Value |
|---|---|
| **Full name** | Windows Fischer Test Management |
| **Manufacturer** | Helmut Fischer GmbH, Germany |
| **Used on machines** | GOLDSCOPE SD, GOLDSCOPE SD 600, FISCHERSCOPE X-RAY series |
| **Platform** | Windows PC (desktop software) |
| **Successor software** | FISIQ® X (for newer XDAL/XDV models) |
| **Export feature** | Built-in, official, documented |

---

## 3. Enabling the Export in WinFTM (Customer Setup Guide)

### Menu Path (Confirmed)
```
Evaluation → Export → Export Setup...
```
This opens the **"Exporting Data"** dialog window.

### Settings to Configure

| Setting | Value to Set | Notes |
|---|---|---|
| **Online-Export ON** | ✅ Check this box | Enables automatic export after every test |
| **Template** | `default` | Built-in template, already installed |
| **Export destination** | `append to file` | Appends each result; never deletes old data |
| **Destination file** | `C:\FischerExport\results.exp` | Create this folder first |

### What NOT to Touch
- Measurement tasks or products
- Calibration settings
- X-ray tube / detector settings
- Any other export templates (don't modify, just select `default`)
- RS-232 / TCP-IP settings (not needed for file-based approach)

### Safety Notes
> Enabling the export adds a **write-only output** to WinFTM. It does NOT change any measurement logic, calibration, or existing configuration. The machine measures exactly as before. WinFTM simply also writes results to the export file. Risk of interference: **zero**.

---

## 4. Export Modes

WinFTM supports two export modes:

| Mode | Behaviour | Use in Our App |
|---|---|---|
| **Online Export** | Data exported automatically after every measurement | ✅ Primary method |
| **Export on Demand** | Manual trigger via `Evaluation → Evaluate All Blocks` | ❌ Not automatic |

### Online Export Triggers (what causes a write to the file)

| Trigger | Data Written |
|---|---|
| After **every single measurement** | Single reading row |
| When a **block is closed** (auto or manual) | Block statistics row |
| When a **product is selected/loaded** | Header row |

---

## 5. Export File Format

### File Extension
```
.exp
```
Example filename: `results.exp` or `#002.exp`

### Encoding & Separators
| Property | Value |
|---|---|
| **Separator** | Tab (`\t`) — variable `@TAB` in template |
| **Line ending** | CRLF (`\r\n`) — variables `@CRX` + `@LFX` |
| **Decimal character** | Period `.` (not comma) |
| **Encoding** | Windows ANSI / UTF-8 |

---

## 6. Default Export Template Syntax

The file is structured in **three sections**, each defined by a template in WinFTM:

### Section 1 — Header (written when product is selected)
```
@CAL@TAB#@TAB@PRN@CRX@LFX@LFX
#@TABOperator@TAB@EL1 @DM1@TAB@EL2 @DM2@TAB...@EL20 @DM20@LFX@LFX@END
```

**Variables:**
| Variable | Description | Example Output |
|---|---|---|
| `@CAL` | Product/alloy name | `18K Gold` |
| `@PRN` | Product number | `001` |
| `@EL1`–`@EL20` | Element/channel name | `Au`, `Ag`, `Cu`, `Pd` |
| `@DM1`–`@DM20` | Unit of measurement | `%`, `nm`, `mils`, `ppm` |
| `@TAB` | Tab separator | `\t` |
| `@CRX` | Carriage return | `\r` |
| `@LFX` | Line feed | `\n` |
| `@END` | End of template | — |

---

### Section 2 — Single Readings (written after every measurement)
```
@NBR@TAB@PRF@TAB@VA1@TAB@VA2@TAB@VA3@TAB...@VA20@CRX@LFX@END
```

**Variables:**
| Variable | Description | Example Output |
|---|---|---|
| `@NBR` | Sequential reading number | `1`, `2`, `3`... |
| `@PRF` | Operator name | `John` |
| `@VA1`–`@VA20` | Measured value per channel | `91.50`, `5.20`, `3.30` |

> Up to **20 measurement channels** simultaneously (layer thickness or element concentration)

---

### Section 3 — Block Statistics (written when block is closed)
```
Block #@TAB@BLK@TAB@ANB@TAB@LOT@TAB@BM1@TAB@BM2@CRX@LFX
x =@TAB@TAB@MW1@TAB@MW2@TAB...@MW20@CRX@LFX
s =@TAB@TAB@S_1@TAB@S_2@TAB...@S_20@LFX@LFX@END
```

**Variables:**
| Variable | Description | Example Output |
|---|---|---|
| `@BLK` | Block number | `1` |
| `@ANB` | Order number | `ORD-001` |
| `@LOT` | Lot number | `LOT-A` |
| `@BM1`, `@BM2` | Labels (Label 1, Label 2) | `Ring`, `18K` |
| `@MW1`–`@MW20` | Mean value per channel | `91.80` |
| `@S_1`–`@S_20` | Standard deviation per channel | `0.30` |

---

## 7. Complete Example File Output

A real `results.exp` file from the GOLDSCOPE SD will look like this:

```
18K Gold	#	001

#	Operator	Au %	Ag %	Cu %	Pd %

1	John	91.50	5.20	3.30	0.00
2	John	92.10	4.80	3.10	0.00
3	John	91.60	5.10	3.30	0.00
Block #	1	ORD-001	LOT-A	Ring	18K
x =		91.73	5.03	3.23	0.00
s =		0.32	0.21	0.12	0.00
```

---

## 8. Handshake File Mechanism

WinFTM uses a handshake file to prevent data corruption when writing to a shared destination:

| File | Purpose |
|---|---|
| `NET_EXPT.END` | WinFTM **waits** for this file to be **deleted** before writing the next export |

**Our app behaviour:**
- After reading a new export batch → delete `NET_EXPT.END`
- WinFTM then proceeds to write the next result
- Only enable `Complete file handshake` in WinFTM settings if the target system supports it (optional)

---

## 9. Alternative Export Methods

Beyond file-based export, WinFTM also supports:

| Method | Description | App Integration |
|---|---|---|
| **File (`.exp`)** | Write to local file, append or overwrite | ✅ Primary — file watcher |
| **TCP-IP** | Send data over network socket | ✅ Future — TCP listener |
| **RS-232 / Serial** | Send via COM port | 🔵 Optional — serialport library |
| **Excel (direct)** | Write to open Excel workbook | ❌ Not suitable for automation |
| **OLE Automation** | Remote control via Visual Basic | ❌ Complex, legacy |
| **OPC-DA 1–3** | PLC/industrial connection via Profibus/Profinet | ❌ Industrial only |

### TCP-IP Integration (Future Feature)
WinFTM can send data directly over TCP/IP. Our Node.js backend can open a TCP socket server and receive data in real-time without any file involvement. This would be a premium feature for advanced users.

---

## 10. App Integration Architecture

### Primary Flow (File Watcher)
```
[GOLDSCOPE SD Machine]
        ↓ (X-ray measurement)
[WinFTM® Software on Windows PC]
        ↓ (Online Export enabled — writes after every test)
[C:\FischerExport\results.exp]
        ↓ (chokidar file watcher detects new content)
[Our Node.js Backend]
        ↓ (parse tab-separated .exp format)
[SQLite Database]
        ↓ (REST API)
[React Dashboard — live update]
```

### Parser Logic (pseudocode)
```javascript
function parseExpFile(content) {
  const lines = content.split('\r\n');
  let header = {};
  let readings = [];
  let blockStats = [];

  for (const line of lines) {
    const cols = line.split('\t');

    if (line.startsWith('#')) {
      // Header — extract element names and units
      header.elements = cols.slice(2); // Au %, Ag %, Cu % ...
    } else if (line.startsWith('Block #')) {
      // Block statistics header row
    } else if (line.startsWith('x =')) {
      // Mean values
    } else if (line.startsWith('s =')) {
      // Standard deviations
    } else if (cols[0].match(/^\d+$/)) {
      // Single reading row
      readings.push({
        number: cols[0],
        operator: cols[1],
        values: cols.slice(2).map(Number)
      });
    }
  }
  return { header, readings, blockStats };
}
```

---

## 11. Database Schema (SQLite)

```sql
-- Products/Alloy types
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT,           -- @CAL: e.g. "18K Gold"
  product_number TEXT, -- @PRN
  elements TEXT,       -- JSON array: ["Au %", "Ag %", "Cu %"]
  created_at DATETIME
);

-- Individual measurements
CREATE TABLE readings (
  id INTEGER PRIMARY KEY,
  product_id INTEGER,
  reading_number INTEGER,  -- @NBR
  operator TEXT,           -- @PRF
  values TEXT,             -- JSON array: [91.50, 5.20, 3.30]
  timestamp DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Block statistics
CREATE TABLE block_stats (
  id INTEGER PRIMARY KEY,
  product_id INTEGER,
  block_number INTEGER,    -- @BLK
  order_number TEXT,       -- @ANB
  lot_number TEXT,         -- @LOT
  label1 TEXT,             -- @BM1
  label2 TEXT,             -- @BM2
  means TEXT,              -- JSON array: [91.80, 5.00, 3.20]
  std_devs TEXT,           -- JSON array: [0.30, 0.20, 0.10]
  timestamp DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

---

## 12. References (All Sources Used)

| # | Source | URL | What it confirmed |
|---|---|---|---|
| 1 | **Helmut Fischer Official Website** — Gold Testing Devices | https://www.helmut-fischer.com/de/produkte/geraete-nach-anwendung/goldpruefgeraete | GOLDSCOPE SD product family overview |
| 2 | **Helmut Fischer Official Website** — GOLDSCOPE SD Product Page | https://www.helmut-fischer.com/products/xrf-instruments/goldscope-sd | Machine uses WinFTM, XRF technology, Si-PIN and SDD detector variants |
| 3 | **Helmut Fischer Official Website** — WinFTM Product Page | https://www.helmut-fischer.com/products/xrf-instruments/winftm | WinFTM features: direct data export, report creation, SPC, automated sequences |
| 4 | **Helmut Fischer Official FAQ** | https://www.helmut-fischer.com/services/faq | Confirmed menu path: `Evaluation → Export → Export Settings`, confirmed export types: Online, Excel, RS232, TCP-IP |
| 5 | **FISCHERSCOPE X-RAY 4000 Series Operator's Manual (PDF)** | https://propribory.ru/static/upl/19-01-2021/rzSZBALcHNtxp_Kx/fischerscope_xray_4000_series.pdf | Full export template syntax, variable list, file format, handshake mechanism (pages 124–131) |
| 6 | **ManualsLib — FISCHERSCOPE X-RAY XDLM 231 Operator's Manual** | https://www.manualslib.com/manual/1883973/Fischer-Fischerscope-X-Ray-Xdlm-231.html?page=165 | Chapter 20: Measurement Data Export — confirmed all export settings, template syntax, variable reference (pages 163–170) |

---

## 13. Compatible Machines

This integration works with the following Fischer instruments (all use WinFTM):

- GOLDSCOPE® SD 550 *(primary target)*
- GOLDSCOPE® SD
- GOLDSCOPE® SD 600
- FISCHERSCOPE® X-RAY XDLM 231 / 232 / 237
- FISCHERSCOPE® X-RAY 4000 Series
- FISCHERSCOPE® X-RAY 5000 Series
- FISCHERSCOPE® X-RAY XAN®
- FISCHERSCOPE® X-RAY XDAL®
- FISCHERSCOPE® X-RAY XDV®

> **Note:** Newer machines use **FISIQ® X** software instead of WinFTM. Export format may differ — separate research required for FISIQ® X integration.

---

## 14. Open Questions / To Investigate Later

| # | Question | Priority |
|---|---|---|
| 1 | What is the exact default folder where WinFTM installs and saves data? | Medium |
| 2 | Does WinFTM support a TCP-IP server mode or client mode? What port? | High (for TCP feature) |
| 3 | Can the export template include timestamp (`@DAT`, `@TIM`)? | High |
| 4 | What is the FISIQ® X export format for newer machines? | Low (future) |
| 5 | Does WinFTM support Unicode/special characters in element names? | Low |

---

*Document prepared May 14, 2026 — for internal project use.*
