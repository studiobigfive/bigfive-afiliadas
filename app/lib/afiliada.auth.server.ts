import { createCookieSessionStorage, redirect } from "react-router";
import { supabase } from "./supabase.server";
import { enviarCodigoOTP } from "./email.server";

if (!process.env.DASHBOARD_SECRET) {
  console.warn("[afiliada.auth] AVISO: DASHBOARD_SECRET não definido — usando fallback inseguro.");
}

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
  try {
    const form = await request.formData();
    const cupom = (form.get("cupom") as string)?.toUpperCase().trim();
    const email = (form.get("email") as string)?.toLowerCase().trim();

    if (!cupom || !email) return { erro: "Preencha cupom e e-mail" };

    const { data: afiliada, error: dbError } = await supabase
      .from("afiliadas")
      .select("id, nome, email")
      .eq("cupom", cupom)
      .eq("ativo", true)
      .single();

    if (dbError) console.error("Supabase afiliada query error:", dbError);

    if (!afiliada || afiliada.email.toLowerCase() !== email) {
      return { erro: "Cupom ou e-mail incorretos" };
    }

    // Issue #19: limpa OTPs expirados para não acumular lixo na tabela
    await supabase
      .from("afiliada_otp")
      .delete()
      .eq("afiliada_id", afiliada.id)
      .lt("expira_em", new Date().toISOString());

    // Invalida códigos anteriores não usados
    await supabase
      .from("afiliada_otp")
      .update({ usado: true })
      .eq("afiliada_id", afiliada.id)
      .eq("usado", false);

    const codigo = gerarCodigo();
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("afiliada_otp").insert({
      afiliada_id: afiliada.id,
      codigo,
      expira_em: expiraEm,
    });

    if (insertError) {
      console.error("Supabase OTP insert error:", insertError);
      return { erro: "Erro ao gerar código. Tente novamente." };
    }

    try {
      await enviarCodigoOTP(afiliada.email, afiliada.nome, codigo);
    } catch (emailErr: any) {
      console.error("Resend email error:", emailErr?.message ?? emailErr);
      // Em dev, loga o código no console como fallback
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Código OTP para ${afiliada.email}: ${codigo}`);
      } else {
        return { erro: "Erro ao enviar e-mail. Verifique se o domínio está configurado no Resend." };
      }
    }

    const pendingSession = await pendingStorage.getSession();
    pendingSession.set("afiliada_id", afiliada.id);
    pendingSession.set("email_mascarado", mascararEmail(afiliada.email));

    throw redirect("/afiliada/verificar", {
      headers: { "Set-Cookie": await pendingStorage.commitSession(pendingSession) },
    });
  } catch (e) {
    if (e instanceof Response) throw e; // deixa o redirect passar
    console.error("iniciarLoginAction error:", e);
    return { erro: "Erro inesperado. Tente novamente." };
  }
}

export async function verificarCodigoAction(request: Request) {
  const pendingSession = await pendingStorage.getSession(request.headers.get("Cookie"));
  const afiliadaId = pendingSession.get("afiliada_id");

  if (!afiliadaId) throw redirect("/afiliada/login");

  const form = await request.formData();
  const codigo = (form.get("codigo") as string)?.trim();

  const agora = new Date().toISOString();

  // Issue #8: busca o OTP ativo mais recente SEM verificar o código
  // (permite rastrear tentativas antes de rejeitar)
  const { data: otpAtivo } = await supabase
    .from("afiliada_otp")
    .select("id, codigo, tentativas")
    .eq("afiliada_id", afiliadaId)
    .eq("usado", false)
    .gte("expira_em", agora)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (!otpAtivo) return { erro: "Código expirado. Solicite um novo." };

  const tentativas = otpAtivo.tentativas ?? 0;
  if (tentativas >= 5) {
    return { erro: "Muitas tentativas incorretas. Solicite um novo código." };
  }

  if (otpAtivo.codigo !== codigo) {
    const novasTentativas = tentativas + 1;
    await supabase.from("afiliada_otp").update({ tentativas: novasTentativas }).eq("id", otpAtivo.id);
    const restantes = 5 - novasTentativas;
    if (restantes <= 0) return { erro: "Muitas tentativas incorretas. Solicite um novo código." };
    return { erro: `Código incorreto. ${restantes} tentativa(s) restante(s).` };
  }

  await supabase.from("afiliada_otp").update({ usado: true }).eq("id", otpAtivo.id);

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
