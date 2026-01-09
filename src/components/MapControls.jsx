import React from 'react'
import { Navigation, CheckSquare, Square, List, Circle } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

export function MapControls({ onRecenter, onToggleMultiSelect, isMultiSelectActive, onOpenListPanel, selectedListId }) {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
      <Button
        onClick={onRecenter}
        size="icon"
        variant="default"
        className="h-10 w-10 shadow-lg"
        title="Recenter map"
      >
        <Navigation className="h-5 w-5" />
      </Button>
      <Button
        onClick={onToggleMultiSelect}
        size="icon"
        variant={isMultiSelectActive ? "default" : "outline"}
        className={cn(
          "h-10 w-10 shadow-lg",
          isMultiSelectActive && "bg-green-600 hover:bg-green-700"
        )}
        title={isMultiSelectActive ? "Multi-select ON - Click to turn off" : "Multi-select OFF - Click to turn on"}
      >
        {isMultiSelectActive ? (
          <CheckSquare className="h-5 w-5" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </Button>
      <Button
        onClick={onOpenListPanel}
        size="icon"
        variant={selectedListId ? "default" : "outline"}
        className={cn(
          "h-10 w-10 shadow-lg relative",
          selectedListId && "bg-blue-600 hover:bg-blue-700"
        )}
        title="View lists"
      >
        <List className="h-5 w-5" />
        {selectedListId && (
          <Circle className="absolute -top-1 -right-1 h-3 w-3 fill-yellow-400 text-yellow-400" />
        )}
      </Button>
    </div>
  )
}

