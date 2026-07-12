import { cn } from '@/lib/utils'

export function PublicFormBrand({ variant = 'compact', logoOnly = false, className }) {
  return (
    <div
      className={cn(
        'public-form-brand',
        logoOnly && 'public-form-brand--logo-only',
        variant === 'header' && 'public-form-brand--header',
        variant === 'compact' && 'public-form-brand--compact',
        className
      )}
    >
      <img
        src="/emblem-blue.png"
        alt="KnockScout"
        className="public-form-brand__mark"
        width={variant === 'header' ? 36 : 28}
        height={variant === 'header' ? 36 : 28}
      />
      {!logoOnly && (
        <div className="public-form-brand__text">
          <span className="public-form-brand__name">KnockScout</span>
        </div>
      )}
    </div>
  )
}

export function PublicFormBrandBar({ variant = 'compact', className }) {
  return (
    <div className={cn('public-form-brand-bar', className)}>
      <PublicFormBrand logoOnly variant={variant} />
    </div>
  )
}

export default PublicFormBrand
