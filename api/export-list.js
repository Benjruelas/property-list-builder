/**
 * Vercel Serverless Function
 * Exports a property list as CSV and emails it to the user.
 *
 * POST body: { listName, csvContent, userEmail }
 * Requires: RESEND_API_KEY environment variable
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { listName, csvContent, userEmail } = req.body

    if (!listName || !csvContent || !userEmail) {
      return res.status(400).json({
        error: 'Missing required fields: listName, csvContent, and userEmail are required'
      })
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        error: 'Email service not configured. Please set RESEND_API_KEY.'
      })
    }

    const sanitizedName = listName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50)
    const filename = `${sanitizedName}_export_${Date.now()}.csv`

    const { data, error } = await resend.emails.send({
      from: 'Property List Builder <onboarding@resend.dev>',
      to: [userEmail],
      subject: `Your exported list: ${listName}`,
      html: `<p>Please find your exported property list attached.</p><p>List: ${listName}</p><p>Exported on ${new Date().toLocaleDateString()}.</p>`,
      attachments: [
        {
          filename,
          content: Buffer.from(csvContent, 'utf-8')
        }
      ]
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(500).json({
        error: 'Failed to send email',
        message: error.message
      })
    }

    // Send push notification if user has it enabled
    try {
      const { sendPushToEmail } = await import('./lib/sendPush.js')
      await sendPushToEmail(userEmail, {
        title: 'Export ready',
        body: `Your list "${listName}" has been sent to your email.`,
        type: 'export'
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Export sent to ${userEmail}`,
      id: data?.id
    })
  } catch (err) {
    console.error('Export list error:', err)
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message
    })
  }
}
