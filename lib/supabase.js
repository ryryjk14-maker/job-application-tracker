import { createClient } from '@supabase/supabase-js';

export { STATUS_OPTIONS } from './statusOptions.js';

// Server-side Supabase client.
//
// Every database read and write in this app happens on the server (server
// components, API routes, the scheduled job), so we prefer the service role
// key when it is configured. It lets the app write even if row level security
// is turned on. If it is missing we fall back to the anon key, which is enough
// for a project with RLS disabled.
//
// The service role key is never sent to the browser: it has no NEXT_PUBLIC_
// prefix, and this module is only imported from server code.
//
// The client is created on first use rather than at import time so a missing
// environment variable surfaces as a request error instead of breaking the
// build.

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and either ' +
        'SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'See .env.example.'
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
