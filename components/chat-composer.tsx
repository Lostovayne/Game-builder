import {
  ArrowUp,
  Axe,
  Car,
  ChevronDown,
  Crosshair,
  Gamepad2,
  Grip,
  Plane,
  Swords,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

const suggestionRows = [
  [
    { icon: Axe, label: "Voxel survival" },
    { icon: Swords, label: "Ink samurai duel" },
    { icon: Zap, label: "Comic-book firefight" },
    { icon: Plane, label: "Realistic battlefield" },
  ],
  [
    { icon: Crosshair, label: "Fight-first shooter" },
    { icon: Car, label: "Jungle expedition drive" },
    { icon: Gamepad2, label: "Sunny kingdom platformer" },
  ],
]

export function ChatComposer() {
  return (
    <div className="flex w-full flex-col gap-3">
      <InputGroup>
        <InputGroupTextarea
          rows={1}
          className="field-sizing-content max-h-48 min-h-10"
          placeholder="Describe the game you want to build..."
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <InputGroupButton size="xs">
                  <Grip />
                  Kimi K3
                  <ChevronDown />
                </InputGroupButton>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem>Kimi K3</DropdownMenuItem>
              <DropdownMenuItem>Kimi K2</DropdownMenuItem>
              <DropdownMenuItem>GPT-5</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroupButton
            size="icon-sm"
            variant="default"
            className="rounded-full"
          >
            <ArrowUp />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-col items-center gap-1.5">
        {suggestionRows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-center justify-center gap-1.5"
          >
            {row.map((suggestion) => (
              <Button
                key={suggestion.label}
                variant="outline"
                size="sm"
                className="rounded-full font-normal text-muted-foreground"
              >
                <suggestion.icon />
                {suggestion.label}
              </Button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
