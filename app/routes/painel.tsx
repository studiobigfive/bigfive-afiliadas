import type { LoaderFunctionArgs } from "react-router";
import { Outlet, Link, useLocation } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  return null;
};

export default function Painel() {
  const { pathname } = useLocation();

  const link = (href: string, label: string) => {
    const active = href === "/painel" ? pathname === "/painel" : pathname.startsWith(href);
    return (
      <Link to={href} style={{
        color: active ? "#00C9A7" : "#aaa",
        textDecoration: "none",
        fontWeight: "600",
        fontSize: "14px",
        borderBottom: active ? "2px solid #00C9A7" : "2px solid transparent",
        paddingBottom: "2px",
      }}>
        {label}
      </Link>
    );
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", background: "#f5f5f5" }}>
      <style>{`
        @media (max-width: 480px) {
          .bf-admin-header { padding: 0 16px !important; gap: 20px !important; }
          .bf-admin-main { padding: 20px 14px !important; }
        }
      `}</style>
      <header
        className="bf-admin-header"
        style={{
          background: "#111111", padding: "0 32px", display: "flex", alignItems: "center", gap: "40px", height: "56px",
          overflowX: "auto", WebkitOverflowScrolling: "touch", whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#fff", fontWeight: "800", fontSize: "16px", letterSpacing: "2px", flexShrink: 0 }}>BIGFIVE</span>
        <nav style={{ display: "flex", gap: "24px", flexShrink: 0 }}>
          {link("/painel", "Dashboard")}
          {link("/painel/influencers", "Influencers")}
          {link("/painel/designers", "Designers")}
          {link("/painel/configuracoes", "Configurações")}
        </nav>
      </header>
      <main className="bf-admin-main" style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        <Outlet />
      </main>
    </div>
  );
}
