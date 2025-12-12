import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-800/50", className)}
      {...props}
    />
  )
}

// Skeleton for conversation list items
function ConversationSkeleton() {
  return (
    <div className="p-3 border-b border-slate-800/50 flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-12 rounded-full" />
    </div>
  )
}

// Skeleton for Kanban cards
function KanbanCardSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-6 h-6 rounded" />
        <Skeleton className="h-4 flex-1" />
      </div>
      <Skeleton className="h-3 w-2/3" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}

// Skeleton for Kanban column
function KanbanColumnSkeleton() {
  return (
    <div className="w-72 flex flex-col h-full bg-slate-900/30 rounded-xl border border-slate-800/50">
      <div className="p-3 border-b border-slate-800/50 space-y-2">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex-1 p-2 space-y-2">
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
      </div>
    </div>
  )
}

// Skeleton for contact rows
function ContactRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-slate-800/50">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-40 hidden md:block" />
      <Skeleton className="h-4 w-24 hidden lg:block" />
      <div className="ml-auto flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}

// Skeleton for chat messages
function MessageSkeleton({ isOutgoing = false }: { isOutgoing?: boolean }) {
  return (
    <div className={cn("flex gap-2 mb-3", isOutgoing && "justify-end")}>
      {!isOutgoing && <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />}
      <div className={cn("space-y-1 max-w-[70%]", isOutgoing && "items-end")}>
        <Skeleton className={cn("h-16 rounded-xl", isOutgoing ? "w-48" : "w-56")} />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}

export { 
  Skeleton, 
  ConversationSkeleton, 
  KanbanCardSkeleton, 
  KanbanColumnSkeleton,
  ContactRowSkeleton,
  MessageSkeleton
}
