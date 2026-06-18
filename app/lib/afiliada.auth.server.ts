import { createCookieSessionStorage, redirect } from "react-router";
import { supabase } from "./supabase.server";
import { enviarCodigoOTP } from "./email.server";

// Sessão autenticada (após verificar o código)
const authStorage = createCookieSessionStorage({
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

// Sessão temporária enquanto espera o código OTP
const pendingStorage = createCookieSessionStorage({
  cookie: {
    name: "bf_afiliada_pending",
    httpOnly: true,
    maxAge: 60 * 15,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.DASHBOARD_SECRET || "bf-secret-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function requireAfiliadaAuth(request: Request): Promise<string> {
  const session = await authStorage.getSession(request.headers.get("Cookie"));
  const afiliadaId = session.get("afiliada_id");
  if (!afiliadaId) throw redirect("/afiliada/login");
  return afiliadaId as string;
}

function gerarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function iniciarLoginAction(request: Request) {
  const form = await request.formData();
  const cupom = (form.get("cupom") as string)?.toUpperCase().trim();
  const email = (form.get("email") as string)?.toLowerCase().trim();

  const { data: afiliada } = await supabase
    .from("afiliadas")
    .select("id, nome, email")
    .eq("cupom", cupom)
    .eq("ativo", true)
    .single();

  if (!afiliada || afiliada.email.toLowerCase() !== email) {
    return { erro: "Cupom ou e-mail incorretos" };
  }

  // Invalida códigos anteriores não usados
  await supabase
    .from("afiliada_otp")
    .update({ usado: true })
    .eq("afiliada_id", afiliada.id)
    .eq("usado", false);

  const codigo = gerarCodigo();
  const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from("afiliada_otp").insert({
    afiliada_id: afiliada.id,
    codigo,
    expira_em: expiraEm,
  });

  await enviarCodigoOTP(afiliada.email, afiliada.nome, codigo);

  const pendingSession = await pendingStorage.getSession();
  pendingSession.set("afiliada_id", afiliada.id);
  pendingSession.set("email_mascarado", mascararEmail(afiliada.email));

  throw redirect("/afiliada/verificar", {
    headers: { "Set-Cookie": await pendingStorage.commitSession(pendingSession) },
  });
}

export async function verificarCodigoAction(request: Request) {
  const pendingSession = await pendingStorage.getSession(request.headers.get("Cookie"));
  const afiliadaId = pendingSession.get("afiliada_id");

  if (!afiliadaId) throw redirect("/afiliada/login");

  const form = await request.formData();
  const codigo = (form.get("codigo") as string)?.trim();

  const agora = new Date().toISOString();
  const { data: otp } = await supabase
    .from("afiliada_otp")
    .select("id")
    .eq("afiliada_id", afiliadaId)
    .eq("codigo", codigo)
    .eq("usado", false)
    .gte("expira_em", agora)
    .single();

  if (!otp) return { erro: "Código incorreto ou expirado" };

  await supabase.from("afiliada_otp").update({ usado: true }).eq("id", otp.id);

  const authSession = await authStorage.getSession();
  authSession.set("afiliada_id", afiliadaId);

  throw redirect("/afiliada", {
    headers: [
      ["Set-Cookie", await authStorage.commitSession(authSession)],
      ["Set-Cookie", await pendingStorage.destroySession(pendingSession)],
    ],
  });
}

export async function getPendingEmail(request: Request): Promise<string | null> {
  const session = await pendingStorage.getSession(request.headers.get("Cookie"));
  return session.get("email_mascarado") ?? null;
}

function mascararEmail(email: string): string {
  const [user, domain] = email.split("@");
  const visivel = user.slice(0, 2);
  return `${visivel}***@${domain}`;
}

export async function logoutAfiliada(request: Request) {
  const session = await authStorage.getSession(request.headers.get("Cookie"));
  throw redirect("/afiliada/login", {
    headers: { "Set-Cookie": await authStorage.destroySession(session) },
  });
}
