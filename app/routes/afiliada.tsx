import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Outlet, Form } from "react-router";
import { requireAfiliadaAuth } from "../lib/afiliada.auth.server";
import { destroySession, getSession } from "../lib/afiliada.auth.server";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAfiliadaAuth(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const session = await getSession(request.headers.get("Cookie"));
  throw redirect("/afiliada/login", {
    headers: { "Set-Cookie": await destroySession(session) },
  });
};

export default function AfiliadaLayout() {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", background: "#f5f5f5" }}>
      <header style={{ background: "#111", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "56px" }}>
        <span style={{ color: "#fff", fontWeight: "800", fontSize: "16px", letterSpacing: "3px" }}>BIGFIVE</span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#aaa", fontSize: "13px" }}>Portal da Afiliada</span>
          <Form method="post">
            <button type="submit" style={{ background: "transparent", border: "1px solid #333", color: "#aaa", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
              Sair
            </button>
          </Form>
        </div>
      </header>
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        <Outlet />
      </main>
    </div>
  );
}
