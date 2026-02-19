import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { getCommissionStatements } from '@/lib/finance/commission-statements'
import { PrintOnLoad } from '@/app/print/components/PrintOnLoad'
import { PrintToolbar } from '@/app/print/components/PrintToolbar'

type Mode = 'driver' | 'vendor'

function asString(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function normalizeWhatsappNumber(raw: string | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

function buildDriverVendorSummary(lines: { vendor: string | null; gross: number | null; companyTakes: number; driverGets: number | null }[]) {
  const map = new Map<
    string,
    { vendor: string; grossKnown: number; company: number; driverKnown: number; unknownGrossCount: number; count: number }
  >()
  for (const line of lines) {
    const vendor = (line.vendor || 'Unknown vendor').trim() || 'Unknown vendor'
    if (!map.has(vendor)) {
      map.set(vendor, { vendor, grossKnown: 0, company: 0, driverKnown: 0, unknownGrossCount: 0, count: 0 })
    }
    const entry = map.get(vendor)!
    entry.count += 1
    entry.company += Number(line.companyTakes) || 0
    if (line.gross === null || line.gross === undefined) entry.unknownGrossCount += 1
    else entry.grossKnown += Number(line.gross) || 0
    if (line.driverGets !== null && line.driverGets !== undefined) entry.driverKnown += Number(line.driverGets) || 0
  }
  const list = [...map.values()]
  list.sort((a, b) => a.vendor.localeCompare(b.vendor))
  return list
}

function buildVendorDriverSummary(lines: { driverName: string | null; gross: number | null; companyTakes: number; driverGets: number | null }[]) {
  const map = new Map<
    string,
    { driverName: string; grossKnown: number; company: number; driverKnown: number; unknownGrossCount: number; count: number }
  >()
  for (const line of lines) {
    const driverName = (line.driverName || 'Unknown driver').trim() || 'Unknown driver'
    if (!map.has(driverName)) {
      map.set(driverName, { driverName, grossKnown: 0, company: 0, driverKnown: 0, unknownGrossCount: 0, count: 0 })
    }
    const entry = map.get(driverName)!
    entry.count += 1
    entry.company += Number(line.companyTakes) || 0
    if (line.gross === null || line.gross === undefined) entry.unknownGrossCount += 1
    else entry.grossKnown += Number(line.gross) || 0
    if (line.driverGets !== null && line.driverGets !== undefined) entry.driverKnown += Number(line.driverGets) || 0
  }
  const list = [...map.values()]
  list.sort((a, b) => a.driverName.localeCompare(b.driverName))
  return list
}

export default async function CommissionStatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role === 'CUSTOMER') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Unauthorized</h1>
      </div>
    )
  }

  const sp = await searchParams
  const modeRaw = (asString(sp.mode) || 'driver').toLowerCase()
  const mode: Mode = modeRaw === 'vendor' ? 'vendor' : 'driver'
  const month = asString(sp.month) || 'all'
  const autoPrint = (asString(sp.autoPrint) || '1') === '1'

  const driverId = asString(sp.driverId)
  const vendorParam = asString(sp.vendor)

  const data = await getCommissionStatements({ month })

  const titleSuffix = data.month === 'all' ? 'All months' : data.month

  const group =
    mode === 'driver'
      ? data.byDriver.find((g) => String(g.driverId ?? '') === String(driverId ?? ''))
      : data.byVendor.find((g) => g.vendor === String(vendorParam ?? ''))

  if (!group) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Statement not found</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          Mode: {mode}. Month: {titleSuffix}.
        </div>
        <div className="mt-4">
          <Link href="/finance/report" className="text-sm font-semibold text-blue-700">
            Back to Finance Report
          </Link>
        </div>
      </div>
    )
  }

  const heading =
    mode === 'driver'
      ? `Commission Statement (Driver) - ${titleSuffix}`
      : `Commission Statement (Vendor) - ${titleSuffix}`

  const groupTitle =
    mode === 'driver'
      ? (group as any).driverName
      : (group as any).vendor

  const driverPhone =
    mode === 'driver'
      ? (group as any).driverPhone as string | null
      : null
  const waNumber = normalizeWhatsappNumber(driverPhone)

  const lines = (group as any).lines as any[]
  const vendorSummary = mode === 'driver' ? buildDriverVendorSummary(lines) : null
  const driverSummary = mode === 'vendor' ? buildVendorDriverSummary(lines) : null

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page { padding: 0 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

      <PrintOnLoad enabled={autoPrint} />

      <PrintToolbar
        heading={heading}
        subheading={groupTitle}
        backHref="/finance/report"
        waHref={mode === 'driver' && waNumber ? `https://wa.me/${waNumber}` : null}
      />

      <div className="page mx-auto max-w-5xl p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{groupTitle}</h1>
          <div className="text-sm text-slate-600">{heading}</div>
          {mode === 'driver' && driverPhone ? (
            <div className="text-sm text-slate-600">WhatsApp: {driverPhone}</div>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Gross (known)</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCurrency((group as any).totals.grossTotalKnown || 0, 'IDR')}
            </div>
            {(group as any).totals.unknownGrossCount > 0 ? (
              <div className="mt-1 text-[11px] text-amber-700">
                Gross missing for {(group as any).totals.unknownGrossCount} line(s)
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Company Takes</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCurrency((group as any).totals.companyTakesTotal || 0, 'IDR')}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Driver Gets (known)</div>
            <div className="mt-1 text-lg font-semibold">
              {formatCurrency((group as any).totals.driverGetsTotalKnown || 0, 'IDR')}
            </div>
          </div>
        </div>

        {vendorSummary ? (
          <div className="mt-8">
            <div className="text-sm font-semibold">Summary per vendor</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-right">Gross (known)</th>
                    <th className="px-3 py-2 text-right">Company takes</th>
                    <th className="px-3 py-2 text-right">Driver gets (known)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {vendorSummary.map((v) => (
                    <tr key={v.vendor}>
                      <td className="px-3 py-2">{v.vendor}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(v.grossKnown, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(v.company, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(v.driverKnown, 'IDR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {driverSummary ? (
          <div className="mt-8">
            <div className="text-sm font-semibold">Summary per driver</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Driver</th>
                    <th className="px-3 py-2 text-right">Gross (known)</th>
                    <th className="px-3 py-2 text-right">Company takes</th>
                    <th className="px-3 py-2 text-right">Driver gets (known)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {driverSummary.map((d) => (
                    <tr key={d.driverName}>
                      <td className="px-3 py-2">{d.driverName}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(d.grossKnown, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(d.company, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(d.driverKnown, 'IDR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          <div className="text-sm font-semibold">Detail lines</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Booking</th>
                  {mode === 'vendor' ? (
                    <th className="px-3 py-2 text-left">Driver</th>
                  ) : (
                    <th className="px-3 py-2 text-left">Vendor</th>
                  )}
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Company</th>
                  <th className="px-3 py-2 text-right">Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((l: any) => (
                  <tr key={l.financeItemId}>
                    <td className="px-3 py-2">{formatDate(l.tourDate)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.bookingRef || `#${l.bookingId}`}</div>
                      <div className="text-xs text-slate-500">{l.tourName}</div>
                    </td>
                    {mode === 'vendor' ? (
                      <td className="px-3 py-2">{l.driverName || '-'}</td>
                    ) : (
                      <td className="px-3 py-2">{l.vendor || '-'}</td>
                    )}
                    <td className="px-3 py-2 text-right">{l.gross ? formatCurrency(l.gross, 'IDR') : '-'}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(l.companyTakes, 'IDR')}</td>
                    <td className="px-3 py-2 text-right">{l.driverGets ? formatCurrency(l.driverGets, 'IDR') : '-'}</td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                      No lines.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Generated at {new Date(data.generatedAt).toLocaleString('en-GB')}
        </div>
      </div>
    </div>
  )
}
