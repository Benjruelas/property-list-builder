/**
 * Situs vs mailing — same rules as map popup / parcel details ('Yes' | 'No' | null).
 */
export function computeOwnerOccupied(properties) {
  if (!properties || typeof properties !== 'object') return null
  const normAddr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const situsAddr = normAddr(properties.SITUS_ADDR || properties.SITE_ADDR || properties.ADDRESS)
  const mailAddr = normAddr(properties.MAIL_ADDR || properties.MAILING_ADDR || properties.PSTLADRESS)
  if (!situsAddr || !mailAddr) return null
  return mailAddr === situsAddr || mailAddr.startsWith(situsAddr) ? 'Yes' : 'No'
}
