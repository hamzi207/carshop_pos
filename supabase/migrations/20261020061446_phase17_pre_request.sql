-- Phase 17: run private.pre_request() before every PostgREST request, so a read-only
-- "Login As" makes the request's transaction read only (tested in the previous migration).
alter role authenticator set pgrst.db_pre_request = 'private.pre_request';
notify pgrst, 'reload config';
