import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// null si faltan las variables de entorno; las páginas muestran un aviso claro.
export const supabase = url && key ? createClient(url, key) : null;
