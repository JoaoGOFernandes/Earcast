import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { signOut } from '@/modules/auth/actions'
import { Button } from '@/components/ui/button'
import { NavLinks, BottomNav } from '@/components/app/nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen bg-background">
      {/* ── Sidebar — desktop only ────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r">
        <div className="px-4 py-5 border-b">
          <span className="font-bold text-lg tracking-tight">Earcast</span>
        </div>

        <NavLinks className="flex flex-col gap-0.5 p-3 flex-1" />

        <div className="p-3 border-t">
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="font-bold tracking-tight">Earcast</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>

        {/* Page content — scrollable, with bottom padding for mobile tab bar */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* ── Bottom tab bar — mobile only ──────────────────────── */}
      <BottomNav />
    </div>
  )
}
