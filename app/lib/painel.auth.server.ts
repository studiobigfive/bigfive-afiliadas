import { createCookieSessionStorage, redirect } from "react-router";

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
  cookie: {
    name: "bf_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.DASHBOARD_SECRET || "bf-secret-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function requireAuth(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("auth")) {
    const from = encodeURIComponent(new URL(request.url).pathname);
    throw redirect(`/painel/login?from=${from}`);
  }
}

export async function loginAction(request: Request) {
  const form = await request.formData();
  const password = form.get("password") as string;
  const from = new URL(request.url).searchParams.get("from") || "/painel";

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return { erro: "Senha incorreta" };
  }

  const session = await getSession(request.headers.get("Cookie"));
  session.set("auth", true);
  throw redirect(from, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export { destroySession, getSession };
