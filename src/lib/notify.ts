import { toast } from "sonner";

/**
 * Toasts for every save / create / discard / delete: a short title plus a line
 * saying what actually happened (stock moved, number used, what's next).
 *
 * Colours: success (green) = what the user asked for was done, deletes included; info (blue) = neutral, a next
 * step is up to the user (e.g. WhatsApp opened); warning (amber) = nothing broke but something was thrown away
 * or only partly done; error (red) = it failed. Undo (plain) = a reversible removal.
 */
export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
  /** Amber: nothing failed, but something was thrown away (e.g. unsaved changes discarded). */
  warning: (title: string, description?: string) => toast.warning(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
  /** Something was removed; the toast offers an Undo button for a few seconds. */
  undo: (title: string, onUndo: () => void, description?: string) =>
    toast(title, { description, duration: 6000, action: { label: "Undo", onClick: onUndo } }),
};
