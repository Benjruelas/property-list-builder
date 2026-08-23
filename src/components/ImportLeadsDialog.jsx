import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  MapPin,
  Upload,
  X,
} from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ResourceSharePicker } from './ResourceSharePicker'
import { showToast } from './ui/toast'
import { VISIBILITY, visibilityLabel } from '@/utils/access'
import { getTeamForMembership } from '@/utils/profile'
import { parseCsv } from '@/utils/csv'
import {
  LEAD_IMPORT_FIELDS,
  LEAD_IMPORT_FIELD_GROUPS,
  MAX_IMPORT_ROWS,
  applyCreatedTagsToLeads,
  downloadSampleLeadCsv,
  emptyColumnMapping,
  guessColumnMapping,
  mappingHasName,
  previewImportRows,
} from '@/utils/leadCsvImport'
import { geocodeLeadsForImport } from '@/utils/geocodeAddress'
import { displayLeadName, importLeadsInChunks } from '@/utils/leads'
import { createTag, upsertTagInRegistry } from '@/utils/tags'
import { cn } from '@/lib/utils'

const SELECT_CLASS = 'w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15'
const WIZARD_STEPS = [
  { id: 'upload', label: 'File' },
  { id: 'map', label: 'Columns' },
  { id: 'preview', label: 'Preview' },
  { id: 'share', label: 'Share' },
]

const EMPTY_SHARE = { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PREVIEW_LIMIT = 40

function parseShareEmails(value) {
  const parts = String(value || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const valid = []
  const invalid = []
  for (const part of parts) {
    if (EMAIL_RE.test(part) && part.length <= 254) valid.push(part)
    else invalid.push(part)
  }
  return { valid: [...new Set(valid)], invalid }
}

function stepTitle(step) {
  if (step === 'map') return 'Map columns'
  if (step === 'preview') return 'Preview import'
  if (step === 'share') return 'Sharing'
  if (step === 'importing') return 'Importing leads'
  if (step === 'result') return 'Import complete'
  return 'Import leads'
}

function sampleCell(rows, index) {
  if (index === '' || index == null) return ''
  const n = Number(index)
  if (!Number.isInteger(n) || n < 0) return ''
  return String(rows?.[0]?.[n] ?? '').trim()
}

function WizardSteps({ current }) {
  const idx = WIZARD_STEPS.findIndex((s) => s.id === current)
  if (idx < 0) return null
  return (
    <ol className="flex items-center gap-1.5 mt-3" aria-label="Import steps">
      {WIZARD_STEPS.map((step, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <li key={step.id} className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                'h-5 min-w-5 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center',
                done && 'bg-sky-500/25 text-sky-100',
                active && 'bg-white/20 text-white',
                !done && !active && 'bg-white/5 text-white/40',
              )}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn('text-[11px]', active ? 'opacity-90' : 'opacity-40')}>
              {step.label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span className="w-4 h-px bg-white/15 mx-0.5" aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StatChip({ label, value, tone = 'neutral' }) {
  const toneClass = {
    ready: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
    warn: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    bad: 'border-red-400/30 bg-red-500/10 text-red-100',
    neutral: 'border-white/10 bg-white/5 text-white/80',
  }[tone]
  return (
    <div className={cn('rounded-lg border px-3 py-2 min-w-0', toneClass)}>
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="text-[11px] opacity-70 mt-1">{label}</div>
    </div>
  )
}

function PreviewStatusBadge({ record, leadStatuses = [] }) {
  if (record.status === 'duplicate') {
    return <span className="text-[11px] text-amber-200/90">Duplicate</span>
  }
  if (record.status === 'invalid') {
    return <span className="text-[11px] text-red-200/90">{record.error || 'Invalid'}</span>
  }
  const id = record.lead?.status || 'new'
  const def = leadStatuses.find((s) => s.id === id)
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
      def?.color || 'bg-white/10 border-white/15',
    )}
    >
      {def?.label || id}
    </span>
  )
}

function MappingField({
  id,
  label,
  value,
  headers,
  rows,
  onChange,
}) {
  const sample = sampleCell(rows, value)
  const mapped = !!value
  return (
    <label className="block">
      <span className="text-xs opacity-60 mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        {mapped && <CheckCircle2 className="h-3 w-3 text-emerald-300/80 shrink-0" />}
      </span>
      <select
        className={SELECT_CLASS}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Don&apos;t import</option>
        {headers.map((header, i) => (
          <option key={`${id}-${i}`} value={String(i)}>{header || `Column ${i + 1}`}</option>
        ))}
      </select>
      {sample ? (
        <span className="block text-[11px] opacity-40 truncate mt-1">Sample: {sample}</span>
      ) : null}
    </label>
  )
}

export function ImportLeadsDialog({
  open,
  onOpenChange,
  getToken,
  existingLeads = [],
  leadStatuses = [],
  leadCustomFields = [],
  tagRegistry = { leads: [] },
  teams = [],
  teamMembership = null,
  onImported,
  onRefreshTags,
  nestedOverlay = false,
  topLayer: topLayerProp,
}) {
  const topLayer = topLayerProp ?? nestedOverlay
  const activeTeam = getTeamForMembership(teams, teamMembership) || teams?.[0] || null
  const allowExternalSharing = teamMembership?.allowExternalSharing === true
  const fileInputRef = useRef(null)
  const [step, setStep] = useState('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState(emptyColumnMapping)
  const [placeOnMap, setPlaceOnMap] = useState(true)
  const [shareState, setShareState] = useState(EMPTY_SHARE)
  const [sharedWithEmails, setSharedWithEmails] = useState([])
  const [shareEmailDraft, setShareEmailDraft] = useState('')
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewFilter, setPreviewFilter] = useState('all')

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping(emptyColumnMapping())
    setPlaceOnMap(true)
    setShareState(EMPTY_SHARE)
    setSharedWithEmails([])
    setShareEmailDraft('')
    setProgress(null)
    setResult(null)
    setDragOver(false)
    setPreviewFilter('all')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const preview = useMemo(
    () => previewImportRows(rows, mapping, {
      existingLeads,
      leadStatuses,
      tagRegistry,
      customFields: leadCustomFields,
    }),
    [rows, mapping, existingLeads, leadStatuses, tagRegistry, leadCustomFields],
  )

  const mappedFieldCount = useMemo(() => {
    const core = LEAD_IMPORT_FIELDS.filter((field) => mapping?.[field.id]).length
    const custom = leadCustomFields.filter((field) => mapping?.customFields?.[field.id]).length
    return core + custom
  }, [mapping, leadCustomFields])

  const handleFile = async (file) => {
    if (!file) return
    const name = String(file.name || '').toLowerCase()
    if (file.type && !file.type.includes('csv') && !name.endsWith('.csv')) {
      showToast('Choose a .csv file', 'error')
      return
    }
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (!parsed.headers.length) {
        showToast('Could not read any columns from that CSV', 'error')
        return
      }
      if (parsed.rows.length === 0) {
        showToast('That CSV has no data rows', 'error')
        return
      }
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        showToast(`Import up to ${MAX_IMPORT_ROWS} leads at a time`, 'error')
        return
      }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(guessColumnMapping(parsed.headers, { customFields: leadCustomFields }))
      setPreviewFilter('all')
      setStep('map')
    } catch {
      showToast('Could not read that file', 'error')
    }
  }

  const setFieldMapping = (fieldId, value) => {
    setMapping((prev) => ({ ...prev, [fieldId]: value }))
  }

  const setCustomMapping = (fieldId, value) => {
    setMapping((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: value },
    }))
  }

  const addShareEmails = (raw = shareEmailDraft) => {
    const { valid, invalid } = parseShareEmails(raw)
    if (invalid.length) {
      showToast(`Not a valid email: ${invalid[0]}`, 'error')
      return
    }
    if (!valid.length) return
    setSharedWithEmails((prev) => [...new Set([...prev, ...valid])])
    setShareEmailDraft('')
  }

  const handleImport = async () => {
    const valid = preview.records.filter((r) => r.status === 'valid' && r.lead)
    if (!valid.length) {
      showToast('No valid leads to import', 'warning')
      return
    }
    let emails = sharedWithEmails
    if (!activeTeam && shareEmailDraft.trim()) {
      const parsed = parseShareEmails(shareEmailDraft)
      if (parsed.invalid.length) {
        showToast(`Not a valid email: ${parsed.invalid[0]}`, 'error')
        return
      }
      emails = [...new Set([...sharedWithEmails, ...parsed.valid])]
      setSharedWithEmails(emails)
      setShareEmailDraft('')
    }
    setStep('importing')
    setProgress({ phase: placeOnMap ? 'geocode' : 'import', done: 0, total: valid.length })
    try {
      let registry = tagRegistry
      const namesToCreate = preview.tagsToCreate || []
      for (const name of namesToCreate) {
        const tag = await createTag(getToken, 'leads', name)
        registry = upsertTagInRegistry(registry, 'leads', tag)
        onRefreshTags?.(tag)
      }
      let payloads = applyCreatedTagsToLeads(valid.map((r) => r.lead), registry)
      if (placeOnMap) {
        payloads = await geocodeLeadsForImport(payloads, {
          onProgress: (done, total) => setProgress({ phase: 'geocode', done, total }),
        })
      }
      const sharePayload = activeTeam
        ? { ...shareState, sharedWith: [] }
        : { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [], sharedWith: emails }
      const imported = await importLeadsInChunks(getToken, payloads, sharePayload, {
        onProgress: ({ processed, total }) => setProgress({ phase: 'import', done: processed, total }),
      })
      if (imported.created.length) onImported?.(imported.created)
      const sharing = sharePayload.sharedWith?.length
        ? `Shared with ${sharePayload.sharedWith.join(', ')}`
        : visibilityLabel({
          visibility: sharePayload.visibility,
          sharedMemberUids: sharePayload.sharedMemberUids,
          teamShares: sharePayload.visibility === VISIBILITY.TEAM && activeTeam?.id ? [activeTeam.id] : [],
        })
      setResult({
        created: imported.created.length,
        failed: imported.errors.length,
        duplicates: preview.counts.duplicate,
        invalid: preview.counts.invalid,
        errors: imported.errors.slice(0, 8),
        sharing,
      })
      setStep('result')
      if (imported.created.length) {
        showToast(
          `Imported ${imported.created.length} lead${imported.created.length === 1 ? '' : 's'}`,
          'success',
        )
      }
    } catch (err) {
      showToast(err.message || 'Could not import leads', 'error')
      setStep('share')
    } finally {
      setProgress(null)
    }
  }

  const filteredPreviewRows = useMemo(() => {
    const list = previewFilter === 'all'
      ? preview.records
      : preview.records.filter((record) => record.status === previewFilter)
    return list.slice(0, PREVIEW_LIMIT)
  }, [preview.records, previewFilter])

  const progressPct = progress?.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  const dropFile = (event) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <Dialog open={open} modal={false} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel list-panel create-lead-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        nestedOverlay={nestedOverlay}
        topLayer={topLayer}
      >
        <DialogHeader
          className="px-5 pt-5 pb-3 border-b border-white/20 flex-shrink-0 text-left"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <PanelHeader
            onBack={() => {
              if (step === 'map') setStep('upload')
              else if (step === 'preview') setStep('map')
              else if (step === 'share') setStep('preview')
              else onOpenChange(false)
            }}
            title={stepTitle(step)}
            icon={FileUp}
            subtitle={fileName && step !== 'upload' && step !== 'result'
              ? `${fileName} · ${rows.length} row${rows.length === 1 ? '' : 's'}`
              : null}
          />
          <WizardSteps current={step} />
          <DialogDescription className="sr-only">
            Import leads from a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="scrollbar-hide px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {step === 'upload' && (
              <div className="space-y-4">
                <p className="text-sm opacity-70">
                  Upload a CSV of names, addresses, and contact info. Jobber client exports are detected automatically.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={dropFile}
                  className={cn(
                    'w-full rounded-xl border border-dashed px-4 py-12 text-center transition-colors',
                    dragOver
                      ? 'border-sky-400/50 bg-sky-500/10'
                      : 'border-white/25 bg-white/5 hover:bg-white/10',
                  )}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm font-medium">
                    {dragOver ? 'Drop CSV to import' : 'Choose or drop a CSV file'}
                  </div>
                  <div className="text-xs opacity-50 mt-1">Up to {MAX_IMPORT_ROWS.toLocaleString()} rows</div>
                </button>
                <button
                  type="button"
                  className="text-xs opacity-70 underline underline-offset-2"
                  onClick={downloadSampleLeadCsv}
                >
                  Download sample template
                </button>
              </div>
            )}

            {step === 'map' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 opacity-50 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{fileName}</div>
                      <div className="text-[11px] opacity-50">
                        {mappedFieldCount} field{mappedFieldCount === 1 ? '' : 's'} mapped
                        {mapping.source === 'jobber' ? ' · Jobber preset' : ''}
                      </div>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Change
                  </Button>
                </div>

                {mapping.source === 'jobber' && (
                  <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2.5">
                    <div className="text-sm font-medium">Jobber export detected</div>
                    <p className="text-xs opacity-70 mt-1">
                      {rows.length} property row{rows.length === 1 ? '' : 's'} will become{' '}
                      {preview.counts.total} client{preview.counts.total === 1 ? '' : 's'}.
                      Extra phones, emails, and job-site addresses are collected automatically.
                    </p>
                  </div>
                )}

                {!mappingHasName(mapping) && (
                  <div className="flex items-start gap-2 text-xs text-amber-100/90 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Map a name column (first, last, full name, or company) to continue.
                  </div>
                )}

                {LEAD_IMPORT_FIELD_GROUPS.map((group) => {
                  const fields = LEAD_IMPORT_FIELDS.filter((field) => group.fieldIds.includes(field.id))
                  return (
                    <section key={group.id} className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide opacity-45">{group.label}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {fields.map((field) => (
                          <MappingField
                            key={field.id}
                            id={field.id}
                            label={field.label}
                            value={mapping[field.id] ?? ''}
                            headers={headers}
                            rows={rows}
                            onChange={(value) => setFieldMapping(field.id, value)}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}

                {leadCustomFields.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide opacity-45">Custom fields</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {leadCustomFields.map((field) => (
                        <MappingField
                          key={field.id}
                          id={field.id}
                          label={field.label}
                          value={mapping.customFields?.[field.id] ?? ''}
                          headers={headers}
                          rows={rows}
                          onChange={(value) => setCustomMapping(field.id, value)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {step === 'share' && (
              <div className="space-y-3">
                <p className="text-sm opacity-70">
                  Who should be able to see these {preview.counts.valid} lead{preview.counts.valid === 1 ? '' : 's'}?
                </p>
                {activeTeam ? (
                  <ResourceSharePicker
                    team={activeTeam}
                    visibility={shareState.visibility}
                    sharedMemberUids={shareState.sharedMemberUids}
                    onChange={setShareState}
                    allowExternalSharing={allowExternalSharing}
                    defaultExpanded
                  />
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs opacity-60">
                      Leads stay private to you unless you add someone by email.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={shareEmailDraft}
                        onChange={(e) => setShareEmailDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addShareEmails()
                          }
                        }}
                        placeholder="user@example.com"
                        className={cn(SELECT_CLASS, 'flex-1')}
                        aria-label="Email to share with"
                      />
                      <Button type="button" variant="ghost" onClick={() => addShareEmails()}>
                        Add
                      </Button>
                    </div>
                    {sharedWithEmails.length > 0 && (
                      <ul className="space-y-1">
                        {sharedWithEmails.map((email) => (
                          <li
                            key={email}
                            className="flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/10"
                          >
                            <span className="truncate">{email}</span>
                            <button
                              type="button"
                              className="opacity-60 hover:opacity-100"
                              aria-label={`Remove ${email}`}
                              onClick={() => setSharedWithEmails((prev) => prev.filter((e) => e !== email))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-4">
                {preview.error ? (
                  <p className="text-sm text-red-300">{preview.error}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <StatChip label="Ready" value={preview.counts.valid} tone="ready" />
                      <StatChip label="Duplicates" value={preview.counts.duplicate} tone={preview.counts.duplicate ? 'warn' : 'neutral'} />
                      <StatChip label="Invalid" value={preview.counts.invalid} tone={preview.counts.invalid ? 'bad' : 'neutral'} />
                    </div>
                    {preview.source === 'jobber' && preview.counts.sourceRows != null && (
                      <p className="text-xs opacity-55">
                        {preview.counts.sourceRows} Jobber rows grouped into {preview.counts.total} clients
                      </p>
                    )}
                    {preview.tagsToCreate?.length > 0 && (
                      <div className="text-xs opacity-70">
                        <span className="opacity-60">Will create tags:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {preview.tagsToCreate.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={placeOnMap}
                        onChange={(e) => setPlaceOnMap(e.target.checked)}
                      />
                      <MapPin className="h-3.5 w-3.5 opacity-50" />
                      Place on map
                      <span className="text-xs opacity-50">Geocode addresses</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'all', label: 'All', count: preview.counts.total },
                        { id: 'valid', label: 'Ready', count: preview.counts.valid },
                        { id: 'duplicate', label: 'Duplicates', count: preview.counts.duplicate },
                        { id: 'invalid', label: 'Invalid', count: preview.counts.invalid },
                      ].filter((tab) => tab.id === 'all' || tab.count > 0).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPreviewFilter(tab.id)}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[11px] border',
                            previewFilter === tab.id
                              ? 'border-white/25 bg-white/15'
                              : 'border-white/10 bg-white/5 opacity-70',
                          )}
                        >
                          {tab.label} {tab.count}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-lg border border-white/10 overflow-hidden text-xs">
                      <div className="grid grid-cols-[1.2fr_1.4fr_auto] gap-2 px-3 py-2 opacity-50 border-b border-white/10">
                        <span>Name</span>
                        <span>Address</span>
                        <span>Status</span>
                      </div>
                      {filteredPreviewRows.length === 0 ? (
                        <p className="px-3 py-4 opacity-50">No rows in this view.</p>
                      ) : filteredPreviewRows.map((record) => {
                        const extraAddresses = Math.max(0, (record.lead?.addressDetails?.length || 0) - 1)
                        return (
                          <div
                            key={record.rowIndex}
                            className={cn(
                              'grid grid-cols-[1.2fr_1.4fr_auto] gap-2 px-3 py-2 border-b border-white/5 items-center',
                              record.status !== 'valid' && 'opacity-55',
                            )}
                          >
                            <span className="truncate">{record.lead ? displayLeadName(record.lead) : '—'}</span>
                            <span className="truncate">
                              {record.lead?.address || '—'}
                              {extraAddresses > 0 && (
                                <span className="opacity-50"> +{extraAddresses}</span>
                              )}
                            </span>
                            <PreviewStatusBadge record={record} leadStatuses={leadStatuses} />
                          </div>
                        )
                      })}
                    </div>
                    {preview.records.length > PREVIEW_LIMIT && previewFilter === 'all' && (
                      <p className="text-[11px] opacity-40">Showing the first {PREVIEW_LIMIT} of {preview.records.length}.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 'importing' && (
              <div className="py-10 text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-70" />
                <div>
                  <p className="text-sm">
                    {progress?.phase === 'geocode' ? 'Finding map locations…' : 'Creating leads…'}
                  </p>
                  <p className="text-xs opacity-50 mt-1">
                    {progress?.done || 0} of {progress?.total || 0}
                  </p>
                </div>
                <div className="max-w-xs mx-auto h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-sky-400/80 transition-[width] duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {step === 'result' && result && (
              <div className="space-y-4 text-sm">
                <div className="text-center py-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-300/90" />
                  <p className="text-base font-medium">
                    Imported {result.created} lead{result.created === 1 ? '' : 's'}
                  </p>
                  {result.sharing && (
                    <p className="text-xs opacity-55 mt-1">Sharing: {result.sharing}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatChip label="Imported" value={result.created} tone="ready" />
                  <StatChip label="Duplicates" value={result.duplicates} tone={result.duplicates ? 'warn' : 'neutral'} />
                  <StatChip
                    label="Skipped"
                    value={result.invalid + result.failed}
                    tone={(result.invalid + result.failed) ? 'bad' : 'neutral'}
                  />
                </div>
                {result.invalid > 0 && (
                  <p className="text-xs opacity-60">{result.invalid} skipped — missing a name.</p>
                )}
                {result.failed > 0 && (
                  <p className="text-xs opacity-60">{result.failed} failed on the server.</p>
                )}
                {result.errors?.length > 0 && (
                  <ul className="text-xs opacity-60 space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={`${err.index}-${i}`}>Row {(err.index ?? 0) + 2}: {err.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2 px-5 py-4 border-t border-white/20"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {step === 'upload' && (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            {step === 'map' && (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep('upload')}>Back</Button>
                <Button
                  type="button"
                  disabled={!mappingHasName(mapping)}
                  onClick={() => setStep('preview')}
                >
                  Continue
                </Button>
              </>
            )}
            {step === 'preview' && (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep('map')}>Back</Button>
                <Button
                  type="button"
                  disabled={!preview.counts.valid || !!preview.error}
                  onClick={() => setStep('share')}
                >
                  Continue
                </Button>
              </>
            )}
            {step === 'share' && (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep('preview')}>Back</Button>
                <Button
                  type="button"
                  disabled={
                    shareState.visibility === VISIBILITY.MEMBERS
                    && !(shareState.sharedMemberUids || []).length
                  }
                  onClick={handleImport}
                >
                  Import {preview.counts.valid || 0} lead{preview.counts.valid === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {step === 'result' && (
              <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ImportLeadsDialog
