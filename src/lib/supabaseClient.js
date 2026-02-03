import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vedbqscipotazmrfzgra.supabase.co'
const supabaseKey = 'sb_publishable_0cR2vXlJVYpGqOt9xgeo4Q_F8s3j4Yk'

export const supabase = createClient(supabaseUrl, supabaseKey)
