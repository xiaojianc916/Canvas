import type {
  ButtonHTMLAttributes,
  DialogHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column'
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  children: ReactNode
}

export interface TextProps {
  as?: 'span' | 'p' | 'label' | 'h1' | 'h2' | 'h3' | 'h4'
  variant?: 'caption' | 'body' | 'body-strong' | 'heading' | 'display'
  truncate?: boolean
  children: ReactNode
}

export interface DialogProps extends DialogHTMLAttributes<HTMLDialogElement> {
  open: boolean
  title?: string
  children: ReactNode
  onClose?: () => void
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}
