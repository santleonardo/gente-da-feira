import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-xl border border-input bg-[var(--paper)] px-3.5 py-3 text-sm text-foreground shadow-none transition-colors",
        "placeholder:text-muted-foreground/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-[var(--brand)]/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
