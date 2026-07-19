import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, id, ...rest }: InputProps) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`
  return (
    <div className="hc-input-field">
      {label && (
        <label className="hc-input-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        aria-invalid={!!error}
        className={`hc-input${error ? ' hc-input--error' : ''}`}
        id={inputId}
        {...rest}
      />
      {error && (
        <span className="hc-input-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
