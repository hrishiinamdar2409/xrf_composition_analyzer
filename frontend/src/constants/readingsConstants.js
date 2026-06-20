// ─── Constants ───────────────────────────────────────────────────────────────

export const POWDER_ELEMENTS = new Set(['Ir', 'Os', 'Ru', 'Re', 'W'])
export const NON_EDITABLE_ELEMENTS = new Set(['Cu'])
export const PRIMARY_ELEMENT = { Gold: 'Au', Silver: 'Ag', Platinum: 'Pt' }
export const ELEMENT_SYMBOL_RX = /^[A-Z][a-z]?$/

export const INCREMENT_STEPS = [
  { label: '+0.05', delta: 0.05 },
  { label: '+0.1', delta: 0.1 },
  { label: '+0.2', delta: 0.2 },
  { label: '+0.3', delta: 0.3 },
  { label: 'UR', snap: 'upper_range' },
]

export const DECREMENT_STEPS = [
  { label: '-0.05', delta: -0.05 },
  { label: '-0.1', delta: -0.1 },
  { label: '-0.2', delta: -0.2 },
  { label: '-0.3', delta: -0.3 },
  { label: 'UL', snap: 'upper_limit' },
]

export const UPPER_RANGE = { Gold: 99.9, Silver: 99.9, Platinum: 99.9 }
export const UPPER_LIMIT = { Gold: 91.67, Silver: 92.5, Platinum: 95.0 }

export const ENTRY_MODE = {
  SINGLE: 'single',
  MULTI: 'multi',
}

// Full friendly names for every element the machine can return
export const ELEMENT_NAMES = {
  Au: 'Gold', Ag: 'Silver', Cu: 'Copper', Zn: 'Zinc',
  Cd: 'Cadmium', Ni: 'Nickel', Bi: 'Bismuth', As: 'Arsenic',
  Ir: 'Iridium', Ru: 'Ruthenium', Os: 'Osmium', Re: 'Rhenium',
  Fe: 'Iron', Pd: 'Palladium', Sn: 'Tin', Pb: 'Lead',
  W: 'Tungsten', Pt: 'Platinum', Co: 'Cobalt', Rh: 'Rhodium',
  Cr: 'Chromium', Mn: 'Manganese', Ti: 'Titanium', In: 'Indium',
  Sb: 'Antimony', Te: 'Tellurium', Se: 'Selenium', Mo: 'Molybdenum',
  Nb: 'Niobium', Hf: 'Hafnium', Ta: 'Tantalum', V: 'Vanadium',
}

// Fixed ordered columns for the readings table
export const READING_COLUMNS = [
  'Au', 'Ag', 'Cu', 'Zn', 'Ni', 'Cd', 'In', 
  'Ir', 'Ru', 'Rh', 'Pd', 'Fe', 'Pt', 'Os', 
  'Re', 'Co', 'Ga', 'Sn', 'Pb', 'Bi', 'W', 'Sb', 'mq'
]

export const ALL_ELEMENT_GROUPS = [
  ['Silver', 'Copper', 'Zinc', 'Cadmium', 'Nickel', 'Indium'],
  ['Iron', 'Tin', 'Iridium', 'Ruthenium', 'Osmium', 'Rhenium'],
  ['Cobalt', 'Lead', 'Chromium', 'Platinum', 'Palladium', 'Rhodium'],
]