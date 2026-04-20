import { Phone, Mail, User, Star, Pencil, Trash2, Plus, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

function VerifiedIcon({ verified, onClick, title }) {
  if (verified === 'good') return <CheckCircle className="h-4 w-4 text-green-600 cursor-pointer hover:opacity-80" onClick={onClick} title={title || 'Verified good'} />
  if (verified === 'bad') return <XCircle className="h-4 w-4 text-red-600 cursor-pointer hover:opacity-80" onClick={onClick} title={title || 'Verified bad'} />
  return <HelpCircle className="h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600" onClick={onClick} title={title || 'Unverified'} />
}

export function ContactSection({ data, onPhoneClick, onEmailClick, compact = false }) {
  const {
    phoneDetails, emailDetails, skipTracedInfo, normalized,
    editContacts, setEditContacts, newPhone, setNewPhone, newEmail, setNewEmail,
    callerIdDraft, setCallerIdDraft,
    addPhone, addEmail, deletePhone, deleteEmail, togglePrimary,
    handleSetVerified, cycleVerified, handleCallerIdBlur, normalizePhoneNumber, parcelId,
  } = data

  const hasContacts = phoneDetails.length > 0 || emailDetails.length > 0 || skipTracedInfo?.address || skipTracedInfo?.skipTracedAt
  if (!hasContacts) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
        <Phone className="h-5 w-5" />
        <span>{compact ? 'Contact' : 'Contact Information'}</span>
        <Button variant="ghost" size="sm" className="parcel-details-edit-btn h-7 px-2 ml-auto" onClick={() => { setEditContacts(e => !e); setNewPhone(''); setNewEmail('') }}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-0">
        {phoneDetails.map((p, idx) => (
          <div key={`phone-${idx}`} className="py-2 border-b border-white/30 last:border-0 space-y-1">
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {editContacts ? (
                  <button type="button" onClick={() => togglePrimary('phone', p.value)} className="text-amber-500 hover:text-amber-600 flex-shrink-0">
                    {p.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                  </button>
                ) : p.primary && <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />}
                <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="font-semibold text-gray-700">{phoneDetails.length > 1 ? `Phone ${idx + 1}:` : 'Phone:'}</span>
                <VerifiedIcon verified={p.verified} onClick={() => handleSetVerified('phone', p.value, cycleVerified(p.verified))} />
              </div>
              <div className="flex items-center gap-1">
                {onPhoneClick ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPhoneClick(p.value, normalized) }} className="parcel-details-link-btn text-inherit hover:underline truncate text-left">{p.value}</button>
                ) : (
                  <a href={`tel:${normalizePhoneNumber(p.value)}`} className="parcel-details-link-btn text-inherit hover:underline truncate">{p.value}</a>
                )}
                {editContacts && (
                  <button type="button" onClick={() => deletePhone(idx)} className="text-red-500 hover:text-red-600 p-0.5 flex-shrink-0" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {editContacts ? (
              (p.callerId && String(p.callerId).trim()) || callerIdDraft[p.value] !== undefined ? (
                <div className="flex items-center gap-2 pl-6">
                  <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <Input
                    placeholder="Caller ID"
                    value={callerIdDraft[p.value] !== undefined ? callerIdDraft[p.value] : (p.callerId || '')}
                    onChange={(e) => setCallerIdDraft(prev => ({ ...prev, [p.value]: e.target.value }))}
                    onBlur={(e) => handleCallerIdBlur(p.value, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                    className="h-8 text-sm flex-1 max-w-[200px]"
                  />
                </div>
              ) : (
                <div className="pl-6 py-1">
                  <button type="button" onClick={() => setCallerIdDraft(prev => ({ ...prev, [p.value]: '' }))} className="parcel-details-link-btn text-sm text-gray-500 hover:text-gray-700 underline">Add caller ID</button>
                </div>
              )
            ) : (p.callerId && String(p.callerId).trim()) ? (
              <div className="flex items-center gap-2 pl-6 py-1">
                <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700">Caller ID: {(p.callerId || '').trim()}</span>
              </div>
            ) : null}
          </div>
        ))}
        {editContacts && (
          <div className="flex items-center gap-2 py-2">
            <input type="tel" placeholder="Add phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" onKeyDown={(e) => e.key === 'Enter' && addPhone()} />
            <Button variant="outline" size="sm" className="h-7" onClick={addPhone}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        )}
        {emailDetails.map((e, idx) => (
          <div key={`email-${idx}`} className="flex justify-between items-center py-2 border-b border-white/30 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              {editContacts ? (
                <button type="button" onClick={() => togglePrimary('email', e.value)} className="text-amber-500 hover:text-amber-600 flex-shrink-0">
                  {e.primary ? <Star className="h-4 w-4 fill-current" /> : <Star className="h-4 w-4" />}
                </button>
              ) : e.primary && <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" title="Primary" />}
              <Mail className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <span className="font-semibold text-gray-700">{emailDetails.length > 1 ? `Email ${idx + 1}:` : 'Email:'}</span>
              <VerifiedIcon verified={e.verified} onClick={() => handleSetVerified('email', e.value, cycleVerified(e.verified))} />
            </div>
            <div className="flex items-center gap-1">
              {onEmailClick ? (
                <button onClick={() => onEmailClick(e.value, normalized)} className="parcel-details-link-btn text-inherit hover:underline truncate">{e.value}</button>
              ) : <span className="truncate">{e.value}</span>}
              {editContacts && (
                <button type="button" onClick={() => deleteEmail(idx)} className="text-red-500 hover:text-red-600 p-0.5 flex-shrink-0" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {editContacts && (
          <div className="flex items-center gap-2 py-2">
            <input type="email" placeholder="Add email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" onKeyDown={(e) => e.key === 'Enter' && addEmail()} />
            <Button variant="outline" size="sm" className="h-7" onClick={addEmail}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        )}
        {skipTracedInfo?.address && (
          <div className="flex justify-between py-2 border-b border-white/30 last:border-0">
            <span className="font-semibold text-gray-700">Mailing Address:</span>
            <span className="text-gray-900 text-right flex-1 ml-4">{skipTracedInfo.address}</span>
          </div>
        )}
        {skipTracedInfo?.skipTracedAt && (
          <div className="flex justify-between py-2 border-b border-white/30 last:border-0">
            <span className="font-semibold text-gray-700">Skip Traced On:</span>
            <span className="text-gray-900 text-right flex-1 ml-4">{new Date(skipTracedInfo.skipTracedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
