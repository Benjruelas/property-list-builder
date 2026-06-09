/** Single canonical id for app state + paint (must match pidMatch in expressions). */
export function canonicalParcelId(raw) {
  const id = raw?.parcelid ?? raw?.lrid
  return id != null && id !== '' ? String(id).trim() : ''
}

function splitCityState(ownercity, ownerstate) {
  if (ownerstate) return { city: ownercity || '', state: ownerstate }
  if (!ownercity) return { city: '', state: '' }
  const parts = ownercity.trim().split(/\s+/)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (last.length === 2 || last.length <= 8) {
      return { city: parts.slice(0, -1).join(' '), state: last }
    }
  }
  return { city: ownercity, state: '' }
}

const CANONICAL_CONSUMED = new Set([
  'parcelid', 'lrid', 'parcelid2', 'll_uuid', 'll_stable_id', 'taxacctnum',
  'parceladdr', 'placename', 'parcelcity', 'parcelstate', 'parcelzip',
  'ownername', 'owneraddr', 'ownercity', 'ownerstate', 'ownerzip',
  'totalvalue', 'landvalue', 'imprvalue', 'agvalue',
  'saleamt', 'saledate', 'prior_sale_amount', 'prior_sale_date',
  'taxyear',
  'taxacres', 'assdacres', 'calcarea', 'll_gisacre', 'll_gissqft',
  'yearbuilt', 'bldgsqft', 'numbldgs', 'numunits', 'numfloors',
  'bedrooms', 'fullbaths', 'halfbaths',
  'll_bldg_count', 'll_bldg_footprint_sqft',
  'usecode', 'usedesc', 'zoningcode', 'zoningdesc',
  'lbcs_activity_desc', 'lbcs_function_desc', 'lbcs_structure_desc',
  'lbcs_site_desc', 'lbcs_ownership_desc',
  'legaldesc', 'lot', 'block', 'book', 'page', 'plssdesc',
  'township', 'section', 'qtrsection', 'range',
  'countyname', 'geoid', 'tractname', 'centroidy', 'centroidx', 'lat', 'lon',
  'census_block', 'census_blockgroup', 'census_zcta',
  'cong_dist', 'state_house_dist', 'state_senate_dist',
  'school_district', 'school_dist_id', 'path',
  'homestead_exemption', 'qoz', 'qoz_tract',
  'dpv_match_code', 'dpv_notes',
  'updated', 'address_source', 'parval_source', 'improv_source', 'landval_source',
])

/** Map raw LandRecords parcel_us properties to canonical app fields. */
export function mapProperties(raw) {
  const { city: mailCity, state: mailState } = splitCityState(raw.ownercity, raw.ownerstate)

  const canonical = {
    PROP_ID:        canonicalParcelId(raw) || '',
    PARCEL_ID_ALT:  raw.parcelid2  || '',
    LL_UUID:        raw.ll_uuid    || '',
    LL_STABLE_ID:   raw.ll_stable_id || '',
    SITUS_ADDR:     raw.parceladdr || '',
    SITUS_CITY:     raw.placename || raw.parcelcity || '',
    SITUS_STATE:    raw.parcelstate || '',
    SITUS_ZIP:      raw.parcelzip  || '',
    OWNER_NAME:     raw.ownername  || '',
    MAIL_ADDR:      raw.owneraddr  || '',
    MAIL_CITY:      mailCity,
    MAIL_STATE:     mailState,
    MAIL_ZIP:       raw.ownerzip   || '',
    DPV_MATCH:      raw.dpv_match_code || '',
    DPV_NOTES:      raw.dpv_notes  || '',
    MKT_VAL:        raw.totalvalue ?? '',
    LAND_VAL:       raw.landvalue  ?? '',
    IMPR_VAL:       raw.imprvalue  ?? '',
    AG_VAL:         raw.agvalue    ?? '',
    SALE_PRICE:     raw.saleamt    ?? '',
    SALE_DATE:      raw.saledate   || '',
    PRIOR_SALE_PRICE: raw.prior_sale_amount ?? '',
    PRIOR_SALE_DATE:  raw.prior_sale_date   || '',
    GIS_ACRES:      raw.taxacres   ?? raw.assdacres ?? '',
    LL_GIS_ACRES:   raw.ll_gisacre ?? '',
    LL_GIS_SQFT:    raw.ll_gissqft ?? '',
    CALC_AREA_SQM:  raw.calcarea   ?? '',
    YEAR_BUILT:     raw.yearbuilt  || '',
    BLDG_SQFT:      raw.bldgsqft   || '',
    NUM_BLDGS:      raw.numbldgs   || '',
    NUM_UNITS:      raw.numunits   || '',
    NUM_FLOORS:     raw.numfloors  || '',
    BLDG_COUNT:     raw.ll_bldg_count ?? '',
    BLDG_FOOTPRINT_SQFT: raw.ll_bldg_footprint_sqft ?? '',
    BEDROOMS:       raw.bedrooms   ?? '',
    BATHROOMS:      raw.fullbaths  ?? '',
    HALF_BATHS:     raw.halfbaths  ?? '',
    LEGAL_DESC:     raw.legaldesc  || '',
    USE_CODE:       raw.usecode    || '',
    USE_DESC:       raw.usedesc    || '',
    ZONING_CODE:    raw.zoningcode || '',
    ZONING:         raw.zoningdesc || raw.zoningcode || '',
    LBCS_ACTIVITY:  raw.lbcs_activity_desc  || '',
    LBCS_FUNCTION:  raw.lbcs_function_desc  || '',
    LBCS_STRUCTURE: raw.lbcs_structure_desc || '',
    LBCS_SITE:      raw.lbcs_site_desc      || '',
    LBCS_OWNERSHIP: raw.lbcs_ownership_desc || '',
    HOMESTEAD_EXEMPTION: raw.homestead_exemption ?? '',
    QOZ:            raw.qoz        || '',
    QOZ_TRACT:      raw.qoz_tract  || '',
    SCHOOL_DISTRICT: raw.school_district || '',
    SCHOOL_DIST_ID: raw.school_dist_id || '',
    TAX_ACCT:       raw.taxacctnum || '',
    TAX_YEAR:       raw.taxyear    ?? '',
    LOT:            raw.lot        || '',
    BLOCK:          raw.block      || '',
    BOOK:           raw.book       || '',
    PAGE:           raw.page       || '',
    SUBDIVISION:    raw.plssdesc   || '',
    TOWNSHIP:       raw.township   || '',
    SECTION:        raw.section    || '',
    QTR_SECTION:    raw.qtrsection || '',
    RANGE:          raw.range      || '',
    COUNTY:         raw.countyname || '',
    COUNTY_FIPS:    raw.geoid      || '',
    CITY:           raw.placename  || raw.parcelcity || '',
    CENSUS_TRACT:   raw.tractname  || '',
    CENSUS_BLOCK:   raw.census_block      || '',
    CENSUS_BLOCKGROUP: raw.census_blockgroup || '',
    CENSUS_ZCTA:    raw.census_zcta || '',
    CONG_DIST:      raw.cong_dist        || '',
    STATE_HOUSE_DIST:  raw.state_house_dist  || '',
    STATE_SENATE_DIST: raw.state_senate_dist || '',
    PLACE_NAME:     raw.placename  || '',
    JURISDICTION_PATH: raw.path    || '',
    LATITUDE:       raw.lat        ?? raw.centroidy ?? '',
    LONGITUDE:      raw.lon        ?? raw.centroidx ?? '',
    LAST_UPDATED:   raw.updated    || '',
    ADDRESS_SOURCE: raw.address_source || '',
    PARVAL_SOURCE:  raw.parval_source  || '',
    IMPROV_SOURCE:  raw.improv_source  || '',
    LANDVAL_SOURCE: raw.landval_source || '',
  }

  for (const [k, v] of Object.entries(raw || {})) {
    if (CANONICAL_CONSUMED.has(k)) continue
    if (v === '' || v === null || v === undefined) continue
    const key = String(k).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    if (!(key in canonical)) canonical[key] = v
  }

  return canonical
}
