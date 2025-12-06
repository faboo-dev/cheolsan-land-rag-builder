
import { createClient } from '@supabase/supabase-js';

// @ts-ignore
const supabaseUrl = process.env.SUPABASE_URL;
// @ts-ignore
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing. Database features will not work.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export interface DocumentRow {
  id: number;
  content: string;
  metadata: any; // Contains Source info
  similarity?: number;
}
