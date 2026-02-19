'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/date-format'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleTabs } from '@/components/layout/module-tabs'
import { Progress } from '@/components/ui/progress'
import { Mail, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Send, Eye } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface EmailStats {
  total: number
  bookingEmails: number
  processed: number
  unprocessed: number
}

interface RecentEmail {
  id: string
  subject: string
  from: string
  receivedAt: string
  isBookingEmail: boolean
  source: string
  errorMessage: string | null
  bookingEmails: Array<{
    relationType: string
    booking: {
      bookingRef: string | null
    }
  }>
}

interface ProcessingProgress {
  percentage: number
  current: number
  total: number
  account: string
  status: string
}

export default function EmailInboxPage() {
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [emails, setEmails] = useState<RecentEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [testingWhatsApp, setTestingWhatsApp] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [progress, setProgress] = useState<ProcessingProgress | null>(null)
  const [activeTab, setActiveTab] = useState<'BOOKING' | 'NON_BOOKING'>('BOOKING')
  const { notify } = useNotifications()

  const fetchData = async () => {
    try {
      const res = await fetch('/api/email/process')
      const data = await res.json()
      
      if (data.stats) {
        setStats(data.stats)
        setEmails(data.recentEmails || [])
      } else {
        notify({ type: 'error', title: 'Load Emails Failed', message: data.error || 'Unable to load emails.' })
      }
    } catch (error) {
      console.error('Error fetching email data:', error)
      notify({ type: 'error', title: 'Load Emails Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSyncEmails = async () => {
    setProcessing(true)
    setProgress({ percentage: 0, current: 0, total: 0, account: 'Starting', status: 'Initializing...' })

    try {
      const response = await fetch('/api/email/sync', { method: 'POST' })

      if (!response.ok) {
        throw new Error('Failed to start sync')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let finalResults: any = null
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n')
          let event = 'message'
          let dataPayload = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.replace('event:', '').trim()
            }
            if (line.startsWith('data:')) {
              dataPayload += line.replace('data:', '').trim()
            }
          }

          if (!dataPayload) continue
          const data = JSON.parse(dataPayload)

          if (event === 'progress') {
            setProgress(data)
          } else if (event === 'complete') {
            finalResults = data.results
            setProgress({ percentage: 100, current: 100, total: 100, account: 'Complete', status: 'Sync complete!' })
          } else if (event === 'error') {
            notify({ type: 'error', title: 'Email Sync Error', message: data.error })
          }
        }
      }

      if (finalResults) {
        setTimeout(() => {
          notify({
            type: 'success',
            title: 'Email Sync Complete',
            message: `Fetched: ${finalResults.fetched || 0}\nStored: ${finalResults.stored}\nSkipped: ${finalResults.skipped} (already in database)\nFailed: ${finalResults.failed}`,
          })
          fetchData() // Refresh data
          setProgress(null)
        }, 1000)
      }
    } catch (error) {
      console.error('Sync error:', error)
      const message = String(error)
      // Network drops (proxy/timeout) often happen with SSE streams even if the sync continues server-side.
      if (message.toLowerCase().includes('network') || message.toLowerCase().includes('failed to fetch')) {
        notify({
          type: 'warning',
          title: 'Email Sync Connection Lost',
          message: 'Sync may still be running in the background. Please wait a moment and refresh the stats.',
        })
      } else {
        notify({ type: 'error', title: 'Email Sync Error', message })
      }
      setProgress(null)
    } finally {
      setProcessing(false)
    }
  }

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType: 'whatsapp' }),
      })
      const data = await res.json()
      
      if (data.success) {
        notify({ type: 'success', title: 'WhatsApp Test', message: 'Message sent! Check your group.' })
      } else {
        notify({ type: 'error', title: 'WhatsApp Test Failed', message: data.message || 'WhatsApp test failed' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'WhatsApp Test Error', message: String(error) })
    } finally {
      setTestingWhatsApp(false)
    }
  }

  const handleTestEmail = async () => {
    setTestingEmail(true)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType: 'email' }),
      })
      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Email Test', message: 'Both email accounts connected successfully!' })
      } else {
        notify({ type: 'error', title: 'Email Test Failed', message: data.message || 'Email test failed' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Email Test Error', message: String(error) })
    } finally {
      setTestingEmail(false)
    }
  }

  const handleToggleBookingEmail = async (emailId: string, currentValue: boolean) => {
    try {
      const res = await fetch('/api/email/toggle-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, isBookingEmail: !currentValue }),
      })
      const data = await res.json()

      if (data.success) {
        // Refresh data
        fetchData()
      } else {
        notify({ type: 'error', title: 'Toggle Failed', message: data.error || 'Failed to toggle' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Toggle Error', message: String(error) })
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const filteredEmails = emails.filter((email) =>
    activeTab === 'BOOKING' ? email.isBookingEmail : !email.isBookingEmail
  )

  return (
    <div className="space-y-5">
      <ModuleTabs moduleId="bookings" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Inbox</h1>
          <p className="text-gray-600 mt-1">
            Monitor and manage OTA booking emails
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleTestEmail}
            disabled={testingEmail}
            variant="outline"
          >
            {testingEmail ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
            ) : (
              <><Mail className="h-4 w-4 mr-2" /> Test Email</>
            )}
          </Button>
          <Button
            onClick={handleTestWhatsApp}
            disabled={testingWhatsApp}
            variant="outline"
          >
            {testingWhatsApp ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Test WhatsApp</>
            )}
          </Button>
          <Button
            onClick={handleSyncEmails}
            disabled={processing}
          >
            {processing ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Syncing...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Synchronize Email</>
            )}
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {processing && progress && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="font-semibold text-blue-900">
                  {progress.account} - {progress.percentage}%
                </span>
              </div>
              <span className="text-sm text-blue-700">
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={progress.percentage} className="h-3" />
            <p className="text-sm text-blue-700">{progress.status}</p>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Total Emails</div>
              <div className="text-2xl font-bold text-gray-900">{stats?.total || 0}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Booking Emails</div>
              <div className="text-2xl font-bold text-purple-600">{stats?.bookingEmails || 0}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Processed</div>
              <div className="text-2xl font-bold text-green-600">{stats?.processed || 0}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600">Unprocessed</div>
              <div className="text-2xl font-bold text-yellow-600">{stats?.unprocessed || 0}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Emails Table */}
      <Card>
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Emails</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => setActiveTab('BOOKING')}
              variant={activeTab === 'BOOKING' ? 'default' : 'secondary'}
              className="font-semibold"
            >
              Booking Email
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'BOOKING' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {emails.filter(e => e.isBookingEmail).length}
              </span>
            </Button>
            <Button
              type="button"
              onClick={() => setActiveTab('NON_BOOKING')}
              variant={activeTab === 'NON_BOOKING' ? 'default' : 'secondary'}
              className="font-semibold"
            >
              Non-Booking
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'NON_BOOKING' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {emails.filter(e => !e.isBookingEmail).length}
              </span>
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  View
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Received
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Linked Bookings
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmails.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No emails found for this tab.
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Link href={`/email-inbox/${email.id}`}>
                        <Button variant="outline" size="sm" className="hover:bg-blue-50">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-md">
                        {email.subject}
                      </div>
                      {email.errorMessage && (
                        <div className="text-xs text-red-600 mt-1 truncate max-w-md">
                          Error: {email.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 truncate max-w-xs">
                        {email.from}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {email.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDateTime(email.receivedAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        type="button"
                        onClick={() => handleToggleBookingEmail(email.id, email.isBookingEmail)}
                        variant="secondary"
                        size="sm"
                        className={`h-auto inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                          email.isBookingEmail
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {email.isBookingEmail ? (
                          <><CheckCircle className="h-3 w-3" /> Yes</>
                        ) : (
                          <><XCircle className="h-3 w-3" /> No</>
                        )}
                      </Button>
                    </td>
                    <td className="px-6 py-4">
                      {email.bookingEmails.length > 0 ? (
                        <div className="text-sm">
                          {email.bookingEmails.map((be, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
                                be.relationType === 'CREATED' ? 'bg-blue-100 text-blue-800' :
                                be.relationType === 'UPDATED' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {be.relationType}
                              </span>
                              <span className="text-xs text-gray-600">
                                {be.booking.bookingRef || 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Email Synchronization</p>
            <p>This page pulls emails from admin@balisnaptrip.com and stores them in the database. Click &quot;Synchronize Email&quot; to fetch new emails from the mail server. To create bookings from these emails, go to the Bookings page and click &quot;Fetch Booking&quot;.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
