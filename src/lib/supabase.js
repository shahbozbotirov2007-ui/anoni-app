import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const normalizedSupabaseUrl = (() => {
  try {
    const url = new URL(supabaseUrl || '');
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return null;
  }
  return null;
})();

export const isSupabaseConfigured = Boolean(normalizedSupabaseUrl && supabasePublishableKey);

export const supabase = createClient(
  normalizedSupabaseUrl || 'http://127.0.0.1:54321',
  supabasePublishableKey || 'supabase-configuration-required'
);
