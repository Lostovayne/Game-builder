"use client"

import { Empty, EmptyDescription } from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import { CoinsIcon, MessageSquareIcon, SquarePenIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"

type SidebarGame = {
  id: string
  title: string
}

export function AppSidebar({ games }: { games: SidebarGame[] }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:justify-center">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Image
            src="/logo.svg"
            alt="Sandbox"
            width={20}
            height={20}
            className="size-5"
          />
          <span className="font-logo text-base">Sandbox</span>
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/" />}
                  isActive={pathname === "/"}
                >
                  <SquarePenIcon />
                  <span>New game</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent className="overflow-hidden">
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <Popover>
                  <PopoverTrigger
                    render={
                      <SidebarMenuButton tooltip="Recents">
                        <MessageSquareIcon />
                        <span>Recents</span>
                      </SidebarMenuButton>
                    }
                  />
                  <PopoverContent
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="w-56 p-1.5"
                  >
                    {games.length === 0 ? (
                      <EmptyDescription className="px-2 py-1.5 text-xs">
                        Your games will live here.
                      </EmptyDescription>
                    ) : (
                      <SidebarMenu>
                        {games.map((game) => (
                          <SidebarMenuItem key={game.id}>
                            <SidebarMenuButton
                              render={<Link href={`/games/${game.id}`} />}
                              isActive={pathname === `/games/${game.id}`}
                              tooltip={game.title}
                            >
                              <MessageSquareIcon />
                              <span className="truncate">{game.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    )}
                  </PopoverContent>
                </Popover>
              </SidebarMenuItem>
            </SidebarMenu>
            {games.length === 0 ? (
              <Empty className="mt-2 overflow-hidden border p-2 opacity-100 transition-[opacity,margin,height,padding,border-width] delay-200 duration-200 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0">
                <EmptyDescription className="text-xs whitespace-nowrap">
                  Your games will live here.
                </EmptyDescription>
              </Empty>
            ) : (
              <SidebarMenu className="group-data-[collapsible=icon]:hidden">
                {games.map((game) => (
                  <SidebarMenuItem key={game.id}>
                    <SidebarMenuButton
                      render={<Link href={`/games/${game.id}`} />}
                      isActive={pathname === `/games/${game.id}`}
                      tooltip={game.title}
                    >
                      <MessageSquareIcon />
                      <span className="truncate">{game.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <CoinsIcon />
              <span>Credits</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>$1.00</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0">
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    rootBox: "w-full! max-w-full",
                    organizationSwitcherTrigger:
                      "w-full! max-w-full justify-between!",
                    organizationPreview: "min-w-0",
                    organizationPreviewTextContainer: "min-w-0",
                    organizationPreviewMainIdentifier: "truncate",
                  },
                }}
              />
            </div>
            <UserButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
