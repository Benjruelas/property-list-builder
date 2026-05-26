import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Maximize2, PenLine } from 'lucide-react'
import { Button } from '../ui/button'

function FieldGuideControls({
  stepLabel,
  currentField,
  tourStep,
  totalFields,
  goPrev,
  goNext,
  isLast,
  openSigForCurrent,
  values,
  progressPct,
  filledCount,
}) {
  return (
    <>
      <div className="form-fill-guide-title">
        {stepLabel}{currentField?.required ? ' *' : ''}
      </div>
      <div className="form-fill-guide-controls">
        <button
          type="button"
          className="fill-tour-stepbar-arrow"
          onClick={goPrev}
          disabled={tourStep === 0}
          title="Previous field"
          aria-label="Previous field"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="fill-tour-stepbar-count">
          {tourStep + 1} <span className="fill-tour-stepbar-count-of">of</span> {totalFields}
        </div>
        <button
          type="button"
          className="fill-tour-stepbar-arrow"
          onClick={goNext}
          disabled={isLast}
          title="Next field"
          aria-label="Next field"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        {currentField?.type === 'signature' && (
          <button type="button" className="fill-tour-stepbar-action" onClick={openSigForCurrent}>
            <PenLine className="h-4 w-4" />
            {values[currentField.id] ? 'Redo' : 'Sign'}
          </button>
        )}
      </div>
      <div
        className="fill-tour-stepbar-progress"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${filledCount} of ${totalFields} fields filled`}
      >
        <div className="fill-tour-stepbar-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
    </>
  )
}

/**
 * Form fill chrome — header, field guide, and action bars.
 * `part`: header | fill-top | footer
 */
export function FormFillChrome({
  part,
  layout,
  isPublic,
  fillMode,
  template,
  onBack,
  needsViewReset,
  resetFillView,
  loading,
  loadingErr,
  showSubmitControl,
  renderSubmitButton,
  currentField,
  sigOpen,
  sendOpen,
  exitFillMode,
  stepLabel,
  tourStep,
  totalFields,
  goPrev,
  goNext,
  isLast,
  openSigForCurrent,
  values,
  progressPct,
  filledCount,
}) {
  const showFillGuide = fillMode && currentField && !sigOpen && !sendOpen

  if (part === 'header') {
    if (layout === 'recipient') {
      return (
        <header
          className="form-fill-header shrink-0 border-b px-6 pt-6 pb-4 form-fill-header--public border-gray-200 bg-white text-center"
          style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <h1 className="text-xl font-semibold text-gray-900 truncate max-w-full mx-auto">
            {template.name}
          </h1>
          {showSubmitControl && (
            <div className="flex justify-center w-full mt-3">
              {renderSubmitButton()}
            </div>
          )}
        </header>
      )
    }

    return (
      <header
        className="form-fill-header form-fill-header--minimal shrink-0 border-b border-white/20 px-4 py-3 form-fill-header--auth"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 min-h-[2.5rem]">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="Back to forms"
              aria-label="Back to forms"
              className="form-fill-icon-btn shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <div aria-hidden />
          )}
          <h1 className="text-lg font-semibold truncate text-center min-w-0">
            {template.name}
          </h1>
          <div aria-hidden />
        </div>
      </header>
    )
  }

  if (part === 'fill-top') {
    if (!showFillGuide || layout !== 'recipient') return null

    return (
      <div className="fill-tour-stepbar-row">
        <div className="fill-tour-stepbar-side fill-tour-stepbar-side--left">
          <Button
            variant="ghost"
            size="icon"
            onClick={exitFillMode}
            title="Exit fill mode"
            aria-label="Exit fill mode — return to view"
            className="form-fill-icon-btn form-fill-toolbar-btn shrink-0"
          >
            <Eye className="h-5 w-5" />
          </Button>
        </div>
        <div className="fill-tour-stepbar-wrap fill-tour-stepbar-wrap--inline">
          <div className="fill-tour-stepbar" role="toolbar" aria-label="Form field navigation">
            <FieldGuideControls
              stepLabel={stepLabel}
              currentField={currentField}
              tourStep={tourStep}
              totalFields={totalFields}
              goPrev={goPrev}
              goNext={goNext}
              isLast={isLast}
              openSigForCurrent={openSigForCurrent}
              values={values}
              progressPct={progressPct}
              filledCount={filledCount}
            />
          </div>
        </div>
      </div>
    )
  }

  if (part === 'footer') {
    if (layout !== 'bottom-dock') return null

    if (showFillGuide) {
      return (
        <footer className="form-fill-footer form-fill-footer--fill shrink-0" aria-label="Form field navigation">
          <div className="form-fill-footer-inner form-fill-footer-inner--fill">
            <div className="form-fill-footer-side form-fill-footer-side--left shrink-0">
              <Button
                variant="outline"
                onClick={exitFillMode}
                className="share-dialog-btn form-fill-action-bar-btn form-fill-footer-btn"
                title="Return to view mode"
              >
                <Maximize2 className="h-4 w-4 shrink-0" />
                <span className="form-fill-footer-btn-label">Reset</span>
              </Button>
            </div>
            <div className="form-fill-footer-guide min-w-0 flex-1">
              <FieldGuideControls
                stepLabel={stepLabel}
                currentField={currentField}
                tourStep={tourStep}
                totalFields={totalFields}
                goPrev={goPrev}
                goNext={goNext}
                isLast={isLast}
                openSigForCurrent={openSigForCurrent}
                values={values}
                progressPct={progressPct}
                filledCount={filledCount}
              />
            </div>
            <div className="form-fill-footer-side form-fill-footer-side--right shrink-0">
              {!isPublic && showSubmitControl && renderSubmitButton('form-fill-footer-btn')}
            </div>
          </div>
        </footer>
      )
    }

    if (!fillMode) {
      return (
        <footer className="form-fill-footer form-fill-footer--view shrink-0" aria-label="Form actions">
          <div className="form-fill-footer-inner form-fill-footer-inner--actions">
            {needsViewReset && (
              <Button
                variant="outline"
                onClick={resetFillView}
                className="share-dialog-btn form-fill-action-bar-btn form-fill-footer-btn"
                title="Reset view"
              >
                <Maximize2 className="h-4 w-4 shrink-0" />
                <span className="form-fill-footer-btn-label">Reset</span>
              </Button>
            )}
            {showSubmitControl && renderSubmitButton('form-fill-footer-btn')}
          </div>
        </footer>
      )
    }

    return null
  }

  return null
}

export default FormFillChrome
