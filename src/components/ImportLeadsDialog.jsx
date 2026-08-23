import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Loader2, Upload } from 'lucide-react'
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
  MAX_IMPORT_ROWS,
  downloadSampleLeadCsv,
  emptyColumnMapping,
  guessColumnMapping,
  mappingHasName,
  previewImportRows,
} from '@/utils/leadCsvImport'
import { geocodeLeadsForImport } from '@/utils/geocodeAddress'
import { displayLeadName, importLeadsInChunks } from '@/utils/leads'
import { cn } from '@/lib/utils'

const SELECT_CLASS = 'w-full text-sm rounded-lg px-3 py-2 bg-white/5 border border-white/15'

const EMPTY_SHARE = { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }

function stepTitle(step) {
  if (step === 'map') return 'Map columns'
  if (step === 'preview') return 'Preview import'
  if (step === 'share') return 'Sharing'
  if (step === 'importing') return 'Importing leads'
  if (step === 'result') return 'Import complete'
  return 'Import leads'
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
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping(emptyColumnMapping())
    setPlaceOnMap(true)
    setShareState(EMPTY_SHARE)
    setProgress(null)
    setResult(null)
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

  const handleFile = async (file) => {
    if (!file) return
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

  const handleImport = async () => {
    const valid = preview.records.filter((r) => r.status === 'valid' && r.lead)
    if (!valid.length) {
      showToast('No valid leads to import', 'warning')
      return
    }
    setStep('importing')
    setProgress({ phase: placeOnMap ? 'geocode' : 'import', done: 0, total: valid.length })
    try {
      let payloads = valid.map((r) => r.lead)
      if (placeOnMap) {
        payloads = await geocodeLeadsForImport(payloads, {
          onProgress: (done, total) => setProgress({ phase: 'geocode', done, total }),
        })
      }
      const sharePayload = activeTeam
        ? shareState
        : { visibility: VISIBILITY.PRIVATE, sharedMemberUids: [] }
      const imported = await importLeadsInChunks(getToken, payloads, sharePayload, {
        onProgress: ({ processed, total }) => setProgress({ phase: 'import', done: processed, total }),
      })
      if (imported.created.length) onImported?.(imported.created)
      setResult({
        created: imported.created.length,
        failed: imported.errors.length,
        duplicates: preview.counts.duplicate,
        invalid: preview.counts.invalid,
        errors: imported.errors.slice(0, 8),
        sharing: visibilityLabel({
          visibility: sharePayload.visibility,
          sharedMemberUids: sharePayload.sharedMemberUids,
          teamShares: sharePayload.visibility === VISIBILITY.TEAM && activeTeam?.id ? [activeTeam.id] : [],
        }),
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

  const previewRows = preview.records.slice(0, 20)

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
          />
          <DialogDescription className="sr-only">
            Import leads from a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="scrollbar-hide px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            {step === 'upload' && (
              <div className="space-y-4">
                <p className="text-sm opacity-70">
                  Upload a CSV of names, addresses, and contact info. You can map columns next.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border border-dashed border-white/25 bg-white/5 px-4 py-10 text-center hover:bg-white/10"
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm font-medium">Choose CSV file</div>
                  <div className="text-xs opacity-50 mt-1">Up to {MAX_IMPORT_ROWS} rows</div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
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
              <div className="space-y-3">
                <p className="text-xs opacity-50 truncate">{fileName} · {rows.length} rows</p>
                {LEAD_IMPORT_FIELDS.map((field) => (
                  <label key={field.id} className="block">
                    <span className="text-xs opacity-60 mb-1 block">{field.label}</span>
                    <select
                      className={SELECT_CLASS}
                      value={mapping[field.id] ?? ''}
                      onChange={(e) => setFieldMapping(field.id, e.target.value)}
                    >
                      <option value="">Don&apos;t import</option>
                      {headers.map((header, i) => (
                        <option key={`${field.id}-${i}`} value={String(i)}>{header || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
                {leadCustomFields.map((field) => (
                  <label key={field.id} className="block">
                    <span className="text-xs opacity-60 mb-1 block">{field.label}</span>
                    <select
                      className={SELECT_CLASS}
                      value={mapping.customFields?.[field.id] ?? ''}
                      onChange={(e) => setCustomMapping(field.id, e.target.value)}
                    >
                      <option value="">Don&apos;t import</option>
                      {headers.map((header, i) => (
                        <option key={`${field.id}-${i}`} value={String(i)}>{header || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {step === 'share' && (
              <div className="space-y-3">
                <p className="text-sm opacity-70">
                  Who should be able to see these {preview.counts.valid} lead{preview.counts.valid === 1 ? '' : 's'}?
                </p>
                <ResourceSharePicker
                  team={activeTeam}
                  visibility={shareState.visibility}
                  sharedMemberUids={shareState.sharedMemberUids}
                  onChange={setShareState}
                  allowExternalSharing={allowExternalSharing}
                  defaultExpanded
                />
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-3">
                {preview.error ? (
                  <p className="text-sm text-red-300">{preview.error}</p>
                ) : (
                  <>
                    <p className="text-sm opacity-70">
                      {preview.counts.valid} ready
                      {preview.counts.duplicate ? ` · ${preview.counts.duplicate} duplicate` : ''}
                      {preview.counts.invalid ? ` · ${preview.counts.invalid} invalid` : ''}
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={placeOnMap}
                        onChange={(e) => setPlaceOnMap(e.target.checked)}
                      />
                      Place on map (geocode addresses)
                    </label>
                    <div className="rounded-lg border border-white/10 overflow-hidden text-xs">
                      <div className="grid grid-cols-3 gap-2 px-3 py-2 opacity-50 border-b border-white/10">
                        <span>Name</span>
                        <span>Address</span>
                        <span>Status</span>
                      </div>
                      {previewRows.map((record) => (
                        <div
                          key={record.rowIndex}
                          className={cn(
                            'grid grid-cols-3 gap-2 px-3 py-2 border-b border-white/5',
                            record.status !== 'valid' && 'opacity-50',
                          )}
                        >
                          <span className="truncate">{record.lead ? displayLeadName(record.lead) : '—'}</span>
                          <span className="truncate">{record.lead?.address || '—'}</span>
                          <span className="truncate">{record.status === 'valid' ? (record.lead?.status || 'new') : record.error}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 'importing' && (
              <div className="py-10 text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto opacity-70" />
                <p className="text-sm opacity-70">
                  {progress?.phase === 'geocode'
                    ? `Finding map locations… ${progress.done}/${progress.total}`
                    : `Creating leads… ${progress?.done || 0}/${progress?.total || 0}`}
                </p>
              </div>
            )}

            {step === 'result' && result && (
              <div className="space-y-3 text-sm">
                <p>
                  Imported <strong>{result.created}</strong> lead{result.created === 1 ? '' : 's'}.
                </p>
                {result.sharing && (
                  <p className="opacity-70">Sharing: {result.sharing}.</p>
                )}
                {result.duplicates > 0 && (
                  <p className="opacity-70">{result.duplicates} skipped as duplicates.</p>
                )}
                {result.invalid > 0 && (
                  <p className="opacity-70">{result.invalid} skipped — missing a name.</p>
                )}
                {result.failed > 0 && (
                  <p className="opacity-70">{result.failed} failed on the server.</p>
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
