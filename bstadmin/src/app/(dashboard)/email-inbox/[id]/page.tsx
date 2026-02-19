'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/date-format'
import { ArrowLeft, Mail, Trash2, AlertCircle, Link2 } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface EmailDetail {
  id: string
  subject: string
  from: string
  to: string
  receivedAt: string
  source: string
  isBookingEmail: boolean
  errorMessage: string | null
  body: string
  htmlBody: string | null
  bookingEmails: Array<{
    relationType: string
    booking: {
      id: number
      bookingRef: string | null
    }
  }>
}

export default function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [email, setEmail] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const { notify } = useNotifications()

  useEffect(() => {
    fetchEmail()
  }, [resolvedParams.id])

  const fetchEmail = async () => {
    try {
      const res = await fetch(`/api/email/${resolvedParams.id}`)
      const data = await res.json()
      
      if (data.email) {
        setEmail(data.email)
      }
    } catch (error) {
      console.error('Error fetching email:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!email) return
    if (!confirm(`Delete email "${email.subject}"? This cannot be undone.`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/email/${email.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Email Deleted', message: email.subject })
        router.push('/email-inbox')
      } else {
        notify({ type: 'error', title: 'Delete Email Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Email Error', message: String(error) })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Loading email...</p>
        </div>
      </div>
    )
  }

  if (!email) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Email Not Found</h2>
        <Link href="/email-inbox">
          <Button>Back to Email Inbox</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/email-inbox">
            <Button variant="outline" size="sm" className="hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Email Detail</h1>
            <p className="text-sm text-gray-600 mt-1">
              Received {formatDateTime(email.receivedAt)}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? 'Deleting...' : 'Delete Email'}
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</div>
            <div className="text-base font-semibold text-gray-900 mt-1">{email.subject}</div>
            {email.errorMessage && (
              <div className="text-sm text-red-600 mt-2">
                Error: {email.errorMessage}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</div>
            <div className="text-sm text-gray-900 mt-1 break-all">{email.from}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</div>
            <div className="text-sm text-gray-900 mt-1 break-all">{email.to}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</div>
            <span className="inline-flex mt-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
              {email.source}
            </span>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking Email</div>
            <span className={`inline-flex mt-1 px-2 py-1 text-xs font-semibold rounded-full ${
              email.isBookingEmail ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
            }`}>
              {email.isBookingEmail ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600" />
          Linked Bookings
        </h2>
        {email.bookingEmails.length === 0 ? (
          <div className="text-sm text-gray-500">No linked bookings.</div>
        ) : (
          <div className="space-y-2">
            {email.bookingEmails.map((be, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
                  be.relationType === 'CREATED' ? 'bg-blue-100 text-blue-800' :
                  be.relationType === 'UPDATED' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {be.relationType}
                </span>
                <Link href={`/bookings/${be.booking.id}`} className="text-sm text-blue-600 hover:underline">
                  {be.booking.bookingRef || `#${be.booking.id}`}
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Text Body</h2>
        <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
          {email.body}
        </pre>
      </Card>

      {email.htmlBody && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">HTML Body (Raw)</h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
            {email.htmlBody}
          </pre>
        </Card>
      )}
    </div>
  )
}
