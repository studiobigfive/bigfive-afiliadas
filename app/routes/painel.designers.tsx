import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { data: designers } = await supabase
    .from("designers")
    .select("id, nome, email, instagram, percentual, cupom, ativo")
    .order("nome");
  return { designers: designers ?? [] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAuth(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "criar") {
    const percentual = parseFloat(form.get("percentual") as string);
    if (!percentual || percentual <= 0 || percentual > 100 || isNaN(percentual)) {
      return { erro: "Percentual inválido (1–100)" };
    }
    const { error } = await supabase.from("designers").insert({
      nome: (form.get("nome") as string)?.trim(),
      email: (form.get("email") as string)?.trim() || null,
      pix: (form.get("pix") as string)?.trim() || null,
      instagram: (form.get("instagram") as string)?.replace(/^@/, "").trim() || null,
      whatsapp: (form.get("whatsapp") as string)?.trim() || null,
      cpf: (form.get("cpf") as string)?.trim() || null,
      percentual,
      cupom: (form.get("cupom") as string)?.toUpperCase().trim() || null,
    });
    if (error) return { erro: error.message };
    return { sucesso: true };
  }

  if (intent === "toggle") {
    const id = form.get("id") as string;
    const ativo = form.get("ativo") === "true";
    await supabase.from("designers").update({ ativo: !ativo }).eq("id", id);
    return { sucesso: true };
  }

  return null;
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px",
  fontSize: "14px", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontWeight: "600", fontSize: "12px", marginBottom: "5px", color: "#555",
};

export default function PainelDesigners() {
  const { designers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ erro?: string; sucesso?: boolean }>();
  const criando = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "criar";
  const erro = fetcher.data?.erro;
  const sucesso = fetcher.data?.sucesso;
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (sucesso) setFormKey(k => k + 1);
  }, [sucesso]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>
      {/* Formulário */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: "700" }}>Novo designer</h2>

        <fetcher.Form method="post" key={formKey}>
          <input type="hidden" name="intent" value="criar" />

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Nome *</label>
            <input name="nome" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>E-mail</label>
            <input name="email" type="email" style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Instagram</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#888", fontWeight: "700", fontSize: "14px" }}>@</span>
              <input name="instagram" style={{ ...inputStyle, paddingLeft: "26px" }} placeholder="seuperfil" />
            </div>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>WhatsApp</label>
            <input name="whatsapp" style={inputStyle} placeholder="(11) 99999-9999" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>CPF</label>
            <input name="cpf" style={inputStyle} placeholder="000.000.000-00" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Chave PIX</label>
            <input name="pix" style={inputStyle} placeholder="CPF, e-mail ou telefone" />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Comissão por design (%) *</label>
            <div style={{ position: "relative" }}>
              <input
                name="percentual"
                type="number"
                required
                min="1"
                max="100"
                step="0.5"
                defaultValue="30"
                style={{ ...inputStyle, paddingRight: "32px" }}
              />
              <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#888", fontWeight: "700" }}>%</span>
            </div>
            <span style={{ fontSize: "11px", color: "#aaa", marginTop: "4px", display: "block" }}>
              Percentual sobre o valor do item com design dele
            </span>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Cupom de afiliado (opcional)</label>
            <input
              name="cupom"
              style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}
              placeholder="Ex: TRANSBORDADOS"
            />
            <span style={{ fontSize: "11px", color: "#aaa", marginTop: "4px", display: "block" }}>
              Se o cupom for usado, tem prioridade — design não é comissionado nesse pedido
            </span>
          </div>

          {erro && (
            <div style={{ background: "#fee2e2", color: "#e53e3e", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>
              {erro}
            </div>
          )}
          {sucesso && (
            <div style={{ background: "#f0fff4", color: "#38a169", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>
              Designer cadastrado!
            </div>
          )}

          <button
            type="submit"
            disabled={criando}
            style={{ width: "100%", padding: "12px", background: criando ? "#888" : "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "15px", cursor: criando ? "not-allowed" : "pointer" }}
          >
            {criando ? "Cadastrando..." : "Cadastrar designer"}
          </button>
        </fetcher.Form>
      </div>

      {/* Lista */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Designers ({designers.length})</h2>
        </div>
        {designers.length === 0 && (
          <p style={{ padding: "40px", textAlign: "center", color: "#999", margin: 0 }}>
            Nenhum designer cadastrado ainda
          </p>
        )}
        {designers.map((d) => (
          <div key={d.id} style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>{d.nome}</div>
              {d.email && <div style={{ fontSize: "13px", color: "#888", marginBottom: "4px" }}>{d.email}</div>}
              {d.instagram && <div style={{ fontSize: "12px", color: "#00C9A7", marginBottom: "6px" }}>@{d.instagram}</div>}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ background: "#f0fdf9", color: "#00C9A7", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>{d.percentual}% por design</span>
                {d.cupom && (
                  <span style={{ background: "#111", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{d.cupom}</span>
                )}
                {!d.ativo && (
                  <span style={{ background: "#fee2e2", color: "#e53e3e", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>INATIVO</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Link to={`/painel/designer/${d.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>
                Ver detalhes
              </Link>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="toggle" />
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="ativo" value={String(d.ativo)} />
                <button
                  type="submit"
                  style={{
                    padding: "6px 14px", border: "1px solid", cursor: "pointer",
                    borderColor: d.ativo ? "#e53e3e" : "#38a169",
                    color: d.ativo ? "#e53e3e" : "#38a169",
                    background: "transparent", borderRadius: "6px", fontSize: "13px", fontWeight: "600",
                  }}
                >
                  {d.ativo ? "Desativar" : "Ativar"}
                </button>
              </fetcher.Form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
