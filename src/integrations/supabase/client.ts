import { createClient } from '@supabase/supabase-js';

// For Vercel deployment, you must set these environment variables in your Vercel project settings.
// They also need to be in a .env file for local development.
// VITE_ is a special prefix for Vite projects to expose env vars to the client.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("Supabase URL or Publishable Key is not defined in your environment variables.");
  throw new Error("Supabase environment variables are not set. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);