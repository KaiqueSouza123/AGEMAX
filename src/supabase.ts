import { createClient } from "@supabase/supabase-js";

// Chave pública (publishable): pode ficar no site. A segurança vem das regras de acesso do banco.
const URL = import.meta.env.VITE_SUPABASE_URL || "https://mawgbhkmfzqvxblokkzx.supabase.co";
const KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_qCCnV8ENXqQB8T2L_hw5lw_eYCkmEt4";

export const supabase = createClient(URL, KEY);
