-- Phase 17 (deliverable 9): "Request a plan change" carries the organization admin's message to the
-- superadmin's email.

alter table public.subscription_events
  add column message text constraint subscription_events_message_check check (char_length(message) <= 1000);
