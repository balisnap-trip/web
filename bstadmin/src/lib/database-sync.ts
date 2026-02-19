import { PrismaClient } from '@prisma/client'

type DbRow = Record<string, unknown>

interface TableMetadata {
  tableName: string
  columns: string[]
  primaryKey: string[]
  versionColumn: string | null
  columnTypes: Record<string, string>
}

interface DirectionSyncStats {
  examined: number
  applied: number
  mode: 'last-write-wins' | 'insert-missing'
}

export interface TableSyncStats {
  table: string
  localToPeer: DirectionSyncStats
  peerToLocal: DirectionSyncStats
}

export interface BidirectionalSyncResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  peer: string
  totals: {
    localToPeer: number
    peerToLocal: number
    tables: number
    skippedTables: number
  }
  skippedTables: Array<{ table: string; reason: string }>
  tables: TableSyncStats[]
}

const EXCLUDED_TABLES = new Set([
  '_prisma_migrations',
])

const TABLE_PRIORITY: string[] = [
  'users',
  'verification_tokens',
  'accounts',
  'sessions',
  'tours',
  'tour_packages',
  'activities',
  'activity_images',
  'tour_images',
  'tour_itineraries',
  'highlights',
  'inclusions',
  'exclusions',
  'tour_inclusions',
  'tour_exclusions',
  'additional_infos',
  'drivers',
  'categories',
  'partners',
  'service_items',
  'service_item_partners',
  'service_item_drivers',
  'tour_cost_patterns',
  'tour_cost_pattern_items',
  'email_inbox',
  'email_jobs',
  'bookings',
  'booking_emails',
  'booking_finances',
  'booking_finance_items',
  'reviews',
  'company_reviews',
  'notifications',
  'audit_logs',
  'system_settings',
]

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function quoteTable(tableName: string): string {
  return `${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`
}

function maskConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const port = parsed.port || '5432'
    return `${parsed.protocol}//***:***@${parsed.hostname}:${port}${parsed.pathname}`
  } catch {
    return '<invalid-url>'
  }
}

function buildPkKey(row: DbRow, primaryKey: string[]): string {
  return primaryKey.map((column) => JSON.stringify(row[column] ?? null)).join('|')
}

function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  const time = new Date(String(value)).getTime()
  return Number.isNaN(time) ? null : time
}

function getSyncMode(versionColumn: string | null): 'last-write-wins' | 'insert-missing' {
  return versionColumn ? 'last-write-wins' : 'insert-missing'
}

function shouldApplyRow(
  sourceRow: DbRow,
  targetVersionByKey: Map<string, unknown>,
  metadata: TableMetadata
): boolean {
  const key = buildPkKey(sourceRow, metadata.primaryKey)

  if (!targetVersionByKey.has(key)) {
    return true
  }

  if (!metadata.versionColumn) {
    return false
  }

  const sourceVersion = toEpochMs(sourceRow[metadata.versionColumn])
  const targetVersion = toEpochMs(targetVersionByKey.get(key))

  if (sourceVersion === null) {
    return false
  }

  if (targetVersion === null) {
    return true
  }

  return sourceVersion > targetVersion
}

function sortRowsForTable(tableName: string, rows: DbRow[]): DbRow[] {
  if (tableName !== 'booking_finance_items') {
    return rows
  }

  return [...rows].sort((a, b) => {
    const aHasRelation = a.related_item_id !== null && a.related_item_id !== undefined
    const bHasRelation = b.related_item_id !== null && b.related_item_id !== undefined
    return Number(aHasRelation) - Number(bHasRelation)
  })
}

function buildInsertQuery(
  tableName: string,
  columns: string[],
  targetColumnTypes: Record<string, string>,
  primaryKey: string[],
  rowCount: number,
  mode: 'last-write-wins' | 'insert-missing'
): string {
  const quotedColumns = columns.map(quoteIdentifier).join(', ')
  const quotedPk = primaryKey.map(quoteIdentifier).join(', ')

  let placeholderIndex = 1
  const valuesSql = new Array(rowCount).fill(null).map(() => {
    const placeholders = columns.map((column) => `$${placeholderIndex++}::${targetColumnTypes[column]}`)
    return `(${placeholders.join(', ')})`
  }).join(', ')

  if (mode === 'insert-missing') {
    return [
      `INSERT INTO ${quoteTable(tableName)} (${quotedColumns})`,
      `VALUES ${valuesSql}`,
      `ON CONFLICT (${quotedPk}) DO NOTHING`,
    ].join('\n')
  }

  const updateColumns = columns.filter((column) => !primaryKey.includes(column))
  if (updateColumns.length === 0) {
    return [
      `INSERT INTO ${quoteTable(tableName)} (${quotedColumns})`,
      `VALUES ${valuesSql}`,
      `ON CONFLICT (${quotedPk}) DO NOTHING`,
    ].join('\n')
  }

  const updateAssignments = updateColumns
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ')

  return [
    `INSERT INTO ${quoteTable(tableName)} (${quotedColumns})`,
    `VALUES ${valuesSql}`,
    `ON CONFLICT (${quotedPk}) DO UPDATE SET ${updateAssignments}`,
  ].join('\n')
}

function createClient(url: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: url,
    log: ['error'],
  })
}

async function getAllTables(client: PrismaClient): Promise<Set<string>> {
  const rows = await client.$queryRawUnsafe<Array<{ table_name: string }>>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `
  )

  return new Set(
    rows
      .map((row) => row.table_name)
      .filter((name) => !EXCLUDED_TABLES.has(name))
  )
}

async function getMetadata(client: PrismaClient, tableName: string): Promise<TableMetadata | null> {
  const columnsRows = await client.$queryRawUnsafe<Array<{ column_name: string; sql_type: string }>>(
    `
      SELECT
        c.column_name,
        format_type(a.atttypid, a.atttypmod) AS sql_type
      FROM information_schema.columns c
      JOIN pg_class t ON t.relname = c.table_name
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = c.table_schema
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
        AND c.is_generated = 'NEVER'
      ORDER BY c.ordinal_position
    `,
    tableName
  )

  if (columnsRows.length === 0) {
    return null
  }

  const primaryRows = await client.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT a.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.contype = 'p'
      ORDER BY array_position(c.conkey, a.attnum)
    `,
    tableName
  )

  const columns = columnsRows.map((row) => row.column_name)
  const columnTypes = Object.fromEntries(
    columnsRows.map((row) => [row.column_name, row.sql_type])
  ) as Record<string, string>
  const primaryKey = primaryRows.map((row) => row.column_name)
  const versionColumn = columns.includes('updated_at')
    ? 'updated_at'
    : columns.includes('created_at')
      ? 'created_at'
      : null

  return {
    tableName,
    columns,
    primaryKey,
    versionColumn,
    columnTypes,
  }
}

function intersectMetadata(local: TableMetadata, peer: TableMetadata): TableMetadata | null {
  const columnsSet = new Set(peer.columns)
  const commonColumns = local.columns.filter((column) => columnsSet.has(column))

  const peerPkSet = new Set(peer.primaryKey)
  const commonPk = local.primaryKey.filter((column) => peerPkSet.has(column))

  if (commonPk.length === 0 || commonPk.length !== local.primaryKey.length || commonPk.length !== peer.primaryKey.length) {
    return null
  }

  if (!commonPk.every((column, idx) => column === peer.primaryKey[idx])) {
    return null
  }

  const versionColumn = local.versionColumn && commonColumns.includes(local.versionColumn)
    ? local.versionColumn
    : peer.versionColumn && commonColumns.includes(peer.versionColumn)
      ? peer.versionColumn
      : null

  return {
    tableName: local.tableName,
    columns: commonColumns,
    primaryKey: commonPk,
    versionColumn,
    columnTypes: Object.fromEntries(
      commonColumns.map((column) => [column, local.columnTypes[column]])
    ) as Record<string, string>,
  }
}

async function getTargetVersionIndex(
  target: PrismaClient,
  metadata: TableMetadata
): Promise<Map<string, unknown>> {
  const selectedColumns = metadata.versionColumn
    ? [...metadata.primaryKey, metadata.versionColumn]
    : [...metadata.primaryKey]
  const sql = `
    SELECT ${selectedColumns.map(quoteIdentifier).join(', ')}
    FROM ${quoteTable(metadata.tableName)}
  `

  const rows = await target.$queryRawUnsafe<DbRow[]>(sql)
  const map = new Map<string, unknown>()

  for (const row of rows) {
    const key = buildPkKey(row, metadata.primaryKey)
    const version = metadata.versionColumn ? row[metadata.versionColumn] : true
    map.set(key, version)
  }

  return map
}

async function getSourceRows(source: PrismaClient, metadata: TableMetadata): Promise<DbRow[]> {
  const sql = `
    SELECT ${metadata.columns.map(quoteIdentifier).join(', ')}
    FROM ${quoteTable(metadata.tableName)}
  `

  return source.$queryRawUnsafe<DbRow[]>(sql)
}

async function applyRows(
  target: PrismaClient,
  metadata: TableMetadata,
  targetColumnTypes: Record<string, string>,
  rows: DbRow[],
  mode: 'last-write-wins' | 'insert-missing'
): Promise<void> {
  if (rows.length === 0) {
    return
  }

  const batchSize = 100
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    const sql = buildInsertQuery(
      metadata.tableName,
      metadata.columns,
      targetColumnTypes,
      metadata.primaryKey,
      batch.length,
      mode
    )

    const params: unknown[] = []
    for (const row of batch) {
      for (const column of metadata.columns) {
        params.push(row[column] ?? null)
      }
    }

    await target.$executeRawUnsafe(sql, ...params)
  }
}

async function syncDirection(
  source: PrismaClient,
  target: PrismaClient,
  metadata: TableMetadata,
  targetColumnTypes: Record<string, string>
): Promise<DirectionSyncStats> {
  const mode = getSyncMode(metadata.versionColumn)
  const [sourceRows, targetVersionIndex] = await Promise.all([
    getSourceRows(source, metadata),
    getTargetVersionIndex(target, metadata),
  ])

  const rowsToApply = sourceRows.filter((row) => shouldApplyRow(row, targetVersionIndex, metadata))
  const orderedRows = sortRowsForTable(metadata.tableName, rowsToApply)

  await applyRows(target, metadata, targetColumnTypes, orderedRows, mode)

  return {
    examined: sourceRows.length,
    applied: orderedRows.length,
    mode,
  }
}

async function syncSequences(client: PrismaClient): Promise<void> {
  const rows = await client.$queryRawUnsafe<Array<{ table_name: string; column_name: string; sequence_name: string }>>(
    `
      SELECT
        c.relname AS table_name,
        a.attname AS column_name,
        pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
    `
  )

  for (const row of rows) {
    const sql = `
      SELECT setval(
        $1,
        GREATEST(
          COALESCE((SELECT MAX(${quoteIdentifier(row.column_name)}) FROM ${quoteTable(row.table_name)}), 0) + 1,
          1
        ),
        false
      )
    `
    await client.$executeRawUnsafe(sql, row.sequence_name)
  }
}

function sortTables(tableNames: string[]): string[] {
  const priorityIndex = new Map<string, number>(TABLE_PRIORITY.map((name, idx) => [name, idx]))

  return [...tableNames].sort((a, b) => {
    const aPriority = priorityIndex.get(a)
    const bPriority = priorityIndex.get(b)

    if (aPriority !== undefined && bPriority !== undefined) {
      return aPriority - bPriority
    }
    if (aPriority !== undefined) {
      return -1
    }
    if (bPriority !== undefined) {
      return 1
    }
    return a.localeCompare(b)
  })
}

export async function runBidirectionalDatabaseSync(input: {
  localUrl: string
  peerUrl: string
}): Promise<BidirectionalSyncResult> {
  const localClient = createClient(input.localUrl)
  const peerClient = createClient(input.peerUrl)

  const startedAtDate = new Date()
  const startedAt = startedAtDate.toISOString()
  const skippedTables: Array<{ table: string; reason: string }> = []
  const tableStats: TableSyncStats[] = []

  try {
    await Promise.all([localClient.$connect(), peerClient.$connect()])

    const [localTables, peerTables] = await Promise.all([
      getAllTables(localClient),
      getAllTables(peerClient),
    ])

    const commonTables = [...localTables].filter((tableName) => peerTables.has(tableName))
    const orderedTables = sortTables(commonTables)

    for (const tableName of orderedTables) {
      const [localMeta, peerMeta] = await Promise.all([
        getMetadata(localClient, tableName),
        getMetadata(peerClient, tableName),
      ])

      if (!localMeta || !peerMeta) {
        skippedTables.push({ table: tableName, reason: 'metadata-unavailable' })
        continue
      }

      const metadata = intersectMetadata(localMeta, peerMeta)
      if (!metadata) {
        skippedTables.push({ table: tableName, reason: 'incompatible-primary-key-or-columns' })
        continue
      }

      if (metadata.primaryKey.length === 0) {
        skippedTables.push({ table: tableName, reason: 'missing-primary-key' })
        continue
      }

      const localToPeer = await syncDirection(localClient, peerClient, metadata, peerMeta.columnTypes)
      const peerToLocal = await syncDirection(peerClient, localClient, metadata, localMeta.columnTypes)

      tableStats.push({
        table: tableName,
        localToPeer,
        peerToLocal,
      })
    }

    await Promise.all([syncSequences(localClient), syncSequences(peerClient)])

    const finishedAtDate = new Date()
    const finishedAt = finishedAtDate.toISOString()
    const durationMs = finishedAtDate.getTime() - startedAtDate.getTime()

    return {
      startedAt,
      finishedAt,
      durationMs,
      peer: maskConnectionUrl(input.peerUrl),
      totals: {
        localToPeer: tableStats.reduce((sum, item) => sum + item.localToPeer.applied, 0),
        peerToLocal: tableStats.reduce((sum, item) => sum + item.peerToLocal.applied, 0),
        tables: tableStats.length,
        skippedTables: skippedTables.length,
      },
      skippedTables,
      tables: tableStats,
    }
  } finally {
    await Promise.allSettled([localClient.$disconnect(), peerClient.$disconnect()])
  }
}

const databaseSync = {
  runBidirectionalDatabaseSync,
}

export default databaseSync
