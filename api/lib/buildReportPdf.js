import PDFDocument from 'pdfkit'

const PW = 612
const PH = 792
const MG = 48
const CW = PW - 2 * MG

export function leadDisplayName(lead) {
  const parts = [lead?.firstName, lead?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return (lead?.address || 'Lead').trim()
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

/**
 * @param {{ report: object, lead: object, branding: object, getImageBuffer: (key: string) => Promise<Buffer> }} opts
 */
export async function buildReportPdfBuffer({ report, lead, branding, getImageBuffer }) {
  const photosById = Object.fromEntries((lead?.photos || []).map((p) => [p.id, p]))

  const doc = new PDFDocument({ size: 'LETTER', margin: MG })
  let y = MG

  if (branding?.logoBase64) {
    try {
      const logoBuf = Buffer.from(branding.logoBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
      doc.image(logoBuf, MG, y, { width: 80 })
      y += 50
    } catch {
      /* skip logo */
    }
  }

  doc.fontSize(10).fillColor('#555555')
  const companyLines = [
    branding?.businessName,
    branding?.companyPhone,
    branding?.companyEmail,
    branding?.companyWebsite,
  ].filter(Boolean)
  companyLines.forEach((line) => {
    doc.text(line, MG, y, { width: CW })
    y += 14
  })
  y += 12

  doc.fontSize(22).fillColor('#111111').text(report.title || 'Photo Report', MG, y, { width: CW })
  y = doc.y + 8
  doc.fontSize(12).fillColor('#333333')
  doc.text(leadDisplayName(lead), MG, y, { width: CW })
  y = doc.y + 4
  if (lead?.address) {
    doc.fontSize(10).fillColor('#666666').text(lead.address, MG, y, { width: CW })
    y = doc.y + 16
  }

  const sections = [...(report?.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  for (const section of sections) {
    if (y > PH - 120) {
      doc.addPage()
      y = MG
    }

    if (section.subtitle) {
      doc.fontSize(16).fillColor('#111111').text(section.subtitle, MG, y, { width: CW })
      y = doc.y + 6
    }
    if (section.description) {
      doc.fontSize(10).fillColor('#444444').text(section.description, MG, y, { width: CW, align: 'left' })
      y = doc.y + 12
    }

    for (const photoId of section.photoIds || []) {
      const photo = photosById[photoId]
      if (!photo) continue
      const imgKey = photo.annotatedKey || photo.key
      if (!imgKey || !getImageBuffer) continue

      try {
        const imgBuf = await getImageBuffer(imgKey)
        const maxH = PH - MG * 2 - 40
        const maxW = CW
        if (y > PH - maxH - 40) {
          doc.addPage()
          y = MG
        }
        doc.image(imgBuf, MG, y, { fit: [maxW, maxH], align: 'center' })
        y = doc.y + 16
      } catch (e) {
        console.warn('skip photo in pdf', photoId, e.message)
      }
    }
    y += 8
  }

  return pdfToBuffer(doc)
}

export function reportPdfStorageKey(ownerId, reportId) {
  return `report-pdfs/${ownerId}/${reportId}.pdf`
}

export function safePdfFilename(title) {
  const base = String(title || 'report').replace(/[^\w\s-]/g, '').trim() || 'report'
  return `${base.slice(0, 80)}.pdf`
}
