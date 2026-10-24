import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase sozlamalari topilmadi. VITE_SUPABASE_URL va VITE_SUPABASE_PUBLISHABLE_KEY ni belgilang.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
