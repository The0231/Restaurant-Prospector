// UK location helpers — London borough detection and region mapping.

export const LONDON_BOROUGHS = new Set([
  "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley",
  "Camden", "City of London", "Croydon", "Ealing", "Enfield",
  "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey", "Harrow",
  "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea",
  "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham",
  "Redbridge", "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets",
  "Waltham Forest", "Wandsworth", "Westminster",
]);

export function isLondon(borough: string): boolean {
  return LONDON_BOROUGHS.has(borough);
}

// Map postcode area prefix → broad UK region.
// Two-letter prefixes are checked before one-letter to avoid e.g. "E" matching "EH" (Edinburgh).
const AREA_REGION: Record<string, string> = {
  // London (single-letter areas)
  E: "London", N: "London", W: "London",
  // London (two-letter areas)
  EC: "London", NW: "London", SE: "London", SW: "London", WC: "London",
  // Scotland
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland", FK: "Scotland",
  G:  "Scotland", IV: "Scotland", KA: "Scotland", KW: "Scotland", KY: "Scotland",
  ML: "Scotland", PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",
  // Wales
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales", SY: "Wales",
  // Northern Ireland
  BT: "Northern Ireland",
  // North East
  DH: "North East", DL: "North East", NE: "North East", SR: "North East", TS: "North East",
  // North West
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", LA: "North West", M:  "North West",
  OL: "North West", PR: "North West", SK: "North West", WA: "North West", WN: "North West",
  // Yorkshire & Humber
  BD: "Yorkshire", DN: "Yorkshire", HD: "Yorkshire", HG: "Yorkshire",
  HU: "Yorkshire", HX: "Yorkshire", LS: "Yorkshire", S:  "Yorkshire",
  WF: "Yorkshire", YO: "Yorkshire",
  // East Midlands
  DE: "East Midlands", LE: "East Midlands", LN: "East Midlands",
  NG: "East Midlands", NN: "East Midlands",
  // West Midlands
  B: "West Midlands", CV: "West Midlands", DY: "West Midlands", HR: "West Midlands",
  ST: "West Midlands", TF: "West Midlands", WR: "West Midlands",
  WS: "West Midlands", WV: "West Midlands",
  // East of England
  AL: "East of England", CB: "East of England", CM: "East of England",
  CO: "East of England", EN: "East of England", IP: "East of England",
  LU: "East of England", MK: "East of England", NR: "East of England",
  PE: "East of England", SG: "East of England", SS: "East of England",
  // South East
  BN: "South East", BR: "South East", CR: "South East", CT: "South East",
  DA: "South East", GU: "South East", KT: "South East", ME: "South East",
  OX: "South East", PO: "South East", RG: "South East", RH: "South East",
  SL: "South East", SM: "South East", SO: "South East", TN: "South East",
  TW: "South East",
  // South West
  BA: "South West", BS: "South West", DT: "South West", EX: "South West",
  GL: "South West", PL: "South West", SP: "South West", TA: "South West",
  TQ: "South West", TR: "South West",
};

export function getRegion(borough: string, postcode: string): string {
  // London boroughs always map to "London" regardless of postcode
  if (isLondon(borough)) return "London";
  const area = postcode.trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{1,2})/)?.[1] ?? "";
  // Try two-letter first, then one-letter
  return AREA_REGION[area] ?? AREA_REGION[area[0]] ?? "Other";
}
