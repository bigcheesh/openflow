import { createClient } from '@supabase/supabase-js'

const fallbackProjectId = 'xmieyvrurbopbvyvjloi'
const fallbackPublishableKey =
  'sb_publishable_Fw6fqVjP_vbTrn0JymTWYg_4R6MrCTF'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID ?? fallbackProjectId}.supabase.co`

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? fallbackPublishableKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
