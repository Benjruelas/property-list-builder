import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variantClass = {
  secondary: '',
  primary: 'quote-panel-action-btn--primary',
  danger: 'quote-panel-action-btn--danger',
}

export const PanelActionButton = forwardRef(function PanelActionButton(
  { variant = 'secondary', className, as: Component = 'button', type, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      data-panel-action
      data-panel-action-variant={variant}
      type={Component === 'button' ? (type ?? 'button') : undefined}
      className={cn('quote-panel-action-btn', variantClass[variant] ?? variantClass.secondary, className)}
      {...props}
    />
  )
})
