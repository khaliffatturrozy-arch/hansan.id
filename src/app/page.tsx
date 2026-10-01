import { redirect } from "next/navigation";
import { createServerSessionClient } from "@/lib/supabase-server";
import { PosCashierView } from "@/modules/pos/views/PosCashierView";

/**
 * POS root — Server Component gate.
 *
 * Unauthenticated → /login (middleware also guards, this is defense in depth).
 * Authenticated → render the POS view. Tenant staff authorization is enforced
 * by the POS/API layer (requireProtectedRequest). A Developer WITHOUT a Staff
 * record gains no tenant POS authority: no Developer permission is invented
 * here, and no Staff context is fabricated.
 */
export const dynamic = "force-dynamic";

export default async function CashierPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    redirect("/login");
  }

  let user = null;
  try {
    const supabase = await createServerSessionClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/login");
  }

  if (!user) {
    redirect("/login");
  }

  return <PosCashierView />;
}
