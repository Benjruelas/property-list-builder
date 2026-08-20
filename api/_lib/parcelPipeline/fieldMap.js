/**
 * Map heterogeneous county GIS attributes → LandRecords-like keys used by
 * src/utils/parcelPropertyMap.js (mapProperties).
 */

/** Canonical keys we try to populate on every owned feature. */
export const CANONICAL_KEYS = [
  'parcelid',
  'lrid',
  'parcelid2',
  'parceladdr',
  'placename',
  'parcelcity',
  'parcelstate',
  'parcelzip',
  'ownername',
  'owneraddr',
  'ownercity',
  'ownerstate',
  'ownerzip',
  'totalvalue',
  'landvalue',
  'imprvalue',
  'saleamt',
  'saledate',
  'taxacres',
  'yearbuilt',
  'bldgsqft',
  'usecode',
  'usedesc',
  'zoningcode',
  'legaldesc',
  'countyname',
  'geoid',
  'lat',
  'lon',
]

/**
 * Default fuzzy candidates when a county has no explicit fieldMap.
 * Keys are canonical; values are ordered source property name candidates.
 */
export const DEFAULT_FIELD_CANDIDATES = {
  parcelid: [
    'parcelid', 'PARCELID', 'PARCEL_ID', 'PIN', 'APN', 'AIN', 'FOLIO', 'ACCOUNT',
    'ACCOUNT_NUM', 'TAXACCT', 'PROP_ID', 'Prop_ID', 'PARCEL', 'PARCEL_NO', 'PID',
  ],
  lrid: [
    'lrid', 'LRID', 'GLOBALID', 'OBJECTID', 'parcelid', 'PARCEL_ID', 'PIN', 'APN', 'AIN', 'FOLIO', 'ACCOUNT',
  ],
  parceladdr: [
    'parceladdr', 'SITUS_ADDRESS', 'SITE_ADDR', 'SitusAddress', 'ADDR_FULL', 'ADDRESS',
    'PropertyAddress', 'TRUE_SITE_ADDR', 'LOC_ADDR', 'STREET_ADDRESS', 'SITE_ADDRESS',
  ],
  parcelcity: [
    'parcelcity', 'SITUS_CITY', 'SITE_CITY', 'SitusCity', 'CITY', 'CTYNAME', 'TRUE_SITE_CITY', 'CITY_NAME',
  ],
  parcelstate: ['parcelstate', 'SITUS_STATE', 'STATE', 'ST', 'STATE_ABBR'],
  parcelzip: [
    'parcelzip', 'SITUS_ZIP', 'SITE_ZIP', 'SitusZIP', 'ZIP', 'ZIP5', 'ZIPCODE', 'TRUE_SITE_ZIP_CODE',
  ],
  ownername: [
    'ownername', 'OWNER_NAME', 'OwnerName', 'OWNER', 'TRUE_OWNER1', 'OWNER1', 'TAXPAYER', 'OWNER_NAME1',
  ],
  owneraddr: ['owneraddr', 'OWNER_ADDRESS', 'MAIL_ADDR', 'MAILING_ADDRESS', 'OWNER_ADDR'],
  ownercity: ['ownercity', 'OWNER_CITY', 'MAIL_CITY', 'MAILING_CITY'],
  ownerstate: ['ownerstate', 'OWNER_STATE', 'MAIL_STATE', 'MAILING_STATE'],
  ownerzip: ['ownerzip', 'OWNER_ZIP', 'MAIL_ZIP', 'MAILING_ZIP'],
  totalvalue: [
    'totalvalue', 'TOT_VAL', 'TOTAL_VAL', 'MARKET_VALUE', 'TotalValue', 'APPRAISED', 'ASSESSED',
    'ASSESSED_VAL', 'Roll_TotalValue', 'MKT_VAL',
  ],
  landvalue: ['landvalue', 'LAND_VAL', 'LAND_VALUE', 'LANDVALUE'],
  imprvalue: ['imprvalue', 'IMPR_VAL', 'IMPROVEMENT_VALUE', 'IMPRVALUE', 'BLDG_VAL'],
  taxacres: [
    'taxacres', 'ACRES', 'LEGAL_ACRES', 'DEED_ACRES', 'KCAACRES', 'LOT_SIZE', 'GIS_ACRES', 'Shape_Area',
  ],
  yearbuilt: ['yearbuilt', 'YEAR_BUILT', 'YR_BUILT', 'YRBLT', 'YEARBUILT'],
  bldgsqft: ['bldgsqft', 'BLDG_SQFT', 'SQFT', 'LIVING_AREA', 'IMPR_SQFT'],
  usecode: ['usecode', 'USE_CODE', 'LANDUSE', 'LU_CODE', 'PROP_USE'],
  usedesc: ['usedesc', 'USE_DESC', 'LANDUSE_DESC', 'PROP_USE_DESC'],
  zoningcode: ['zoningcode', 'ZONING', 'ZONE', 'ZONING_CODE'],
  legaldesc: ['legaldesc', 'LEGAL_DESC', 'LEGAL', 'LegalDescription', 'LEGAL_DESCRIPTION'],
  lat: ['lat', 'LAT', 'LATITUDE', 'Y', 'CENTROID_Y'],
  lon: ['lon', 'LON', 'LONGITUDE', 'X', 'CENTROID_X', 'LNG'],
}

function pickFromProps(props, candidates) {
  if (!props || !candidates?.length) return undefined
  for (const key of candidates) {
    if (key == null) continue
    if (Object.prototype.hasOwnProperty.call(props, key) && props[key] != null && props[key] !== '') {
      return props[key]
    }
    // case-insensitive fallback
    const lower = String(key).toLowerCase()
    for (const [pk, pv] of Object.entries(props)) {
      if (pk.toLowerCase() === lower && pv != null && pv !== '') return pv
    }
  }
  return undefined
}

/**
 * Resolve a fieldMap entry (string | string[]) plus defaults into ordered candidates.
 * @param {Record<string, string|string[]>|null|undefined} fieldMap
 * @param {string} canonicalKey
 */
export function candidatesFor(fieldMap, canonicalKey) {
  const fromMap = fieldMap?.[canonicalKey]
  const mapped = Array.isArray(fromMap) ? fromMap : fromMap != null ? [fromMap] : []
  const defaults = DEFAULT_FIELD_CANDIDATES[canonicalKey] || [canonicalKey]
  return [...mapped, ...defaults]
}

/**
 * Normalize one feature's properties to LandRecords-like keys.
 * @param {object} props
 * @param {{ fieldMap?: object, countyname?: string, geoid?: string, state?: string }} opts
 */
export function normalizeParcelProperties(props, opts = {}) {
  const fieldMap = opts.fieldMap || null
  const out = {}

  for (const key of CANONICAL_KEYS) {
    if (key === 'countyname' || key === 'geoid') continue
    const val = pickFromProps(props, candidatesFor(fieldMap, key))
    if (val !== undefined) out[key] = typeof val === 'string' ? val.trim() : val
  }

  const id = out.parcelid != null && out.parcelid !== ''
    ? String(out.parcelid)
    : out.lrid != null && out.lrid !== ''
      ? String(out.lrid)
      : ''
  if (id) {
    out.parcelid = id
    out.lrid = out.lrid != null && out.lrid !== '' ? String(out.lrid) : id
  }

  if (opts.countyname) out.countyname = opts.countyname
  else if (props.countyname) out.countyname = props.countyname

  if (opts.geoid) out.geoid = String(opts.geoid)
  else if (props.geoid) out.geoid = String(props.geoid)

  if (!out.parcelstate && opts.state) out.parcelstate = opts.state

  // Coerce numeric-ish fields
  for (const numKey of ['totalvalue', 'landvalue', 'imprvalue', 'taxacres', 'yearbuilt', 'bldgsqft', 'lat', 'lon']) {
    if (out[numKey] == null || out[numKey] === '') continue
    const n = Number(String(out[numKey]).replace(/[,$]/g, ''))
    if (Number.isFinite(n)) out[numKey] = n
  }

  return out
}

/**
 * Normalize a GeoJSON FeatureCollection in place (returns new collection).
 */
export function normalizeFeatureCollection(fc, opts = {}) {
  const features = (fc?.features || []).map((f) => {
    const props = normalizeParcelProperties(f.properties || {}, opts)
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: props,
      ...(f.id != null ? { id: f.id } : {}),
    }
  }).filter((f) => f.geometry && f.properties?.parcelid)
  return { type: 'FeatureCollection', features }
}
