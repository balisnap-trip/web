'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ModuleTabs } from '@/components/layout/module-tabs'
import { Settings as SettingsIcon, Save, Info, Database, RefreshCw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useNotifications } from '@/hooks/use-notifications'

interface RotationSettings {
  maxPriorityForRotation: number
}

interface DatabaseSyncTotals {
  localToPeer: number
  peerToLocal: number
  tables: number
  skippedTables: number
}

interface DatabaseSyncSummary {
  status?: 'success' | 'failed'
  at?: string
  by?: string
  error?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  peer?: string
  totals?: DatabaseSyncTotals
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
    >
      <SettingsPageInner />
    </Suspense>
  )
}

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const view = (searchParams.get('view') || 'settings').toLowerCase()
  const isSystemView = view === 'system'
  const [rotationSettings, setRotationSettings] = useState<RotationSettings>({
    maxPriorityForRotation: 20,
  })
  const [featureFlags, setFeatureFlags] = useState({
    whatsappEnabled: true,
    cronEnabled: true,
    cronInterval: 'hourly',
    cronCustomMinutes: 60,
  })
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null)
  const [cronStatus, setCronStatus] = useState<{
    running?: boolean
    startedAt?: string
    finishedAt?: string
    lastError?: {
      at?: string
      name?: string
      message?: string
      stack?: string
      cause?: string
    } | null
  } | null>(null)
  const [showCronErrorModal, setShowCronErrorModal] = useState(false)
  
  const [saving, setSaving] = useState(false)
  const [rotationSavedAt, setRotationSavedAt] = useState<string | null>(null)
  const [cleaningBookings, setCleaningBookings] = useState(false)
  const [cleaningEmails, setCleaningEmails] = useState(false)
  const [showCleanBookingsModal, setShowCleanBookingsModal] = useState(false)
  const [showCleanEmailsModal, setShowCleanEmailsModal] = useState(false)
  const [savingFlags, setSavingFlags] = useState(false)
  const [flagsSavedAt, setFlagsSavedAt] = useState<string | null>(null)
  const [syncConfigured, setSyncConfigured] = useState(false)
  const [syncSameDatabase, setSyncSameDatabase] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncingDatabase, setSyncingDatabase] = useState(false)
  const [syncLocalMasked, setSyncLocalMasked] = useState<string | null>(null)
  const [syncPeerMasked, setSyncPeerMasked] = useState<string | null>(null)
  const [syncLastResult, setSyncLastResult] = useState<DatabaseSyncSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const { notify } = useNotifications()
  const isDev = process.env.NODE_ENV !== 'production'
  
  useEffect(() => {
    fetchSettings()
  }, [])
  
  const fetchSettings = async () => {
    try {
      const [rotationRes, flagsRes, syncRes] = await Promise.all([
        fetch('/api/settings/driver-rotation'),
        fetch('/api/settings/feature-flags'),
        fetch('/api/settings/sync-database'),
      ])
      const rotationData = await rotationRes.json()
      const flagsData = await flagsRes.json()
      const syncData = await syncRes.json().catch(() => null)

      if (rotationData.value) {
        setRotationSettings(rotationData.value)
      }
      if (flagsData.success) {
        setFeatureFlags({
          whatsappEnabled: Boolean(flagsData.whatsappEnabled),
          cronEnabled: Boolean(flagsData.cronEnabled),
          cronInterval: flagsData.cronInterval || 'hourly',
          cronCustomMinutes: Number(flagsData.cronCustomMinutes || 60),
        })
        setCronLastRunAt(flagsData.cronLastRunAt || null)
        setCronStatus(flagsData.cronStatus || null)
      }
      if (syncData?.success) {
        setSyncConfigured(Boolean(syncData.configured))
        setSyncSameDatabase(Boolean(syncData.sameDatabase))
        setSyncRunning(Boolean(syncData.running))
        setSyncLocalMasked(syncData.local || null)
        setSyncPeerMasked(syncData.peer || null)
        setSyncLastResult(syncData.lastResult || null)
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }
  
  const handleSave = async () => {
    setSaving(true)
    
    try {
      const res = await fetch('/api/settings/driver-rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rotationSettings)
      })
      
      if (!res.ok) {
        throw new Error('Failed to save settings')
      }
      
      toast({
        title: 'Success',
        description: 'Driver rotation settings saved successfully!',
      })
      notify({ type: 'success', title: 'Settings Saved', message: 'Driver rotation settings updated.' })
      setRotationSavedAt(new Date().toISOString())
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive'
      })
      notify({ type: 'error', title: 'Save Settings Failed', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveFlags = async () => {
    setSavingFlags(true)
    try {
      const res = await fetch('/api/settings/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(featureFlags),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save feature flags')
      }
      toast({
        title: 'Success',
        description: 'Feature flags saved successfully!',
      })
      notify({ type: 'success', title: 'Settings Saved', message: 'Feature flags updated.' })
      setFlagsSavedAt(new Date().toISOString())
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save feature flags',
        variant: 'destructive'
      })
      notify({ type: 'error', title: 'Save Feature Flags Failed', message: String(error) })
    } finally {
      setSavingFlags(false)
    }
  }
  const handleCleanBookings = async () => {
    setCleaningBookings(true)
    try {
      const res = await fetch('/api/settings/clean-bookings', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to clean bookings')
      }

      toast({
        title: 'Bookings cleaned',
        description: `Deleted ${data.deleted || 0} bookings.`,
      })
      notify({ type: 'success', title: 'Bookings Cleaned', message: `Deleted ${data.deleted || 0} bookings.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clean bookings',
        variant: 'destructive'
      })
      notify({ type: 'error', title: 'Clean Bookings Failed', message: error instanceof Error ? error.message : 'Failed to clean bookings' })
    } finally {
      setCleaningBookings(false)
    }
  }

  const handleCleanEmails = async () => {
    setCleaningEmails(true)
    try {
      const res = await fetch('/api/settings/clean-emails', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to clean emails')
      }

      toast({
        title: 'Emails cleaned',
        description: `Deleted ${data.deleted || 0} emails.`,
      })
      notify({ type: 'success', title: 'Emails Cleaned', message: `Deleted ${data.deleted || 0} emails.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clean emails',
        variant: 'destructive'
      })
      notify({ type: 'error', title: 'Clean Emails Failed', message: error instanceof Error ? error.message : 'Failed to clean emails' })
    } finally {
      setCleaningEmails(false)
    }
  }

  const handleDatabaseSync = async () => {
    setSyncingDatabase(true)
    setSyncRunning(true)

    try {
      const res = await fetch('/api/settings/sync-database', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync database')
      }

      setSyncLastResult({
        status: 'success',
        at: new Date().toISOString(),
        ...(data.result || {}),
      })

      const localToPeer = data.result?.totals?.localToPeer ?? 0
      const peerToLocal = data.result?.totals?.peerToLocal ?? 0

      toast({
        title: 'Database synchronized',
        description: `2-way sync complete. Local→Peer: ${localToPeer}, Peer→Local: ${peerToLocal}.`,
      })
      notify({
        type: 'success',
        title: 'Database Sync Complete',
        message: `Changes applied. Local→Peer: ${localToPeer}, Peer→Local: ${peerToLocal}.`,
      })

      await fetchSettings()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync database'
      toast({
        title: 'Database sync failed',
        description: message,
        variant: 'destructive',
      })
      notify({
        type: 'error',
        title: 'Database Sync Failed',
        message,
      })
      setSyncLastResult({
        status: 'failed',
        at: new Date().toISOString(),
        error: message,
      })
    } finally {
      setSyncingDatabase(false)
      setSyncRunning(false)
    }
  }

  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }
  
  return (
    <div className="space-y-5 p-4">
      <ModuleTabs moduleId="settings" />
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-8 w-8" />
        <h1 className="text-2xl font-bold">System Settings</h1>
      </div>
      
      {!isSystemView ? (
        <Card>
          <CardHeader>
            <CardTitle>Driver Rotation System</CardTitle>
            <CardDescription>
              Configure automatic driver suggestion and rotation settings (monthly reset)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Max Priority Setting */}
            <div className="space-y-2">
              <Label htmlFor="maxPriority" className="text-base font-medium">
                Maximum Priority for Auto-Rotation
              </Label>
              <Input
                id="maxPriority"
                type="number"
                min={1}
                max={100}
                value={rotationSettings.maxPriorityForRotation}
                onChange={(e) => setRotationSettings({
                  ...rotationSettings,
                  maxPriorityForRotation: parseInt(e.target.value) || 20
                })}
                className="max-w-xs"
              />
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  Drivers with priority level &gt; {rotationSettings.maxPriorityForRotation} will
                  <strong> not be auto-suggested</strong> in the rotation queue.
                  They can still be selected manually.
                </p>
              </div>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Current Priority Levels:</p>
                <ul className="text-sm space-y-1">
                  <li>• Priority 1-20: <strong>In auto-rotation</strong> (suggested automatically)</li>
                  <li>• Priority &gt;20: <strong>Manual selection only</strong></li>
                </ul>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
              {rotationSavedAt && (
                <div className="mt-2 text-xs text-green-600">
                  Saved at {new Date(rotationSavedAt).toLocaleString('en-GB')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Operational Toggles</CardTitle>
              <CardDescription>
                Enable or disable key system behaviors without redeploying.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">WhatsApp Notifications</div>
                  <div className="text-sm text-muted-foreground">
                    Toggle sending WhatsApp notifications to internal group.
                  </div>
                </div>
                <Checkbox
                  checked={featureFlags.whatsappEnabled}
                  onChange={(e) => setFeatureFlags({ ...featureFlags, whatsappEnabled: e.target.checked })}
                  className="h-5 w-5"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">Cron Processing</div>
                  <div className="text-sm text-muted-foreground">
                    Enable background cron email processing.
                  </div>
                </div>
                <Checkbox
                  checked={featureFlags.cronEnabled}
                  onChange={(e) => setFeatureFlags({ ...featureFlags, cronEnabled: e.target.checked })}
                  className="h-5 w-5"
                />
              </div>
              <div className="text-xs text-gray-500">
                Last run: {cronLastRunAt ? new Date(cronLastRunAt).toLocaleString() : 'Never'}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>
                  Status: {cronStatus?.running ? 'Running' : cronStatus?.lastError ? 'Error' : 'Idle'}
                  {cronStatus?.running && cronStatus?.startedAt
                    ? ` (since ${new Date(cronStatus.startedAt).toLocaleString()})`
                    : ''}
                  {!cronStatus?.running && cronStatus?.lastError?.at
                    ? ` (last error ${new Date(cronStatus.lastError.at).toLocaleString()})`
                    : ''}
                </span>
                {!cronStatus?.running && cronStatus?.lastError ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCronErrorModal(true)}
                    className="h-7 px-2 text-xs"
                  >
                    Lihat detail
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Cron Interval</Label>
                  <Select
                    value={featureFlags.cronInterval}
                    onChange={(e) => setFeatureFlags({ ...featureFlags, cronInterval: e.target.value })}
                    className="mt-1"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="custom">Custom (minutes)</option>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700">Custom Minutes</Label>
                  <Input
                    type="number"
                    min={5}
                    disabled={featureFlags.cronInterval !== 'custom'}
                    value={featureFlags.cronCustomMinutes}
                    onChange={(e) => setFeatureFlags({ ...featureFlags, cronCustomMinutes: Number(e.target.value || 60) })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={handleSaveFlags}
                  disabled={savingFlags}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {savingFlags ? 'Saving...' : 'Save Toggles'}
                </Button>
                {flagsSavedAt && (
                  <div className="mt-2 text-xs text-green-600">
                    Saved at {new Date(flagsSavedAt).toLocaleString('en-GB')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Sync Database (2-Way)
              </CardTitle>
              <CardDescription>
                Merge data both directions between current database and peer database.
                Latest row wins by <code>updated_at</code> (or <code>created_at</code> fallback).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  Local: <span className="font-mono">{syncLocalMasked || '-'}</span>
                </div>
                <div>
                  Peer: <span className="font-mono">{syncPeerMasked || '-'}</span>
                </div>
              </div>

              {!syncConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Set <code>SYNC_DATABASE_URL</code> in environment to enable this button.
                </div>
              )}

              {syncSameDatabase && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  Local and peer point to the same database. Sync is blocked for safety.
                </div>
              )}

          <div className="pt-2 border-t">
            <Button
              onClick={handleDatabaseSync}
              disabled={!syncConfigured || syncSameDatabase || syncingDatabase || syncRunning}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncingDatabase ? 'animate-spin' : ''}`} />
              {syncingDatabase || syncRunning ? 'Syncing...' : 'Sync Now (2-Way)'}
            </Button>
          </div>

          {syncLastResult && (
            <div className={`rounded-lg border p-3 text-sm ${
              syncLastResult.status === 'failed'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-green-200 bg-green-50 text-green-900'
            }`}>
              <div>
                Last result: <strong>{syncLastResult.status || 'unknown'}</strong>
                {syncLastResult.at ? ` at ${new Date(syncLastResult.at).toLocaleString('en-GB')}` : ''}
              </div>
              {syncLastResult.totals && (
                <div className="mt-1">
                  Local→Peer: {syncLastResult.totals.localToPeer} | Peer→Local: {syncLastResult.totals.peerToLocal} | Tables: {syncLastResult.totals.tables}
                </div>
              )}
              {syncLastResult.durationMs !== undefined && (
                <div className="mt-1">
                  Duration: {(syncLastResult.durationMs / 1000).toFixed(1)}s
                </div>
              )}
              {syncLastResult.error && (
                <div className="mt-1">
                  Error: {syncLastResult.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      {/* Information Card */}
      {!isSystemView ? (
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Monthly Rotation</h3>
              <p className="text-sm text-muted-foreground">
                Drivers are suggested based on their assignment count (lowest first)
                and priority level. The assignment counter resets monthly.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Manual Override</h3>
              <p className="text-sm text-muted-foreground">
                Admin can always override suggestions and select any available driver manually.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isDev && isSystemView && (
        <Card>
          <CardHeader>
            <CardTitle>Developer Tools</CardTitle>
            <CardDescription>
              Tools for re-parsing data. These actions are disabled in production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-amber-200 bg-amber-50">
              <div>
                <div className="font-semibold text-amber-900">Clean Bookings</div>
                <div className="text-sm text-amber-800">
                  Delete all bookings so emails can be re-parsed.
                </div>
              </div>
              <Button
                onClick={() => setShowCleanBookingsModal(true)}
                disabled={cleaningBookings}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {cleaningBookings ? 'Cleaning...' : 'Clean Bookings'}
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-red-200 bg-red-50">
              <div>
                <div className="font-semibold text-red-900">Clean Emails</div>
                <div className="text-sm text-red-800">
                  Delete all emails and parsed data for a fresh sync.
                </div>
              </div>
              <Button
                onClick={() => setShowCleanEmailsModal(true)}
                disabled={cleaningEmails}
                className="bg-red-600 hover:bg-red-700"
              >
                {cleaningEmails ? 'Cleaning...' : 'Clean Emails'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showCronErrorModal && cronStatus?.lastError && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold text-gray-900 mb-1">Cron Error Detail</div>
                <p className="text-sm text-gray-600">
                  {cronStatus.lastError.at
                    ? `Last error at ${new Date(cronStatus.lastError.at).toLocaleString()}`
                    : 'Last error'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowCronErrorModal(false)}
                className="shrink-0"
              >
                Close
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Message</div>
                <pre className="mt-1 text-xs whitespace-pre-wrap break-words rounded-md border bg-muted p-3 max-h-48 overflow-auto">
                  {cronStatus.lastError.message || 'Unknown error'}
                </pre>
              </div>

              {cronStatus.lastError.cause ? (
                <div>
                  <div className="text-sm font-semibold text-gray-900">Cause</div>
                  <pre className="mt-1 text-xs whitespace-pre-wrap break-words rounded-md border bg-muted p-3 max-h-32 overflow-auto">
                    {cronStatus.lastError.cause}
                  </pre>
                </div>
              ) : null}

              {cronStatus.lastError.stack ? (
                <div>
                  <div className="text-sm font-semibold text-gray-900">Stack</div>
                  <pre className="mt-1 text-xs whitespace-pre-wrap break-words rounded-md border bg-muted p-3 max-h-64 overflow-auto">
                    {cronStatus.lastError.stack}
                  </pre>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      )}

      <Dialog open={showCleanBookingsModal} onOpenChange={setShowCleanBookingsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Clean Bookings</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will delete ALL bookings. This action is DEV only and cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCleanBookingsModal(false)}
              className="flex-1"
              disabled={cleaningBookings}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleCleanBookings()
                setShowCleanBookingsModal(false)
              }}
              className="flex-1 bg-amber-600 hover:bg-amber-700"
              disabled={cleaningBookings}
            >
              {cleaningBookings ? 'Cleaning...' : 'Yes, Clean'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCleanEmailsModal} onOpenChange={setShowCleanEmailsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Clean Emails</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will delete ALL emails and parsed data. This action is DEV only and cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCleanEmailsModal(false)}
              className="flex-1"
              disabled={cleaningEmails}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleCleanEmails()
                setShowCleanEmailsModal(false)
              }}
              className="flex-1 bg-red-600 hover:bg-red-700"
              disabled={cleaningEmails}
            >
              {cleaningEmails ? 'Cleaning...' : 'Yes, Clean'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
