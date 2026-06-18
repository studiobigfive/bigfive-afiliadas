import { createCookieSessionStorage, redirect } from "react-router";
import { supabase } from "./supabase.server";

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: "bf_afiliada_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.DASHBOARD_SECRET || "bf-secret-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function requireAfiliadaAuth(request: Request): Promise<string> {
  const session = await getSession(request.headers.get("Cookie"));
  const afiliadaId = session.get("afiliada_id");
  if (!afiliadaId) throw redirect("/afiliada/login");
  return afiliadaId as string;
}

export async function afiliadaLoginAction(request: Request) {
  const form = await request.formData();
  const cupom = (form.get("cupom") as string)?.toUpperCase().trim();

  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("id, nome")
    .eq("cupom", cupom)
    .eq("ativo", true)
    .single();

  if (!afiliada) return { erro: "Cupom não encontrado ou afiliada inativa" };

  const session = await getSession(request.headers.get("Cookie"));
  session.set("afiliada_id", afiliada.id);
  throw redirect("/afiliada", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export { destroySession, getSession };
