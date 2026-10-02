'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlayIcon, CalendarIcon, BookOpenIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/player',   label: 'Player',   Icon: PlayIcon     },
  { href: '/schedule', label: 'Schedule', Icon: CalendarIcon },
  { href: '/library',  label: 'Library',  Icon: BookOpenIcon },
]

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <nav className={className}>
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Bottom tab bar — mobile only */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 border-t bg-background z-50 flex">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
