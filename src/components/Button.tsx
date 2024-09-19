import { buttonClasses } from '@/lib/button'
import linkFix from '@/lib/linkFix'
import { cn } from '@/lib/utils'
import { Link, type LinkProps } from '@tanstack/react-router'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'

type ButtonProps = {
  children: React.ReactNode
  primary?: boolean
  destructive?: boolean
  role?: string
}

export function Button<A extends React.ElementType>({
  children,
  as: Component = 'button',
  primary = false,
  destructive = false,
  role = 'button',
  className,
  ...props
}: ButtonProps & { as?: A } & React.ComponentProps<A>) {
  return (
    <Component
      {...props}
      className={buttonClasses(className, { primary, destructive })}
      role={role}
      draggable={false}
    >
      {children}
    </Component>
  )
}

type RouterLinkProps = LinkProps & React.ComponentProps<typeof Link>

type LinkButtonProps = ButtonProps & RouterLinkProps

export function LinkButton({
  className,
  primary = false,
  destructive = false,
  role = 'button',
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      {...linkFix}
      {...props}
      className={buttonClasses(className, { primary, destructive })}
      role={role}
      draggable={false}
    >
      {children}
    </Link>
  )
}

type MotionButtonProps = ButtonProps & HTMLMotionProps<'button'>

export function MotionButton({
  className,
  primary = false,
  destructive = false,
  role = 'button',
  children,
  ...props
}: MotionButtonProps) {
  return (
    <motion.button
      {...props}
      className={buttonClasses(className, { primary, destructive })}
      role={role}
      draggable={false}
    >
      {children}
    </motion.button>
  )
}

type MotionLinkProps = RouterLinkProps & HTMLMotionProps<'a'>

export const MotionLink = forwardRef<HTMLAnchorElement, MotionLinkProps>(
  (props, ref) => {
    return <motion.a {...props} ref={ref} />
  }
)
MotionLink.displayName = 'MotionLink'

export function ExternalLinkInline({
  children,
  className,
  ...props
}: React.HTMLProps<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      className={cn(
        'rounded-sm underline underline-offset-2 transition hover:text-white focus-visible:text-white focus-visible:outline-none active:text-zinc-200',
        className
      )}
      target="_blank"
      rel="noreferrer"
      draggable={false}
    >
      {children}
    </a>
  )
}
