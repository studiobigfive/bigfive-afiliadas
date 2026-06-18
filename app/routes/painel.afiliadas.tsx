import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { data: afiliadas } = await supabase.from("afiliadas").select("*").order("nome");
  return { afiliadas: afiliadas ?? [] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAuth(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "criar") {
    const { error } = await supabase.from("afiliadas").insert({
      nome: form.get("nome"),
      email: form.get("email"),
      cupom: (form.get("cupom") as string)?.toUpperCase(),
      pix: form.get("pix"),
    });
    if (error) return { erro: error.message };
    return { sucesso: true };
  }

  if (intent === "toggle") {
    const id = form.get("id");
    const ativo = form.get("ativo") === "true";
    await supabase.from("afiliadas").update({ ativo: !ativo }).eq("id", id);
    return { sucesso: true };
  }

  return null;
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px",
  fontSize: "14px", boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#444",
};

export default function PainelAfiliadas() {
  const { afiliadas } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const criando = fetcher.state !== "idle";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>
      {/* Form */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: "700" }}>Nova afiliada</h2>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="criar" />
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Nome</label>
            <input name="nome" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>E-mail</label>
            <input name="email" type="email" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Cupom</label>
            <input name="cupom" required style={inputStyle} placeholder="Ex: MARIA15" />
            <span style={{ fontSize: "12px", color: "#999", marginTop: "4px", display: "block" }}>Salvo em maiúsculas automaticamente</span>
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Chave PIX</label>
            <input name="pix" style={inputStyle} placeholder="CPF, e-mail ou telefone" />
          </div>
          <button type="submit" disabled={criando} style={{ width: "100%", padding: "12px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "15px", cursor: criando ? "not-allowed" : "pointer" }}>
            {criando ? "Cadastrando..." : "Cadastrar"}
          </button>
        </fetcher.Form>
      </div>

      {/* List */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Afiliadas ({afiliadas.length})</h2>
        </div>
        {afiliadas.length === 0 && (
          <p style={{ padding: "40px", textAlign: "center", color: "#999", margin: 0 }}>Nenhuma afiliada cadastrada ainda</p>
        )}
        {afiliadas.map((a) => (
          <div key={a.id} style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>{a.nome}</div>
              <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>{a.email}</div>
              <span style={{ background: "#111", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{a.cupom}</span>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Link to={`/painel/afiliadas/${a.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>Ver</Link>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="toggle" />
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="ativo" value={String(a.ativo)} />
                <button type="submit" style={{ padding: "6px 14px", border: "1px solid", borderColor: a.ativo ? "#e53e3e" : "#38a169", color: a.ativo ? "#e53e3e" : "#38a169", background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
                  {a.ativo ? "Desativar" : "Ativar"}
                </button>
              </fetcher.Form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
