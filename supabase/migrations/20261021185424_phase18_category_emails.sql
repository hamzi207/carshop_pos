-- Phase 18: email templates for category requests (to the superadmins, and the outcome to the requester).
alter table public.email_logs drop constraint email_logs_template_check;
alter table public.email_logs add constraint email_logs_template_check check (template = any (array[
  'welcome', 'password_reset', 'staff_invite', 'document_share', 'payment_receipt', 'subscription_invoice',
  'subscription_reminder', 'subscription_receipt', 'subscription_notice', 'superadmin_notice', 'superadmin_invite',
  'category_request', 'category_request_result'
]));
