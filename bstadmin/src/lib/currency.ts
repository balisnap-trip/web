// Currency utilities for multi-currency support

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  IDR: 'Rp',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  SGD: 'S$',
  JPY: '¥',
  CNY: '¥',
}

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
]

export function formatCurrency(
  amount: number | string,
  currency: string = 'USD'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const symbol = CURRENCY_SYMBOLS[currency] || currency

  if (isNaN(numAmount)) {
    return `${symbol}0`
  }

  if (currency === 'IDR' || currency === 'JPY') {
    // IDR and JPY typically don't use decimal places
    return `${symbol} ${numAmount.toLocaleString('en-US', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })}`
  }

  return `${symbol}${numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

export function detectCurrencyFromText(text: string): string {
  // Try to detect currency from text
  if (text.includes('USD') || text.includes('$')) return 'USD'
  if (text.includes('IDR') || text.includes('Rp')) return 'IDR'
  if (text.includes('EUR') || text.includes('€')) return 'EUR'
  if (text.includes('GBP') || text.includes('£')) return 'GBP'
  if (text.includes('AUD') || text.includes('A$')) return 'AUD'
  if (text.includes('SGD') || text.includes('S$')) return 'SGD'
  if (text.includes('JPY') || text.includes('¥') || text.includes('￥')) return 'JPY'

  // Default to USD
  return 'USD'
}
