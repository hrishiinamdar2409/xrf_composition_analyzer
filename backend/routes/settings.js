/**
 * REST API routes — Settings (export file path, business branding)
 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SETTINGS_PATH = path.join(__dirname, '..', '..', 'settings.json');
const DEFAULT_SETTINGS = {
  expFilePath: 'C:\\FischerExport\\results.exp',
  printerName: '',
};

const ALLOWED_KEYS = ['expFilePath', 'printerName'];

function normalizeSettings(input = {}) {
  const out = {};
  for (const key of ALLOWED_KEYS) {
    out[key] = key in input ? input[key] : DEFAULT_SETTINGS[key];
  }
  return out;
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function isLikelyWindowsPath(value) {
  return typeof value === 'string' && /^[a-zA-Z]:\\/.test(value);
}

function buildValidationError(res, errors, message = 'Invalid settings payload') {
  return res.status(400).json({
    error: message,
    code: 'VALIDATION_ERROR',
    errors,
  });
}

function listAvailablePrinters() {
  return new Promise((resolve, reject) => {
    const ps = "$ErrorActionPreference='Stop'; try { Get-Printer | Select-Object -ExpandProperty Name } catch { Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name }";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || stdout || err.message));
        return;
      }
      const printers = String(stdout || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      resolve([...new Set(printers)]);
    });
  });
}

function browseExpFile(currentPath = '') {
  return new Promise((resolve, reject) => {
    const safeCurrent = String(currentPath || '').replace(/'/g, "''");
    
    // Improved PowerShell script using Windows Forms instead of Shell.Application
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      
      $initialDir = ''
      if ('${safeCurrent}') {
        try {
          if (Test-Path -LiteralPath '${safeCurrent}') {
            $item = Get-Item -LiteralPath '${safeCurrent}' -ErrorAction SilentlyContinue
            if ($item.PSIsContainer) {
              $initialDir = $item.FullName
            } else {
              $initialDir = Split-Path -Parent $item.FullName
            }
          }
        } catch {
          $initialDir = [Environment]::GetFolderPath('Desktop')
        }
      } else {
        $initialDir = [Environment]::GetFolderPath('Desktop')
      }
      
      $fileDialog = New-Object System.Windows.Forms.OpenFileDialog
      $fileDialog.InitialDirectory = $initialDir
      $fileDialog.Filter = "Export files (*.exp)|*.exp|All files (*.*)|*.*"
      $fileDialog.Title = "Select WinFTM Export File (.exp)"
      $fileDialog.CheckFileExists = $true
      $fileDialog.Multiselect = $false
      
      $result = $fileDialog.ShowDialog()
      
      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $fileDialog.FileName
      } else {
        Write-Output ""
      }
    `;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { 
        windowsHide: true, 
        timeout: 120000,
        env: { ...process.env }
      },
      (err, stdout, stderr) => {
        if (err) {
          console.error('PowerShell error:', err);
          console.error('stderr:', stderr);
          // Return empty string on error (user cancelled or dialog failed)
          resolve('');
          return;
        }
        
        const selected = String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop() || '';
        resolve(selected);
      }
    );
  });
}

function validateSettingsPayload(payload) {
  const errors = [];
  const cleaned = { ...DEFAULT_SETTINGS };

  const expFilePath = String(payload.expFilePath ?? '').trim();
  if (!expFilePath) {
    errors.push({ field: 'expFilePath', message: 'Export file path is required.' });
  } else if (!isLikelyWindowsPath(expFilePath)) {
    errors.push({ field: 'expFilePath', message: 'Use an absolute Windows path (e.g. C:\\FischerExport\\results.exp).' });
  } else if (!expFilePath.toLowerCase().endsWith('.exp')) {
    errors.push({ field: 'expFilePath', message: 'Export file must end with .exp' });
  } else if (expFilePath.length > 260) {
    errors.push({ field: 'expFilePath', message: 'Export file path is too long (max 260).' });
  }
  cleaned.expFilePath = expFilePath;

  const printerName = String(payload.printerName ?? '').trim();
  if (printerName.length > 120) {
    errors.push({ field: 'printerName', message: 'Printer name is too long (max 120).' });
  }
  cleaned.printerName = printerName;

  return { errors, cleaned };
}

function createSettingsRouter(options = {}) {
  const router = express.Router();
  const onExpFilePathChange = typeof options.onExpFilePathChange === 'function'
    ? options.onExpFilePathChange
    : null;

  // GET /api/settings
  router.get('/', (req, res) => {
    res.json(loadSettings());
  });

  // GET /api/settings/printers
  router.get('/printers', async (req, res) => {
    try {
      const printers = await listAvailablePrinters();
      const current = loadSettings();
      return res.json({ printers, selectedPrinter: current.printerName || '' });
    } catch (err) {
      return res.status(500).json({ error: 'Could not list printers', detail: err.message });
    }
  });

  // POST /api/settings/browse-exp
  router.post('/browse-exp', async (req, res) => {
    try {
      const currentPath = String(req.body?.currentPath || '').trim();
      const selectedPath = await browseExpFile(currentPath);
      if (!selectedPath) {
        return res.json({ ok: true, cancelled: true, path: '' });
      }
      return res.json({ ok: true, cancelled: false, path: selectedPath });
    } catch (err) {
      return res.status(500).json({ error: 'Could not open file picker', detail: err.message });
    }
  });

  // PUT /api/settings
  router.put('/', async (req, res) => {
    const current = loadSettings();
    const incoming = normalizeSettings(req.body || {});
    const candidate = { ...current, ...incoming };
    const { errors, cleaned } = validateSettingsPayload(candidate);
    if (errors.length) {
      return buildValidationError(res, errors);
    }

    if (cleaned.printerName) {
      try {
        const printers = await listAvailablePrinters();
        if (!printers.includes(cleaned.printerName)) {
          return buildValidationError(res, [{ field: 'printerName', message: 'Selected printer is not available on this system.' }]);
        }
      } catch (_) {
        // If printer discovery fails, skip strict availability check and only keep format validation.
      }
    }

    saveSettings(cleaned);

    if (onExpFilePathChange && cleaned.expFilePath !== current.expFilePath) {
      try {
        onExpFilePathChange(cleaned.expFilePath);
      } catch (err) {
        console.error('[Settings] Failed to apply watcher path change:', err.message);
      }
    }

    return res.json(cleaned);
  });

  return router;
}

module.exports = createSettingsRouter;
