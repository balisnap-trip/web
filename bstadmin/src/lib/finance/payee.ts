export type PayeeMode = 'NONE' | 'PARTNER_ONLY' | 'DRIVER_ONLY' | 'EITHER' | (string & {})

export const canPartner = (payeeMode?: PayeeMode | null) => {
  if (!payeeMode) return true
  return payeeMode === 'PARTNER_ONLY' || payeeMode === 'EITHER'
}

export const canDriver = (payeeMode?: PayeeMode | null) =>
  payeeMode === 'DRIVER_ONLY' || payeeMode === 'EITHER'

export const isNoPayee = (payeeMode?: PayeeMode | null) => payeeMode === 'NONE'

export const isPartnerRequired = (payeeMode?: PayeeMode | null, requirePartner?: boolean | null) => {
  if (requirePartner === false) return false
  return canPartner(payeeMode)
}

export const getPayeeLabel = (options: {
  payeeMode?: PayeeMode | null
  partnerName?: string | null
  placeholder?: string
}) => {
  const { payeeMode, partnerName, placeholder = '-' } = options
  if (isNoPayee(payeeMode)) return 'No Payee'
  if (!canPartner(payeeMode)) return 'Auto (Driver)'
  return partnerName || placeholder
}
