import { Trash2, Info, Phone, CheckCircle2, Loader2, MapPin, UserPlus, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DirectionsPicker } from '@/components/DirectionsPicker'
import { cn } from '@/lib/utils'
import { isParcelSkipTraced, getSkipTracedParcel } from '@/utils/skipTrace'
import { getParcelNote } from '@/utils/parcelNotes'
import { isParcelALead } from '@/utils/dealPipeline'
import { computeOwnerOccupied } from '@/utils/ownerOccupied'
import { OwnerOccupiedBadge } from '@/components/OwnerOccupiedBadge'

/** RGB from #RGB / #RRGGBB — fallback blue */
function parseBoundaryColorHex(hex) {
  if (!hex || typeof hex !== 'string') return { r: 37, g: 99, b: 235 }
  let h = String(hex).trim()
  if (!h.startsWith('#')) h = `#${h}`
  const raw = h.slice(1)
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    }
  }
  if (raw.length === 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    }
  }
  return { r: 37, g: 99, b: 235 }
}

/** Full-width accent: base hue → darker (same hue family) */
function boundaryOpenGradientStyle(hex) {
  const { r, g, b } = parseBoundaryColorHex(hex)
  const dr = Math.max(0, Math.round(r * 0.5))
  const dg = Math.max(0, Math.round(g * 0.5))
  const db = Math.max(0, Math.round(b * 0.5))
  return {
    background: `linear-gradient(to right, rgb(${r}, ${g}, ${b}), rgb(${dr}, ${dg}, ${db}))`,
  }
}

const lab = 'text-white/50'
const val = 'text-white/[0.95]'
const cardInner = 'rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5'

const metricChipClass =
  'inline-flex items-center rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-sky-100/90'

function VerifiedBadge({ verified }) {
  if (verified === 'good') return <CheckCircle className="h-3.5 w-3.5 text-emerald-400 inline-block ml-0.5" title="Verified good" />
  if (verified === 'bad') return <XCircle className="h-3.5 w-3.5 text-red-400 inline-block ml-0.5" title="Verified bad" />
  return <HelpCircle className="h-3.5 w-3.5 text-white/35 inline-block ml-0.5" title="Unverified" />
}

function getParcelData(props, parcel, address) {
  return {
    owner: props.OWNER_NAME || null,
    year: props.YEAR_BUILT || null,
    value: props.TOTAL_VALUE != null ? props.TOTAL_VALUE : null,
    sqft: props.SQFT || props.BLDG_SQFT || null,
    beds: props.BEDROOMS || props.BEDS || null,
    baths: props.BATHROOMS || props.BATHS || null,
    acres: props.ACRES || null,
    landUse: props.LOC_LAND_U || null,
    address,
  }
}


function ContactBlock({ parcelId, props, address, parcel, onPhoneClick, shell = 'card' }) {
  const skipTracedInfo = getSkipTracedParcel(parcelId)
  if (!skipTracedInfo) return null
  const phoneDetails = skipTracedInfo.phoneDetails || (skipTracedInfo.phoneNumbers || (skipTracedInfo.phone ? [skipTracedInfo.phone] : [])).map((v, i) => ({ value: v, verified: null, callerId: '', primary: i === 0 }))
  const emailDetails = skipTracedInfo.emailDetails || (skipTracedInfo.emails || (skipTracedInfo.email ? [skipTracedInfo.email] : [])).map((v, i) => ({ value: v, verified: null, primary: i === 0 }))
  const hasContact = phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo.address || skipTracedInfo.skipTracedAt
  if (!hasContact) return null

  const parcelData = {
    id: parcelId,
    properties: props,
    address,
    lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
    lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null,
  }

  const inner = (
    <>
      <div className={cn('text-[11px] font-semibold uppercase tracking-wider mb-2', lab)}>Contact</div>
      {phoneDetails.map((p, idx) => (
        <div key={idx} className="text-sm flex items-center gap-1 flex-wrap mb-1">
          <span className={cn('font-medium', lab)}>{phoneDetails.length > 1 ? `Phone ${idx + 1}` : 'Phone'}</span>
          <VerifiedBadge verified={p.verified} />
          {onPhoneClick ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onPhoneClick(p.value, parcelData) }} className="text-sky-300 hover:text-sky-200 underline text-left">
              {p.value}
            </button>
          ) : (
            <a href={`tel:${(p.value || '').replace(/[^\d+]/g, '')}`} className="text-sky-300 hover:text-sky-200 underline">{p.value}</a>
          )}
        </div>
      ))}
      {emailDetails.map((e, idx) => (
        <div key={idx} className="text-sm flex items-center gap-1 mb-1">
          <span className={cn('font-medium', lab)}>{emailDetails.length > 1 ? `Email ${idx + 1}` : 'Email'}</span>
          <VerifiedBadge verified={e.verified} />
          <span className={val}>{e.value}</span>
        </div>
      ))}
      {skipTracedInfo.skipTracedAt && (
        <div className="text-xs text-white/40 mt-1">Traced {new Date(skipTracedInfo.skipTracedAt).toLocaleDateString()}</div>
      )}
    </>
  )

  if (shell === 'spec') {
    return <div className="mt-3 pl-3 border-l-2 border-emerald-500/40">{inner}</div>
  }
  return <div className={cn('mt-3', cardInner)}>{inner}</div>
}

function NotesBlock({ parcelId, accent }) {
  const parcelNote = getParcelNote(parcelId)
  if (!parcelNote) return null
  return (
    <div className={cn('mt-3', accent === 'warm' ? 'rounded-xl border border-amber-400/25 bg-amber-500/[0.08] p-3' : cardInner)}>
      <div className={cn('text-[11px] font-semibold uppercase tracking-wider mb-1', lab)}>Notes</div>
      <div className={cn('text-sm whitespace-pre-wrap leading-relaxed', val)}>{parcelNote}</div>
    </div>
  )
}

function buildFactRows(props) {
  const rows = []
  const push = (label, v) => { if (v != null && v !== '') rows.push({ label, value: v }) }
  push('Land use', props.LOC_LAND_U)
  push('Acres', props.ACRES)
  return rows
}

/** Spotlight — gradient accent, hero owner line, metric chips, soft cards */
function LayoutSpotlight({
  data, props, extraRows, removeBtn, contact, notes, actions,
  boundaryColor,
}) {
  const ownerOccupied = computeOwnerOccupied(props)
  const chips = []
  if (data.value != null) chips.push({ key: 'v', label: typeof data.value === 'number' ? `$${data.value.toLocaleString()}` : String(data.value) })
  if (data.sqft) chips.push({ key: 'sq', label: `${Number(data.sqft).toLocaleString()} sf` })
  if (data.beds || data.baths) chips.push({ key: 'br', label: `${data.beds ?? '—'} bd / ${data.baths ?? '—'} ba` })

  return (
    <div className="parcel-expanded-glass border-t relative rounded-b-xl overflow-hidden">
      <div className="h-1 w-full" style={boundaryOpenGradientStyle(boundaryColor)} />
      <div className="px-4 pb-4 pt-3">
        {removeBtn}
        {data.owner && <h3 className="text-lg font-semibold text-white tracking-tight pr-8">{data.owner}</h3>}
        {(data.year || ownerOccupied != null || chips.length > 0) && (
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            {data.year && (
              <span className={metricChipClass}>Built {data.year}</span>
            )}
            <OwnerOccupiedBadge ownerOccupied={ownerOccupied} />
            {chips.map((c) => (
              <span key={c.key} className={metricChipClass}>
                {c.label}
              </span>
            ))}
          </div>
        )}
        {extraRows.length > 0 && (
          <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
            {extraRows.map((r) => (
              <div key={r.label} className="flex justify-between gap-3 text-sm">
                <span className={lab}>{r.label}</span>
                <span className={cn('text-right', val)}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
        {contact}
        {notes}
        {actions}
      </div>
    </div>
  )
}

const iconWrap =
  'h-10 w-10 shrink-0 rounded-xl parcel-dropdown-btn flex items-center justify-center border border-white/20 text-white/90 hover:bg-white/[0.08] transition-colors'

function ParcelExpandedIconActions({
  parcel, parcelId, props, address,
  onOpenParcelDetails, onSkipTraceParcel, onConvertToLead,
  isParcelALeadProp, skipTracingInProgress, handleCenterParcel, setRefreshTrigger,
}) {
  const parcelData = () => ({
    id: parcelId,
    properties: props,
    address,
    lat: parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null,
    lng: parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null,
  })
  const leadCheck = (isParcelALeadProp ?? isParcelALead)(parcelId)
  const lat = parcel.lat || props.LATITUDE ? parseFloat(parcel.lat || props.LATITUDE) : null
  const lng = parcel.lng || props.LONGITUDE ? parseFloat(parcel.lng || props.LONGITUDE) : null

  const skipTraceEl = onSkipTraceParcel && (() => {
    const hasSkipTraced = isParcelSkipTraced(parcelId)
    const isInProgress = skipTracingInProgress.has(parcelId)
    if (hasSkipTraced || isInProgress) {
      return (
        <div
          className={cn(
            'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border',
            hasSkipTraced ? 'parcel-dropdown-status-success text-green-700' : 'parcel-dropdown-status-pending text-yellow-700'
          )}
          title={hasSkipTraced ? 'Contact found' : 'Skip tracing…'}
        >
          {hasSkipTraced ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )
    }
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0 rounded-xl parcel-dropdown-btn"
        title="Get contact"
        onClick={(e) => {
          e.stopPropagation()
          onSkipTraceParcel(parcelData())
          setTimeout(() => setRefreshTrigger(p => p + 1), 3000)
        }}
      >
        <Phone className="h-4 w-4" />
      </Button>
    )
  })()

  /** Equal-width columns so icons span the full parcel row */
  const cell = (key, child) => (
    <div key={key} className="flex min-w-0 flex-1 basis-0 justify-center items-center">
      {child}
    </div>
  )

  const row = []
  if (onOpenParcelDetails) {
    row.push(cell('details', (
      <button type="button" title="More details" className={iconWrap} onClick={(e) => { e.stopPropagation(); onOpenParcelDetails(parcelData()) }}>
        <Info className="h-4 w-4" />
      </button>
    )))
  }
  if (onSkipTraceParcel && skipTraceEl) {
    row.push(cell('skip', skipTraceEl))
  }
  if (parcel.lat && parcel.lng) {
    row.push(cell('map', (
      <button type="button" title="Center on map" className={iconWrap} onClick={(e) => { e.stopPropagation(); handleCenterParcel(parcel) }}>
        <MapPin className="h-4 w-4" />
      </button>
    )))
  }
  row.push(cell('directions', (
    <DirectionsPicker lat={lat} lng={lng} variant="icon" className="[&_button]:!h-10 [&_button]:!w-10 [&_button]:rounded-xl [&_button]:border [&_button]:border-white/20" />
  )))
  if (onConvertToLead && !leadCheck) {
    row.push(cell('pipeline', (
      <button
        type="button"
        title="Add to Pipeline"
        className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-purple-600/80 hover:bg-purple-600 text-white transition-colors"
        onClick={(e) => { e.stopPropagation(); onConvertToLead(parcelData()) }}
      >
        <UserPlus className="h-[13px] w-[13px]" />
      </button>
    )))
  }

  return (
    <div className="flex w-full items-center mt-4 pt-3 border-t border-white/10">
      {row}
    </div>
  )
}

/** Expanded parcel inside list view (Spotlight layout). */
export function ListParcelExpanded({
  parcel,
  parcelId,
  selectedListId,
  address,
  props: parcelProps,
  onRemoveParcel,
  handleRemoveParcel,
  onOpenParcelDetails,
  onPhoneClick,
  onSkipTraceParcel,
  onConvertToLead,
  isParcelALeadProp,
  skipTracingInProgress,
  handleCenterParcel,
  setRefreshTrigger,
  boundaryColor = '#2563eb',
}) {
  const props = parcelProps
  const data = getParcelData(props, parcel, address)

  const removeBtn = onRemoveParcel && (
    <Button variant="ghost" size="icon" className="absolute top-3 right-2 h-8 w-8 text-white/40 hover:text-red-400 hover:bg-white/10" onClick={(e) => { e.stopPropagation(); handleRemoveParcel(selectedListId, parcelId) }} title="Remove from List">
      <Trash2 className="h-4 w-4" />
    </Button>
  )

  const common = {
    parcel,
    parcelId,
    props,
    address,
    onOpenParcelDetails,
    onSkipTraceParcel,
    onConvertToLead,
    isParcelALeadProp,
    skipTracingInProgress,
    handleCenterParcel,
    setRefreshTrigger,
  }

  const spotlightDetails = buildFactRows(props)
  return (
    <LayoutSpotlight
      boundaryColor={boundaryColor}
      data={data}
      props={props}
      extraRows={spotlightDetails}
      removeBtn={removeBtn}
      contact={<ContactBlock parcelId={parcelId} props={props} address={address} parcel={parcel} onPhoneClick={onPhoneClick} shell="card" />}
      notes={<NotesBlock parcelId={parcelId} />}
      actions={<ParcelExpandedIconActions {...common} />}
    />
  )
}
