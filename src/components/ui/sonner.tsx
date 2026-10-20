"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Follows the app theme (RF-16.4), not the OS directly: a light app with a dark OS keeps light toasts.
// Rich colours use the theme's status colours with white text.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "#0f766e",
          "--success-border": "#0f766e",
          "--success-text": "#ffffff",
          "--error-bg": "#e11d48",
          "--error-border": "#e11d48",
          "--error-text": "#ffffff",
          "--info-bg": "#2563eb",
          "--info-border": "#2563eb",
          "--info-text": "#ffffff",
          "--warning-bg": "#d97706",
          "--warning-border": "#d97706",
          "--warning-text": "#ffffff",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Multi-line descriptions (e.g. one changed setting per line).
          description: "whitespace-pre-line",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
