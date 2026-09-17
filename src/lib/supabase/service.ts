import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Service-role client — RLS'ni chetlab o'tadi va `service_role` grantli
 * xavfli funksiyalarni (apply_order_payment, expire_order) chaqira oladi.
 * FAQAT server tomonda ishlatilishi mumkin. Kalit hech qachon client bundle'ga
 * chiqmasligi kerak (env var prefixida `NEXT_PUBLIC_` yo'q).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY sozlanmagan");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
