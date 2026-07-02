import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { supabase } from "../lib/supabase.server";
import { mesAtual } from "../lib/comissao";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const mes = mesAtual();

  const [
    { data: afiliadas },
    { data: designers },
    { data: pedidos },
    { data: pedidosDesigner },
    { data: pagamentos },
    { data: pagamentosDesigner },
  ] = await Promise.all([
    supabase.from("afiliadas").select("id").eq("ativo", true),
    supabase.from("designers").select("id").eq("ativo", true),
    supabase.from("pedidos").select("comissao").eq("mes_referencia", mes).eq("cancelado", false),
    supabase.from("pedidos_designer").select("comissao").eq("mes_referencia", mes).eq("cancelado", false),
    supabase.from("pagamentos").select("valor").eq("mes_referencia", mes),
    supabase.from("pagamentos_designer").select("valor").eq("mes_referencia", mes),
  ]);

  const totalParticipantes = (afiliadas?.length ?? 0) + (designers?.length ?? 0);
  const totalComissao =
    (pedidos ?? []).reduce((s, p) => s + p.comissao, 0) +
    (pedidosDesigner ?? []).reduce((s, p) => s + p.comissao, 0);
  const totalPago =
    (pagamentos ?? []).reduce((s, p) => s + p.valor, 0) +
    (pagamentosDesigner ?? []).reduce((s, p) => s + p.valor, 0);
  const totalAReceber = Math.max(0, totalComissao - totalPago);

  return { totalParticipantes, totalComissao, totalAReceber, mes };
};

const PAINEL_URL = "https://bigfive-afiliadas.vercel.app/painel";
const PORTAL_URL = "https://bigfive-afiliadas.vercel.app/parcerias/login";

export default function Dashboard() {
  const { totalParticipantes, totalComissao, totalAReceber, mes } = useLoaderData<typeof loader>();
  const [ano, mesNum] = mes.split("-");
  const mesLabel = new Date(Number(ano), Number(mesNum) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "32px", background: "#f6f6f7", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: "700", color: "#111", textTransform: "capitalize" }}>
            Programa de Parcerias — {mesLabel}
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>Gerencie participantes e acompanhe comissões</p>
        </div>
        <a
          href={PAINEL_URL}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#00C9A7", color: "#fff", padding: "11px 22px", borderRadius: "10px", textDecoration: "none", fontWeight: "700", fontSize: "14px", boxShadow: "0 2px 8px rgba(0,201,167,0.35)" }}
        >
          Acessar Painel ↗
        </a>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
        {[
          { label: "Participantes ativos", value: String(totalParticipantes), color: "#111" },
          { label: "Comissões geradas", value: fmt(totalComissao), color: "#111" },
          { label: "A pagar este mês", value: fmt(totalAReceber), color: totalAReceber > 0 ? "#e53e3e" : "#38a169" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", borderRadius: "12px", padding: "22px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
            <p style={{ margin: 0, fontSize: "26px", fontWeight: "800", color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Cards de ação */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ background: "#111", borderRadius: "16px", padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "160px" }}>
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: "700", color: "#fff" }}>Painel admin completo</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#999", lineHeight: "1.5" }}>Cadastre participantes, registre pagamentos e veja pedidos detalhados</p>
          </div>
          <a
            href={PAINEL_URL}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", background: "#00C9A7", color: "#111", padding: "12px 24px", borderRadius: "8px", textDecoration: "none", fontWeight: "800", fontSize: "14px", marginTop: "20px", textAlign: "center" }}
          >
            Abrir Painel →
          </a>
        </div>

        <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "160px" }}>
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: "700", color: "#111" }}>Programa de Parcerias</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#888", lineHeight: "1.5" }}>Link para participantes verem seus pedidos, comissões e histórico de pagamentos</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "20px" }}>
            <code style={{ flex: 1, background: "#f5f5f5", padding: "10px 12px", borderRadius: "6px", fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {PORTAL_URL}
            </code>
            <a href={PORTAL_URL} target="_blank" rel="noreferrer" style={{ background: "#111", color: "#fff", padding: "10px 14px", borderRadius: "6px", textDecoration: "none", fontWeight: "700", fontSize: "13px", whiteSpace: "nowrap" }}>
              Abrir ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
