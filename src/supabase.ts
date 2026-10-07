import { createClient } from "@supabase/supabase-js";

// Chave pública (publishable): pode ficar no site. A segurança vem das regras de acesso do banco.
export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || "https://mawgbhkmfzqvxblokkzx.supabase.co";
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_qCCnV8ENXqQB8T2L_hw5lw_eYCkmEt4";

export const supabase = createClient(SUPA_URL, SUPA_KEY);
