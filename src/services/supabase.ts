import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be provided as environment variables.");
  // In a real app, you might want to throw an error or show a user-friendly message.
} else {
  console.log("Supabase URL:", supabaseUrl);
  console.log("Supabase Anon Key (first 5 chars):", supabaseAnonKey.substring(0, 5) + "...");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);