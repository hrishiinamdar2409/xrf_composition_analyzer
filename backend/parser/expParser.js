/**
 * Modern WinFTM® JSON Block & Element Parser
 * Gracefully isolates curly brace blocks and repairs broken/malformed WinFTM JSON elements.
 */

'use strict';

/**
 * Extracts individual curly-brace blocks from a file and runs pre-parsing repairs.
 * Handles missing quotes, unquoted strings, blank keys, and broken hyphen states.
 * @param {string} rawContent - The raw text contents read from the log file
 * @returns {Array<Object>} Array of clean parsed JavaScript objects
 */
function parseJsonEntries(rawContent) {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const extractedEntries = [];
  let openBraces = 0;
  let currentBlockStart = -1;

  // Step 1: Scan for standalone curly-brace bounding blocks
  for (let i = 0; i < rawContent.length; i++) {
    const char = rawContent[i];

    if (char === '{') {
      if (openBraces === 0) {
        currentBlockStart = i;
      }
      openBraces++;
    } else if (char === '}') {
      openBraces--;
      if (openBraces === 0 && currentBlockStart !== -1) {
        const rawJsonBlock = rawContent.substring(currentBlockStart, i + 1);
        
        // Step 2: Sanitize and repair the structural malformations
        const cleanedJsonString = sanitizeWinFtmJson(rawJsonBlock);
        
        if (cleanedJsonString) {
          try {
            const parsedObj = JSON.parse(cleanedJsonString);
            extractedEntries.push(parsedObj);
          } catch (e) {
            console.error(`[Parser] Failed to parse sub-block extraction candidate: ${e.message}`);
          }
        }
        currentBlockStart = -1;
      }
    }
  }

  return extractedEntries;
}

/**
 * Performs rigorous string cleaning to prevent JSON syntax parser faults.
 * @param {string} rawBlockStr - A single isolated chunk of JSON string candidate
 * @returns {string|null} Cleaned JSON string, or null if unresolvable
 */
function sanitizeWinFtmJson(rawBlockStr) {
  let cleaned = rawBlockStr;

  // 1. Repair unquoted SerialNumbers (e.g. "SerialNumber":IN00006490, -> "SerialNumber":"IN00006490",)
  cleaned = cleaned.replace(/"SerialNumber"\s*:\s*([A-Za-z0-9]+)\s*,/g, '"SerialNumber":"$1",');

  // 2. Erase completely blank unmeasured structural properties completely 
  // Captures structural noise across FINE, PURE, SILVER & TUNCH profiles: "":{"Value":,"Unit":"","State":},
  cleaned = cleaned.replace(/"":\s*\{\s*"Value"\s*:\s*,\s*"Unit"\s*:\s*""\s*,\s*"State"\s*:\s*\}\s*,?/g, '');

  // 3. Clean up loose stray element blocks with blank keys that miss values inside trailing spaces
  cleaned = cleaned.replace(/"":\s*\{\s*"Value"\s*:\s*.*\}\s*,?/g, '');

  // 4. Substitute naked unquoted hyphens with a clean fallback numeric representation or null
  // Handles the common out-of-bounds pattern: "Value": --------, -> "Value": 0.000,
  cleaned = cleaned.replace(/"Value"\s*:\s*-+\s*,/g, '"Value": 0.000,');

  // 5. Clean up any invalid trailing commas that might have been left over right before closing structures
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Safety fallback verification check
  const trimmed = cleaned.trim();
  if (!trimmed || trimmed === '{}') return null;

  return cleaned;
}

/**
 * Normalizes element lists, cleaning up padded strings and removing empty keys.
 * @param {Object} rawElements - The elements dictionary tree extracted from JSON
 * @returns {Array<Object>} Clean array of object parameters ready for relational databases
 */
function normaliseElements(rawElements) {
  if (!rawElements) return [];
  
  const results = [];
  
  Object.keys(rawElements).forEach((key) => {
    const cleanKey = key.trim();
    
    // Completely ignore blank properties from saving into SQLite
    if (!cleanKey) return;

    const data = rawElements[key];
    results.push({
      element: cleanKey,
      value: data.Value !== undefined && data.Value !== null ? Number(data.Value) : 0.0,
      unit: data.Unit ? data.Unit.trim() : '%',
      state: data.State !== undefined ? Number(data.State) : 1
    });
  });

  return results;
}

module.exports = {
  parseJsonEntries,
  normaliseElements
};