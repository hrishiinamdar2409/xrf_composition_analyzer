// 💡 UPDATE: Add "Sb" to the POWDER_ELEMENTS set
export const POWDER_ELEMENTS = new Set([
  "Ir", 
  "Ru", 
  "Rh", 
  "Os", 
  "Re",
  "W",
  "Sb" // Added Antimony
]);
export const NON_EDITABLE_ELEMENTS = new Set(['Cu'])
export const PRIMARY_ELEMENT = { Gold: 'Au', Silver: 'Ag', Platinum: 'Pt' }
export const ELEMENT_SYMBOL_RX = /^[A-Z][a-z]?$/

// Profile filters - ALL now means only profile='ALL', DATA shows everything
export const PROFILE_FILTERS = ['JEWEL', 'FINE', 'PURE', 'SILVER', 'TUNCH']

export const INCREMENT_STEPS = [
  { label: '+0.05', delta: 0.05 },
  { label: '+0.1', delta: 0.1 },
  { label: '+0.2', delta: 0.2 },
  { label: '+0.3', delta: 0.3 },
  
]

export const DECREMENT_STEPS = [
  { label: '-0.05', delta: -0.05 },
  { label: '-0.1', delta: -0.1 },
  { label: '-0.2', delta: -0.2 },
  { label: '-0.3', delta: -0.3 },
  
]

export const UPPER_RANGE = { Gold: 99.9, Silver: 99.9, Platinum: 99.9 }
export const UPPER_LIMIT = { Gold: 91.67, Silver: 92.5, Platinum: 95.0 }

export const ENTRY_MODE = {
  SINGLE: 'single',
  MULTI: 'multi',
}

// Full friendly names for every element the machine can return - ADDED x1
export const ELEMENT_NAMES = {
  Au: 'Gold',
  Ag: 'Silver',
  Cu: 'Copper',
  Zn: 'Zinc',
  Ni: 'Nickel',
  Cd: 'Cadmium',
  In: 'Indium',
  Ir: 'Iridium',
  Ru: 'Ruthenium',
  Rh: 'Rhodium',
  Pd: 'Palladium',
  Fe: 'Iron',
  Pt: 'Platinum',
  Os: 'Osmium',
  Re: 'Rhenium',
  Co: 'Cobalt',
  Ga: 'Gallium',
  Sn: 'Tin',
  Pb: 'Lead',
  Bi: 'Bismuth',
  W:  'Tungsten',
  Sb: 'Antimony',
  x1: 'Karat'
};

// Fixed ordered columns for the readings table - Updated to include mq and x1
export const READING_COLUMNS = [
  'Au', 'Ag', 'Cu', 'Zn', 'Ni', 'Cd', 'In', 
  'Ir', 'Ru', 'Rh', 'Pd', 'Fe', 'Pt', 'Os', 
  'Re', 'Co', 'Ga', 'Sn', 'Pb', 'Bi', 'W', 'Sb',
  'mq', 'x1'
]

// Element groups grid array - ADDED 'Karat' to the end of the last column group
export const ALL_ELEMENT_GROUPS = [
  // Column 1: Core Alloys (7 Elements)
  ["Silver", "Copper", "Zinc", "Nickel", "Cadmium", "Indium", "Iron"],

  // Column 2: ALL POWDERED / SCAM ADULTERANTS (7 Elements)
  ["Iridium", "Ruthenium", "Osmium", "Rhenium", "Rhodium", "Antimony", "Tungsten"], // 💡 MOVE: Tungsten is now safely grouped here!

  // Column 3: Remaining Base & Precious Elements (7 Elements)
  ["Cobalt", "Gallium", "Tin", "Lead", "Bismuth", "Platinum", "Palladium"] // Cobalt moved here to maintain 7 items
];