import {
  Axe,
  Car,
  Crosshair,
  Gamepad2,
  Plane,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react"

export interface GameSuggestion {
  icon: LucideIcon
  label: string
}

export const suggestionRows: GameSuggestion[][] = [
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
