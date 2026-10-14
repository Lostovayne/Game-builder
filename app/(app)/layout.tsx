import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { formatCredits } from "@/lib/credits/format"
import { getCreditBalance } from "@/lib/credits/ledger"
import { listGames } from "@/lib/games/queries"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const games = await listGames()
  const credits = formatCredits(await getCreditBalance())

  return (
    <SidebarProvider>
      <AppSidebar games={games} credits={credits} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
