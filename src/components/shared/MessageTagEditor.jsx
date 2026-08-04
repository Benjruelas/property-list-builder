import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import {
  getTagPillText,
  mustacheToTagEditorHtml,
  tagEditorDomToMustache,
} from '../../utils/sendTemplateTags'

/**
 * ContentEditable message editor: controlled mustache string in/out, pills for tags.
 */
export const MessageTagEditor = forwardRef(function MessageTagEditor(
  {
    id,
    value,
    onChange,
    tagData = {},
    tags = [],
    getPillText,
    disabled = false,
    className = '',
    placeholder = '',
    singleLine = false,
    onFocus,
    onBlur,
  },
  ref,
) {
  const editorRef = useRef(null)
  const lastEmittedRef = useRef(value || '')
  const tagDataRef = useRef(tagData)
  const tagsRef = useRef(tags)
  const getPillTextRef = useRef(getPillText)
  tagDataRef.current = tagData
  tagsRef.current = tags
  getPillTextRef.current = getPillText

  const pillText = (key) => {
    if (typeof getPillTextRef.current === 'function') {
      return getPillTextRef.current(key, tagDataRef.current)
    }
    return getTagPillText(key, tagDataRef.current, tagsRef.current)
  }

  const emitFromDom = () => {
    const el = editorRef.current
    if (!el) return
    const next = tagEditorDomToMustache(el, tagsRef.current)
    lastEmittedRef.current = next
    if (next !== value) onChange?.(next)
  }

  const refreshPillLabels = () => {
    const el = editorRef.current
    if (!el) return
    el.querySelectorAll('.quote-msg-tag-pill[data-tag]').forEach((pill) => {
      const key = pill.getAttribute('data-tag')
      if (!key) return
      const text = pillText(key)
      if (pill.textContent !== text) pill.textContent = text
    })
  }

  const setHtmlFromValue = (mustache) => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = mustacheToTagEditorHtml(
      mustache || '',
      tagDataRef.current,
      tagsRef.current,
      (key, data) => (
        typeof getPillTextRef.current === 'function'
          ? getPillTextRef.current(key, data)
          : getTagPillText(key, data, tagsRef.current)
      ),
    )
    if (!mustache) el.innerHTML = ''
  }

  useEffect(() => {
    if ((value || '') === lastEmittedRef.current) {
      refreshPillLabels()
      return
    }
    lastEmittedRef.current = value || ''
    setHtmlFromValue(value)
  }, [value])

  useEffect(() => {
    refreshPillLabels()
  }, [tagData, tags])

  useImperativeHandle(ref, () => ({
    insertTag(key) {
      const el = editorRef.current
      if (!el || disabled || !key) return
      el.focus()

      const pill = document.createElement('span')
      pill.className = 'quote-msg-tag-pill'
      pill.contentEditable = 'false'
      pill.setAttribute('data-tag', key)
      pill.textContent = pillText(key)

      const sel = window.getSelection()
      let range = null
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0)
        if (el.contains(r.commonAncestorContainer)) range = r
      }
      if (!range) {
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
      }

      range.deleteContents()
      range.insertNode(pill)
      const after = document.createRange()
      after.setStartAfter(pill)
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)

      emitFromDom()
    },
    focus() {
      editorRef.current?.focus()
    },
  }))

  return (
    <div
      id={id}
      ref={editorRef}
      role="textbox"
      aria-multiline={!singleLine}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`quote-msg-tag-editor ${singleLine ? 'quote-msg-tag-editor--single' : ''} ${className}`}
      onInput={emitFromDom}
      onFocus={onFocus}
      onBlur={(e) => {
        emitFromDom()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (!singleLine) {
            document.execCommand('insertLineBreak')
            emitFromDom()
          }
        }
      }}
    />
  )
})
