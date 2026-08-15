import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Outlet, Form, Link, useLoaderData } from "react-router";
import { requireDesignerAuth, logoutDesigner } from "../lib/designer.auth.server";
import { temSessaoAfiliada } from "../lib/afiliada.auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireDesignerAuth(request);
  return { mostrarSwitch: await temSessaoAfiliada(request) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return logoutDesigner(request);
};

export default function DesignerLayout() {
  const { mostrarSwitch } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", background: "#f5f5f5" }}>
      <style>{`
        @media (max-width: 480px) {
          .bf-header { padding: 0 16px !important; }
          .bf-header-label { display: none !important; }
          .bf-main { padding: 20px 14px !important; }
          .bf-divider { width: 100% !important; height: 1px !important; margin: 4px 0 !important; }
        }
      `}</style>
      <header className="bf-header" style={{ background: "#111", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "56px" }}>
        <span style={{ color: "#fff", fontWeight: "800", fontSize: "16px", letterSpacing: "3px" }}>BIGFIVE</span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span className="bf-header-label" style={{ color: "#aaa", fontSize: "13px" }}>Programa de Parcerias</span>
          {mostrarSwitch && (
            <Link to="/parcerias" style={{ color: "#00C9A7", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>
              Ver como influencer →
            </Link>
          )}
          <Form method="post">
            <button type="submit" style={{ background: "transparent", border: "1px solid #333", color: "#aaa", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
              Sair
            </button>
          </Form>
        </div>
      </header>
      <main className="bf-main" style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        <Outlet />
      </main>
    </div>
  );
}
