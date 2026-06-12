/**
 * WinFTM® .exp file parser
 * Format: tab-separated values, CRLF line endings, sections delimited by empty lines
 * Three section types: Header (@CAL, @PRN, etc.), Single Readings (@NBR, @VA1...), Block Stats (@BLK, @MW1...)
 */

'use strict';

/**
 * Parse a complete .exp file string into structured JavaScript objects.
 * @param {string} rawText - Full contents of the .exp file (UTF-8 or ASCII)
 * @returns {{ readings: object[], blockStats: object[], header: object }}
 */
function parseExpFile(rawText) {
  // Normalise line endings
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');

  const header = {};
  const readings = [];
  const blockStats = [];

  // Split into sections separated by blank lines
  const sections = [];
  let current = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);

  for (const section of sections) {
    const fields = parseSectionFields(section);
    if (!fields || Object.keys(fields).length === 0) continue;

    if ('@CAL' in fields || '@PRN' in fields) {
      // Header section
      Object.assign(header, fields);
    } else if ('@BLK' in fields) {
      // Block statistics section
      blockStats.push(fields);
    } else if ('@NBR' in fields) {
      // Single reading section
      readings.push(fields);
    }
  }

  return { header, readings, blockStats };
}

/**
 * Parse one section (array of lines) into a key→value object.
 * Lines are tab-separated: key\tvalue
 */
function parseSectionFields(lines) {
  const fields = {};
  for (const line of lines) {
    const tabIdx = line.indexOf('\t');
    if (tabIdx === -1) continue;
    const key = line.substring(0, tabIdx).trim();
    const value = line.substring(tabIdx + 1).trim();
    if (key) fields[key] = parseValue(value);
  }
  return fields;
}

/**
 * Attempt to convert a string value to a number if it looks like one.
 */
function parseValue(str) {
  if (str === '' || str === null || str === undefined) return null;
  // WinFTM uses decimal point (never comma) for numbers
  const n = Number(str);
  if (!isNaN(n) && str.trim() !== '') return n;
  return str;
}

/**
 * Convert a parsed reading object to a flat, application-friendly format.
 * Extracts up to 20 element channels (VA1–VA20 / element names EL1–EL20).
 * @param {object} raw - Raw parsed reading fields
 * @param {object} header - Parsed header fields (provides element names)
 * @returns {object} Normalised reading
 */
function normaliseReading(raw, header = {}) {
  const elements = [];
  for (let i = 1; i <= 20; i++) {
    const key = `@VA${i}`;
    const nameKey = `@EL${i}`;
    if (!(key in raw)) break;
    if (raw[key] === null || raw[key] === undefined) break;
    elements.push({
      index: i,
      name: header[nameKey] || `Element${i}`,
      value: raw[key],
    });
  }

  return {
    nbr: raw['@NBR'] ?? null,
    profile: raw['@PRF'] ?? null,
    timestamp: null, // WinFTM does not embed timestamp in .exp; set by watcher on arrival
    elements,
    raw,
  };
}

/**
 * Convert a parsed block stats object to a flat format.
 */
function normaliseBlockStats(raw, header = {}) {
  const means = [];
  const stddevs = [];
  for (let i = 1; i <= 20; i++) {
    const mKey = `@MW${i}`;
    const sKey = `@S_${i}`;
    const nameKey = `@EL${i}`;
    if (!(mKey in raw) && !(sKey in raw)) break;
    means.push({
      index: i,
      name: header[nameKey] || `Element${i}`,
      mean: raw[mKey] ?? null,
      stddev: raw[sKey] ?? null,
    });
  }

  return {
    block: raw['@BLK'] ?? null,
    count: raw['@ANB'] ?? null,
    lot: raw['@LOT'] ?? null,
    means,
    raw,
  };
}

module.exports = { parseExpFile, normaliseReading, normaliseBlockStats };
