import React from 'react'
import { Navigation, CheckSquare, Square, List, Circle, Phone } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

export function MapControls({ onRecenter, onToggleMultiSelect, isMultiSelectActive, onOpenListPanel, selectedListId, onOpenSkipTracedListPanel }) {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 sm:gap-2 md:gap-2">
      <Button
        onClick={onRecenter}
        size="icon"
        variant="default"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Recenter map"
      >
        <Navigation className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
      <Button
        onClick={onToggleMultiSelect}
        size="icon"
        variant={isMultiSelectActive ? "default" : "outline"}
        className={cn(
          "h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation",
          isMultiSelectActive && "bg-green-600 hover:bg-green-700"
        )}
        title={isMultiSelectActive ? "Multi-select ON - Click to turn off" : "Multi-select OFF - Click to turn on"}
      >
        {isMultiSelectActive ? (
          <CheckSquare className="h-6 w-6 sm:h-5 sm:w-5" />
        ) : (
          <Square className="h-6 w-6 sm:h-5 sm:w-5" />
        )}
      </Button>
      <Button
        onClick={onOpenListPanel}
        size="icon"
        variant={selectedListId ? "default" : "outline"}
        className={cn(
          "h-12 w-12 sm:h-10 sm:w-10 shadow-lg relative touch-manipulation",
          selectedListId && "bg-blue-600 hover:bg-blue-700"
        )}
        title="View lists"
      >
        <List className="h-6 w-6 sm:h-5 sm:w-5" />
        {selectedListId && (
          <Circle className="absolute -top-1 -right-1 h-3 w-3 sm:h-2.5 sm:w-2.5 fill-yellow-400 text-yellow-400" />
        )}
      </Button>
      <Button
        onClick={onOpenSkipTracedListPanel}
        size="icon"
        variant="outline"
        className="h-12 w-12 sm:h-10 sm:w-10 shadow-lg touch-manipulation"
        title="Skip Traced Parcels"
      >
        <Phone className="h-6 w-6 sm:h-5 sm:w-5" />
      </Button>
    </div>
  )
}

