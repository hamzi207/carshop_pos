"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// The app is light-only; following the OS dark mode turned every toast black.
// Rich colours use the theme's status colours with white text.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
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
          "--success-bg": "var(--green-dark)",
          "--success-border": "var(--green-dark)",
          "--success-text": "#ffffff",
          "--error-bg": "#e11d48",
          "--error-border": "#e11d48",
          "--error-text": "#ffffff",
          "--info-bg": "var(--blue)",
          "--info-border": "var(--blue)",
          "--info-text": "#ffffff",
          "--warning-bg": "#d97706",
          "--warning-border": "#d97706",
          "--warning-text": "#ffffff",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
