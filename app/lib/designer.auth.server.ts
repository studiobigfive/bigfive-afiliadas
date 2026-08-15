import { createCookieSessionStorage, redirect } from "react-router";
import { supabase } from "./supabase.server";
import { enviarCodigoOTP } from "./email.server";

if (!process.env.DASHBOARD_SECRET) {
  console.warn("[designer.auth] AVISO: DASHBOARD_SECRET não definido — usando fallback inseguro.");
}

// Sessão autenticada (após verificar o código)
const authStorage = createCookieSessionStorage({
  cookie: {
    name: "bf_designer_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    path: "/",
    sameSite: "lax",
    secrets: [process.env.DASHBOARD_SECRET || "bf-secret-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

// Sessão temporária enquanto espera o código OTP
const pendingStorage = createCookieSessionStorage({
  cookie: {
    name: "bf_designer_pending",
    httpOnly: true,
    maxAge: 60 * 15,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.DASHBOARD_SECRET || "bf-secret-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function requireDesignerAuth(request: Request): Promise<string> {
  const session = await authStorage.getSession(request.headers.get("Cookie"));
  const designerId = session.get("designer_id");
  if (!designerId) throw redirect("/designer/login");
  return designerId as string;
}

function gerarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function iniciarLoginDesignerAction(request: Request) {
  try {
    const form = await request.formData();
    const email = (form.get("email") as string)?.toLowerCase().trim();

    if (!email) return { erro: "Preencha seu e-mail" };

    const { data: designer, error: dbError } = await supabase
      .from("designers")
      .select("id, nome, email")
      .eq("ativo", true)
      .ilike("email", email)
      .single();

    if (dbError) console.error("Supabase designer query error:", dbError);

    if (!designer || !designer.email || designer.email.toLowerCase() !== email) {
      return { erro: "E-mail não encontrado" };
    }

    // Conta de visualização do admin: entra direto, sem OTP
    if (email === PREVIEW_EMAIL) {
      const authSession = await authStorage.getSession();
      authSession.set("designer_id", designer.id);
      throw redirect("/designer", {
        headers: { "Set-Cookie": await authStorage.commitSession(authSession) },
      });
    }

    // Limpa OTPs expirados para não acumular lixo na tabela
    await supabase
      .from("designer_otp")
      .delete()
      .eq("designer_id", designer.id)
      .lt("expira_em", new Date().toISOString());

    // Invalida códigos anteriores não usados
    await supabase
      .from("designer_otp")
      .update({ usado: true })
      .eq("designer_id", designer.id)
      .eq("usado", false);

    const codigo = gerarCodigo();
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("designer_otp").insert({
      designer_id: designer.id,
      codigo,
      expira_em: expiraEm,
    });

    if (insertError) {
      console.error("Supabase OTP insert error:", insertError);
      return { erro: "Erro ao gerar código. Tente novamente." };
    }

    try {
      await enviarCodigoOTP(designer.email, designer.nome, codigo);
    } catch (emailErr: any) {
      console.error("Resend email error:", emailErr?.message ?? emailErr);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Código OTP para ${designer.email}: ${codigo}`);
      } else {
        return { erro: "Erro ao enviar e-mail. Verifique se o domínio está configurado no Resend." };
      }
    }

    const pendingSession = await pendingStorage.getSession();
    pendingSession.set("designer_id", designer.id);
    pendingSession.set("email_mascarado", mascararEmail(designer.email));

    throw redirect("/designer/verificar", {
      headers: { "Set-Cookie": await pendingStorage.commitSession(pendingSession) },
    });
  } catch (e) {
    if (e instanceof Response) throw e; // deixa o redirect passar
    console.error("iniciarLoginDesignerAction error:", e);
    return { erro: "Erro inesperado. Tente novamente." };
  }
}

export async function verificarCodigoDesignerAction(request: Request) {
  const pendingSession = await pendingStorage.getSession(request.headers.get("Cookie"));
  const designerId = pendingSession.get("designer_id");

  if (!designerId) throw redirect("/designer/login");

  const form = await request.formData();
  const codigo = (form.get("codigo") as string)?.trim();

  const agora = new Date().toISOString();

  const { data: otpAtivo } = await supabase
    .from("designer_otp")
    .select("id, codigo, tentativas")
    .eq("designer_id", designerId)
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
    await supabase.from("designer_otp").update({ tentativas: novasTentativas }).eq("id", otpAtivo.id);
    const restantes = 5 - novasTentativas;
    if (restantes <= 0) return { erro: "Muitas tentativas incorretas. Solicite um novo código." };
    return { erro: `Código incorreto. ${restantes} tentativa(s) restante(s).` };
  }

  await supabase.from("designer_otp").update({ usado: true }).eq("id", otpAtivo.id);

  const authSession = await authStorage.getSession();
  authSession.set("designer_id", designerId);

  throw redirect("/designer", {
    headers: [
      ["Set-Cookie", await authStorage.commitSession(authSession)],
      ["Set-Cookie", await pendingStorage.destroySession(pendingSession)],
    ],
  });
}

export async function getPendingEmailDesigner(request: Request): Promise<string | null> {
  const session = await pendingStorage.getSession(request.headers.get("Cookie"));
  return session.get("email_mascarado") ?? null;
}

// Conta fixa do admin pra visualizar o portal como designer, sem afetar dados reais de parceiros
const PREVIEW_EMAIL = "studiobigfive@gmail.com";

export async function criarSessaoDesignerPreview(): Promise<string> {
  const { data: designer } = await supabase.from("designers").select("id").ilike("email", PREVIEW_EMAIL).single();
  if (!designer) throw new Error("Conta de visualização (designer) não encontrada");

  const authSession = await authStorage.getSession();
  authSession.set("designer_id", designer.id);
  return authStorage.commitSession(authSession);
}

export async function temSessaoDesigner(request: Request): Promise<boolean> {
  const session = await authStorage.getSession(request.headers.get("Cookie"));
  return !!session.get("designer_id");
}

function mascararEmail(email: string): string {
  const [user, domain] = email.split("@");
  const visivel = user.slice(0, 2);
  return `${visivel}***@${domain}`;
}

export async function logoutDesigner(request: Request) {
  const session = await authStorage.getSession(request.headers.get("Cookie"));
  throw redirect("/designer/login", {
    headers: { "Set-Cookie": await authStorage.destroySession(session) },
  });
}
