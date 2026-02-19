import { ImapFlow, ImapFlowOptions } from 'imapflow'
import { simpleParser, ParsedMail } from 'mailparser'

export type EmailAccount = 'GYG' | 'OTA'

export interface EmailConfig {
  host: string
  port: number
  user: string
  password: string
  tls: boolean
}

export interface RawEmail {
  messageId: string
  uid: number
  subject: string
  from: string
  to: string
  date: Date
  text: string
  html: string | null
  raw: Buffer
}

export class ImapEmailClient {
  private client: ImapFlow | null = null
  private config: EmailConfig
  private isConnected: boolean = false

  constructor(config: EmailConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    const options: ImapFlowOptions = {
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      tls: {
        rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false', // Default: verify TLS certs
      },
      logger: false, // Set to console for debugging
    }

    this.client = new ImapFlow(options)
    await this.client.connect()
    this.isConnected = true
    console.log(`[IMAP] Connected to ${this.config.user}`)
  }

  async ensureConnected(): Promise<void> {
    if (!this.client || !this.isConnected) {
      console.log(`[IMAP] Reconnecting to ${this.config.user}...`)
      await this.connect()
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout()
      } catch (error) {
        console.warn(`[IMAP] Error during disconnect:`, error)
      }
      this.client = null
      this.isConnected = false
      console.log(`[IMAP] Disconnected from ${this.config.user}`)
    }
  }

  async fetchUnreadEmails(limit: number = 50): Promise<RawEmail[]> {
    if (!this.client) {
      throw new Error('IMAP client not connected')
    }

    // Select INBOX
    await this.client.mailboxOpen('INBOX')

    // Search for unread emails
    const messages = await this.client.search({ seen: false }, { uid: true })
    
    if (!messages || messages.length === 0) {
      console.log(`[IMAP] No unread emails found in ${this.config.user}`)
      return []
    }

    console.log(`[IMAP] Found ${messages.length} unread emails in ${this.config.user}`)

    // Limit number of emails to process
    const uidsToFetch = messages.slice(0, limit)
    const emails: RawEmail[] = []

    for (const uid of uidsToFetch) {
      try {
        // Fetch email with full content
        const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true })

        if (!message || !message.source) {
          console.warn(`[IMAP] Message ${uid} not found or missing source`)
          continue
        }

        // Parse email
        const parsed: ParsedMail = await simpleParser(message.source)

        const email: RawEmail = {
          messageId: parsed.messageId || `${uid}-${Date.now()}`,
          uid: uid,
          subject: parsed.subject || '(No Subject)',
          from: this.extractEmail(parsed.from),
          to: this.extractEmail(parsed.to),
          date: parsed.date || new Date(),
          text: parsed.text || '',
          html: parsed.html ? String(parsed.html) : null,
          raw: message.source,
        }

        emails.push(email)
      } catch (error) {
        console.error(`[IMAP] Error fetching email ${uid}:`, error)
      }
    }

    return emails
  }

  /** Fetch all emails in inbox (for manual full sync). Processes in batches to avoid timeout/memory. */
  async fetchAllEmails(limit?: number): Promise<RawEmail[]> {
    if (!this.client) {
      throw new Error('IMAP client not connected')
    }

    await this.client.mailboxOpen('INBOX')
    const messages = await this.client.search({ all: true }, { uid: true })
    if (!messages || messages.length === 0) {
      console.log(`[IMAP] No emails found in ${this.config.user}`)
      return []
    }

    const totalMessages = messages.length
    const uidsToFetch = limit ? messages.slice(0, limit) : messages
    console.log(`[IMAP] Found ${totalMessages} total emails in ${this.config.user}, fetching ${uidsToFetch.length}`)
    return this.fetchEmailsByUids(uidsToFetch)
  }

  /** Fetch emails received on or after `since` (for cron incremental sync). */
  async fetchEmailsSince(since: Date, limit: number = 200): Promise<RawEmail[]> {
    if (!this.client) {
      throw new Error('IMAP client not connected')
    }

    await this.client.mailboxOpen('INBOX')
    const messages = await this.client.search({ since }, { uid: true })
    if (!messages || messages.length === 0) {
      console.log(`[IMAP] No emails since ${since.toISOString()} in ${this.config.user}`)
      return []
    }

    const uidsToFetch = messages.slice(0, limit)
    console.log(`[IMAP] Found ${messages.length} emails since date in ${this.config.user}, fetching ${uidsToFetch.length}`)
    return this.fetchEmailsByUids(uidsToFetch)
  }

  /** Fetch and parse a list of UIDs in batches to avoid timeout/memory. */
  private async fetchEmailsByUids(uids: number[], batchSize: number = 100): Promise<RawEmail[]> {
    if (!this.client || uids.length === 0) return []

    const emails: RawEmail[] = []
    for (let i = 0; i < uids.length; i += batchSize) {
      const batch = uids.slice(i, i + batchSize)
      for (const uid of batch) {
        try {
          const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true })
          if (!message || typeof (message as any).source === 'undefined') continue
          const parsed: ParsedMail = await simpleParser((message as any).source)
          emails.push({
            messageId: parsed.messageId || `${uid}-${Date.now()}`,
            uid,
            subject: parsed.subject || '(No Subject)',
            from: this.extractEmail(parsed.from),
            to: this.extractEmail(parsed.to),
            date: parsed.date || new Date(),
            text: parsed.text || '',
            html: parsed.html ? String(parsed.html) : null,
            raw: (message as any).source,
          })
        } catch (error) {
          console.error(`[IMAP] Error fetching email ${uid}:`, error)
        }
      }
    }
    return emails
  }

  async markAsRead(uid: number): Promise<void> {
    if (!this.client) {
      console.warn(`[IMAP] Client not connected, skipping mark as read for ${uid}`)
      return
    }

    try {
      await this.client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      console.log(`[IMAP] Marked email ${uid} as read`)
    } catch (error: any) {
      // Don't throw error, just log it - marking as read is not critical
      if (error?.code === 'NoConnection') {
        console.warn(`[IMAP] Connection lost, skipping mark as read for ${uid}`)
        this.isConnected = false
      } else {
        console.error(`[IMAP] Error marking email ${uid} as read:`, error)
      }
    }
  }

  async moveToFolder(uid: number, folderName: string): Promise<void> {
    if (!this.client) {
      throw new Error('IMAP client not connected')
    }

    try {
      // Ensure folder exists
      await this.client.mailboxCreate(folderName).catch(() => {
        // Folder already exists, ignore error
      })

      // Move message
      await this.client.messageMove(String(uid), folderName, { uid: true })
      console.log(`[IMAP] Moved email ${uid} to ${folderName}`)
    } catch (error) {
      console.error(`[IMAP] Error moving email ${uid}:`, error)
    }
  }

  private extractEmail(addressObj: any): string {
    if (!addressObj) return ''
    
    if (typeof addressObj === 'string') return addressObj

    if (Array.isArray(addressObj?.value)) {
      return addressObj.value[0]?.address || ''
    }

    if (addressObj?.address) {
      return addressObj.address
    }

    return String(addressObj)
  }
}

// Factory functions for email accounts
export function createGYGClient(): ImapEmailClient {
  return new ImapEmailClient({
    host: process.env.EMAIL_GYG_HOST || 'imap.hostinger.com',
    port: parseInt(process.env.EMAIL_GYG_PORT || '993'),
    user: process.env.EMAIL_GYG_USER || 'admin@balisnaptrip.com',
    password: process.env.EMAIL_GYG_PASSWORD || '',
    tls: true,
  })
}

export function createOTAClient(): ImapEmailClient {
  return new ImapEmailClient({
    host: process.env.EMAIL_OTA_HOST || 'imap.hostinger.com',
    port: parseInt(process.env.EMAIL_OTA_PORT || '993'),
    user: process.env.EMAIL_OTA_USER || 'info@balisnaptrip.com',
    password: process.env.EMAIL_OTA_PASSWORD || '',
    tls: true,
  })
}
