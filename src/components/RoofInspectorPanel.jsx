import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { X, Home, CloudRain, Satellite, Loader2, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, ZoomIn, FileText, Download } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { getSettings } from '../utils/settings'

function SectionHeader({ icon: Icon, title, children }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold opacity-90 pb-1.5 border-b border-white/10 mb-2">
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="flex-1">{title}</span>
      {children}
    </div>
  )
}

function HailSizeIndicator({ inches }) {
  if (!inches) return null
  const color = inches < 1 ? 'bg-yellow-500' : inches < 2 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[2rem] h-5 px-1.5 ${color}`}>
      {inches}"
    </span>
  )
}

function HailYearGroup({ year, events, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const maxSize = events.reduce((m, e) => Math.max(m, e.hail_size_inches || 0), 0)
  const severityColor = maxSize >= 2 ? 'text-red-400' : maxSize >= 1 ? 'text-orange-400' : 'text-yellow-400'

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-2 text-left bg-transparent"
      >
        <ChevronDown className={`h-3.5 w-3.5 opacity-50 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="text-xs font-semibold flex-1">{year}</span>
        <span className={`text-[10px] font-medium ${severityColor}`}>{events.length} event{events.length !== 1 ? 's' : ''}</span>
        {maxSize > 0 && <HailSizeIndicator inches={maxSize} />}
      </button>
      {open && (
        <div className="pl-6 pb-2 space-y-0.5">
          {events.map((evt, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1">
              <span className="opacity-50 w-20 shrink-0">{evt.date || year}</span>
              <HailSizeIndicator inches={evt.hail_size_inches} />
              <span className="opacity-40 ml-auto shrink-0">{evt.distance_mi} mi</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RoofInspectorPanel({ isOpen, onClose, parcelData }) {
  const [solarData, setSolarData] = useState(null)
  const [sentinelData, setSentinelData] = useState(null)
  const [hailData, setHailData] = useState(null)
  const [loading, setLoading] = useState({})
  const [errors, setErrors] = useState({})
  const [loaded, setLoaded] = useState({})
  const [selectedImageIdx, setSelectedImageIdx] = useState(null)
  const [expandedImage, setExpandedImage] = useState(null)
  const [imgZoom, setImgZoom] = useState(1)
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 })
  const imgDragRef = useRef(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportPdf, setReportPdf] = useState(null)
  const scrollRef = useRef(null)

  const address = parcelData?.address || parcelData?.properties?.SITUS_ADDR || 'Unknown address'
  const lat = parcelData?.lat ?? parcelData?.properties?.LATITUDE
  const lng = parcelData?.lng ?? parcelData?.properties?.LONGITUDE

  useEffect(() => {
    if (isOpen) {
      setSolarData(null)
      setSentinelData(null)
      setHailData(null)
      setErrors({})
      setLoaded({})
      setLoading({})
      setSelectedImageIdx(null)
      setExpandedImage(null)
      setReportPdf(null)
      setReportLoading(false)
    }
  }, [isOpen, lat, lng])

  const setLoadingKey = (key, val) => setLoading(prev => ({ ...prev, [key]: val }))
  const setErrorKey = (key, val) => setErrors(prev => ({ ...prev, [key]: val }))

  const markLoaded = (key) => setLoaded(prev => ({ ...prev, [key]: true }))

  const loadRoofImage = useCallback(async () => {
    if (!lat || !lng) return
    markLoaded('roofImage')
    setLoadingKey('solar', true)
    setLoadingKey('sentinel', true)
    setErrorKey('solar', null)
    setErrorKey('sentinel', null)
    try {
      const res = await fetch(`/api/solar-imagery?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error(`Solar API: ${res.status}`)
      setSolarData(await res.json())
    } catch (e) {
      setErrorKey('solar', e.message)
    } finally {
      setLoadingKey('solar', false)
    }
    try {
      const res = await fetch(`/api/sentinel-imagery?lat=${lat}&lng=${lng}&from_year=2014`)
      if (!res.ok) throw new Error(`Sentinel API: ${res.status}`)
      setSentinelData(await res.json())
    } catch (e) {
      setErrorKey('sentinel', e.message)
    } finally {
      setLoadingKey('sentinel', false)
    }
  }, [lat, lng])

  const loadTimeline = useCallback(async () => {
    if (!lat || !lng) return
    markLoaded('timeline')
    if (!sentinelData && !loaded.roofImage) {
      setLoadingKey('sentinel', true)
      setErrorKey('sentinel', null)
      try {
        const res = await fetch(`/api/sentinel-imagery?lat=${lat}&lng=${lng}&from_year=2014`)
        if (!res.ok) throw new Error(`Sentinel API: ${res.status}`)
        setSentinelData(await res.json())
      } catch (e) {
        setErrorKey('sentinel', e.message)
      } finally {
        setLoadingKey('sentinel', false)
      }
    }
  }, [lat, lng, sentinelData, loaded.roofImage])

  const loadHail = useCallback(async () => {
    if (!lat || !lng) return
    markLoaded('hail')
    setLoadingKey('hail', true)
    setErrorKey('hail', null)
    try {
      const res = await fetch(`/api/hail-events?lat=${lat}&lng=${lng}&radius_miles=5&from_year=2010`)
      if (!res.ok) throw new Error(`Hail API: ${res.status}`)
      setHailData(await res.json())
    } catch (e) {
      setErrorKey('hail', e.message)
    } finally {
      setLoadingKey('hail', false)
    }
  }, [lat, lng])

  const generateReport = useCallback(async () => {
    if (!lat || !lng) return
    setReportLoading(true)
    setReportPdf(null)
    setErrorKey('report', null)
    try {
      const { reportBranding } = getSettings()
      const res = await fetch('/api/roof-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, address, branding: reportBranding }),
      })
      if (!res.ok) throw new Error(`Report generation failed (${res.status})`)
      const data = await res.json()
      setReportPdf(data.pdf_base64)
    } catch (e) {
      setErrorKey('report', e.message)
    } finally {
      setReportLoading(false)
    }
  }, [lat, lng, address])

  const downloadReport = useCallback(() => {
    if (!reportPdf) return
    const a = document.createElement('a')
    a.href = reportPdf
    a.download = `roof-report-${(address || 'property').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}.pdf`
    a.click()
  }, [reportPdf, address])

  const hailByYear = useMemo(() => {
    if (!hailData?.events?.length) return []
    const groups = {}
    for (const evt of hailData.events) {
      const y = evt.year
      if (!groups[y]) groups[y] = []
      groups[y].push(evt)
    }
    return Object.entries(groups)
      .map(([year, events]) => ({ year: parseInt(year, 10), events }))
      .sort((a, b) => b.year - a.year)
  }, [hailData])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/20" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Roof inspection and hail damage analysis</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <Home className="h-5 w-5 shrink-0" />
              <span className="truncate">Roof Inspector</span>
            </DialogTitle>
            <div className="map-panel-header-actions gap-1">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-xs opacity-50 mt-1 truncate">{address}</div>
        </DialogHeader>

        <div ref={scrollRef} className="roof-inspector-scroll px-5 py-4 overflow-y-auto flex-1 space-y-5" style={{ maxHeight: 'calc(100vh - 120px - env(safe-area-inset-top, 0px))' }}>

          {/* Section 1: Current Roof Image */}
          <section>
            <SectionHeader icon={Satellite} title="Current Roof Image" />
            {!loaded.roofImage ? (
              <div>
                <p className="text-xs opacity-50 mb-3">Load the latest aerial image and Solar API metadata for this roof.</p>
                <button
                  type="button"
                  disabled={!lat || !lng}
                  onClick={loadRoofImage}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <Satellite className="h-4 w-4" />
                  Load Roof Image
                </button>
              </div>
            ) : (() => {
              const latestImage = sentinelData?.images?.[sentinelData.images.length - 1]
              const isLoading = (loading.sentinel || loading.solar) && !latestImage
              const hasError = !loading.sentinel && errors.sentinel && !latestImage

              if (isLoading) return (
                <div className="flex items-center justify-center py-8 opacity-50">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Loading roof imagery...</span>
                </div>
              )
              if (hasError) return (
                <div className="flex items-center gap-2 py-4 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Could not load imagery: {errors.sentinel}</span>
                </div>
              )
              if (latestImage) return (
                <div>
                  <div
                    className="relative rounded-lg overflow-hidden cursor-pointer group"
                    style={{ height: 220 }}
                    onClick={() => { setImgZoom(1); setImgPos({ x: 0, y: 0 }); setExpandedImage(latestImage.image_base64) }}
                  >
                    <img src={latestImage.image_base64} alt="Current roof aerial view" className="w-full h-full object-cover rounded-lg" style={{ transform: 'scale(2)' }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                    </div>
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                      {latestImage.date || latestImage.year}
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs opacity-60">
                    {solarData?.roof_area_sqm && <span>Area: {Math.round(solarData.roof_area_sqm)} sq m</span>}
                    {solarData?.roof_segments?.length > 0 && <span>{solarData.roof_segments.length} segments</span>}
                  </div>
                </div>
              )
              return <div className="py-4 text-sm opacity-40 text-center">No imagery available for this location</div>
            })()}
          </section>

          {/* Section 2: Historical Timeline */}
          <section>
            <SectionHeader icon={Satellite} title="Historical Satellite Timeline" />
            {!loaded.timeline ? (
              <div>
                <p className="text-xs opacity-50 mb-3">Load historical satellite images to compare the roof over time.</p>
                <button
                  type="button"
                  disabled={!lat || !lng}
                  onClick={loadTimeline}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <Satellite className="h-4 w-4" />
                  Load Timeline
                </button>
              </div>
            ) : loading.sentinel ? (
              <div className="flex items-center justify-center py-8 opacity-50">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading satellite history...</span>
              </div>
            ) : errors.sentinel ? (
              <div className="flex items-center gap-2 py-4 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not load satellite imagery: {errors.sentinel}</span>
              </div>
            ) : sentinelData?.images?.length > 0 ? (
              <div>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 hide-scrollbar">
                  {sentinelData.images.map((img, idx) => (
                    <div
                      key={img.year}
                      className={`shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImageIdx === idx ? 'border-blue-400' : 'border-transparent hover:border-white/20'
                      }`}
                      onClick={() => setSelectedImageIdx(idx)}
                    >
                      <img src={img.image_base64} alt={`${img.year}`} className="w-20 h-20 object-cover" />
                      <div className="text-center text-[10px] py-0.5 opacity-70">{img.year}</div>
                    </div>
                  ))}
                </div>
                {selectedImageIdx !== null && sentinelData.images[selectedImageIdx] && (
                  <div className="mt-3 rounded-lg overflow-hidden cursor-pointer" onClick={() => { setImgZoom(1); setImgPos({ x: 0, y: 0 }); setExpandedImage(sentinelData.images[selectedImageIdx].image_base64) }}>
                    <img
                      src={sentinelData.images[selectedImageIdx].image_base64}
                      alt={`Satellite ${sentinelData.images[selectedImageIdx].year}`}
                      className="w-full h-auto rounded-lg"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedImageIdx === 0}
                        onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.max(0, i - 1)) }}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium">{sentinelData.images[selectedImageIdx].year}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedImageIdx === sentinelData.images.length - 1}
                        onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.min(sentinelData.images.length - 1, i + 1)) }}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-sm opacity-40 text-center">No historical imagery available</div>
            )}
          </section>

          {/* Section 3: Hail History (NOAA) */}
          <section>
            <SectionHeader icon={CloudRain} title="Hail History (within 5 mi)" />
            {!loaded.hail ? (
              <div>
                <p className="text-xs opacity-50 mb-3">Load NOAA hail event history within a 5 mile radius.</p>
                <button
                  type="button"
                  disabled={!lat || !lng}
                  onClick={loadHail}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <CloudRain className="h-4 w-4" />
                  Load Hail History
                </button>
              </div>
            ) : loading.hail ? (
              <div className="flex items-center justify-center py-8 opacity-50">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Loading hail data...</span>
              </div>
            ) : errors.hail ? (
              <div className="flex items-center gap-2 py-4 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not load hail data: {errors.hail}</span>
              </div>
            ) : hailData ? (
              <div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                    <div className="text-lg font-bold">{hailData.summary?.total_events ?? 0}</div>
                    <div className="text-[10px] opacity-50">Events</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                    <div className="text-lg font-bold">{hailData.summary?.max_hail_size ? `${hailData.summary.max_hail_size}"` : '--'}</div>
                    <div className="text-[10px] opacity-50">Max Size</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                    <div className="text-lg font-bold">{hailData.summary?.years_with_hail?.length ?? 0}</div>
                    <div className="text-[10px] opacity-50">Years</div>
                  </div>
                </div>

                {hailByYear.length > 0 ? (
                  <div>
                    {hailByYear.map((group, i) => (
                      <HailYearGroup
                        key={group.year}
                        year={group.year}
                        events={group.events}
                        defaultOpen={i === 0}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm opacity-40 text-center py-2">No hail events found nearby</div>
                )}
              </div>
            ) : null}
          </section>

          {/* Section 4: Generate Report — disabled for now, will revisit */}
          {/*
          <section>
            <SectionHeader icon={FileText} title="Roof Measurement Report" />
            <p className="text-xs opacity-50 mb-3">
              Generate a Roofr-style branded PDF with length, pitch, area, and notes diagrams plus waste calculations.
              Configure your company info in Settings &gt; Report Branding.
            </p>
            {reportPdf ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={downloadReport}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download Report PDF
                </button>
                <button
                  type="button"
                  onClick={generateReport}
                  className="w-full text-xs opacity-50 hover:opacity-80 transition-opacity py-1"
                >
                  Regenerate
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={reportLoading || !lat || !lng}
                onClick={generateReport}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                {reportLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Generate Report
                  </>
                )}
              </button>
            )}
            {errors.report && (
              <div className="flex items-center gap-2 mt-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errors.report}</span>
              </div>
            )}
          </section>
          */}
        </div>

        {/* Expanded image overlay with zoom/pan */}
        {expandedImage && (
          <div
            className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onClick={(e) => { if (e.target === e.currentTarget) setExpandedImage(null) }}
            onWheel={(e) => {
              e.preventDefault()
              setImgZoom(z => Math.min(8, Math.max(0.5, z + (e.deltaY < 0 ? 0.3 : -0.3))))
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              imgDragRef.current = { sx: e.clientX - imgPos.x, sy: e.clientY - imgPos.y }
            }}
            onPointerMove={(e) => {
              if (!imgDragRef.current) return
              setImgPos({ x: e.clientX - imgDragRef.current.sx, y: e.clientY - imgDragRef.current.sy })
            }}
            onPointerUp={() => { imgDragRef.current = null }}
          >
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
              <button type="button" onClick={() => setImgZoom(z => Math.max(0.5, z - 0.5))} className="text-white text-lg font-bold px-2 hover:opacity-80">−</button>
              <span className="text-white text-xs font-medium min-w-[3rem] text-center">{Math.round(imgZoom * 100)}%</span>
              <button type="button" onClick={() => setImgZoom(z => Math.min(8, z + 0.5))} className="text-white text-lg font-bold px-2 hover:opacity-80">+</button>
            </div>
            <img
              src={expandedImage}
              alt="Expanded view"
              className="select-none pointer-events-none"
              style={{ transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgZoom})`, transition: imgDragRef.current ? 'none' : 'transform 0.15s ease-out' }}
              draggable={false}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
