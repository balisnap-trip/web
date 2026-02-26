import * as React from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table ref={ref} className={cn('w-full border-collapse text-sm caption-bottom', className)} {...props} />
))
Table.displayName = 'Table'

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b align-top', className)} {...props} />
))
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-600',
      className
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-6 py-4 align-top', className)} {...props} />
))
TableCell.displayName = 'TableCell'

interface DataTableShellProps extends React.HTMLAttributes<HTMLDivElement> {
  tableClassName?: string
}

const DataTableShell = React.forwardRef<HTMLDivElement, DataTableShellProps>(
  ({ className, tableClassName, children, ...props }, ref) => (
    <Card ref={ref} className={cn('hover:shadow-lg transition-shadow duration-200', className)} {...props}>
      <div className={cn('overflow-x-auto', tableClassName)}>{children}</div>
    </Card>
  )
)
DataTableShell.displayName = 'DataTableShell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, DataTableShell }
