import { toast } from "sonner";

/**
 * Toasts for every save / create / discard / delete: a short title plus a line
 * saying what actually happened (stock moved, number used, what's next).
 */
export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
};
