import * as React from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  labelClassName?: string
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    { label, htmlFor, hint, error, required = false, className, labelClassName, children, ...props },
    ref
  ) => (
    <div ref={ref} className={cn('space-y-1.5', className)} {...props}>
      <Label htmlFor={htmlFor} className={cn('text-sm font-medium', labelClassName)}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
)
FormField.displayName = 'FormField'

export { FormField }
