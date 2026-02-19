import { toBaliDateKey } from '@/lib/booking/bali-date'

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1'

export type FxRate = {
  rate: number
  date: string
}

export async function getUsdToIdrRateForDate(tourDate: Date): Promise<FxRate> {
  const dateKey = toBaliDateKey(tourDate)
  const url = `${FRANKFURTER_BASE}/${dateKey}?base=USD&symbols=IDR`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch FX rate: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const rate = Number(data?.rates?.IDR)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid FX rate response for USD->IDR')
  }

  return {
    rate,
    date: typeof data?.date === 'string' ? data.date : dateKey,
  }
}

export function roundUsd(value: number): string {
  return value.toFixed(2)
}

export function roundIdr(value: number): string {
  return Math.round(value).toString()
}
