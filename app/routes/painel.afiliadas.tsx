import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";
import { criarCupomShopify, verificarCupomShopify } from "../lib/shopify-admin.server";

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
    const tipoCupom = form.get("tipo_cupom") as string;
    const cupom = (form.get("cupom") as string)?.toUpperCase().trim();

    if (tipoCupom === "novo") {
      const porcentagem = parseFloat(form.get("porcentagem") as string);
      if (!porcentagem || porcentagem <= 0 || porcentagem > 100) {
        return { erro: "Porcentagem de desconto inválida (1–100)" };
      }
      try {
        await criarCupomShopify(cupom, porcentagem);
      } catch (e: any) {
        return { erro: e.message };
      }
    }

    // Issue #6/#18: valida que o cupom existente realmente existe na Shopify
    if (tipoCupom === "existente") {
      try {
        const existe = await verificarCupomShopify(cupom);
        if (!existe) return { erro: `Cupom "${cupom}" não encontrado na Shopify. Verifique o código exato.` };
      } catch {
        return { erro: "Não foi possível verificar o cupom na Shopify. Tente novamente." };
      }
    }

    const { error } = await supabase.from("afiliadas").insert({
      nome: form.get("nome"),
      email: form.get("email"),
      cupom,
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
  const fetcher = useFetcher<{ erro?: string; sucesso?: boolean }>();
  const criando = fetcher.state !== "idle";
  const [tipoCupom, setTipoCupom] = useState<"existente" | "novo">("existente");

  const erro = fetcher.data?.erro;
  const sucesso = fetcher.data?.sucesso;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px", border: "none", cursor: "pointer", fontWeight: "700",
    fontSize: "13px", borderRadius: "6px",
    background: active ? "#111" : "transparent",
    color: active ? "#fff" : "#666",
    transition: "all 0.15s",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>
      {/* Formulário */}
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: "700" }}>Novo participante</h2>
        <fetcher.Form method="post" key={sucesso ? Date.now() : "form"}>
          <input type="hidden" name="intent" value="criar" />
          <input type="hidden" name="tipo_cupom" value={tipoCupom} />

          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Nome</label>
            <input name="nome" required style={inputStyle} />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>E-mail</label>
            <input name="email" type="email" required style={inputStyle} />
          </div>

          {/* Toggle cupom */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Cupom</label>
            <div style={{ display: "flex", background: "#f5f5f5", borderRadius: "8px", padding: "4px", marginBottom: "10px" }}>
              <button type="button" onClick={() => setTipoCupom("existente")} style={tabStyle(tipoCupom === "existente")}>
                Já existe na Shopify
              </button>
              <button type="button" onClick={() => setTipoCupom("novo")} style={tabStyle(tipoCupom === "novo")}>
                Criar cupom novo
              </button>
            </div>

            <input
              name="cupom"
              required
              style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700" }}
              placeholder={tipoCupom === "novo" ? "Ex: MARIA15" : "Digite o código exato"}
            />

            {tipoCupom === "existente" && (
              <span style={{ fontSize: "12px", color: "#999", marginTop: "4px", display: "block" }}>
                O cupom já deve existir em Shopify → Descontos
              </span>
            )}

            {tipoCupom === "novo" && (
              <span style={{ fontSize: "12px", color: "#00C9A7", marginTop: "4px", display: "block" }}>
                O cupom será criado automaticamente na Shopify
              </span>
            )}
          </div>

          {/* Desconto % — só aparece se novo */}
          {tipoCupom === "novo" && (
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Desconto para o cliente (%)</label>
              <div style={{ position: "relative" }}>
                <input
                  name="porcentagem"
                  type="number"
                  required
                  min="1"
                  max="100"
                  step="0.5"
                  placeholder="Ex: 10"
                  style={{ ...inputStyle, paddingRight: "36px" }}
                />
                <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#888", fontWeight: "700" }}>%</span>
              </div>
              <span style={{ fontSize: "12px", color: "#999", marginTop: "4px", display: "block" }}>
                Quanto o cliente recebe de desconto ao usar o cupom
              </span>
            </div>
          )}

          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Chave PIX</label>
            <input name="pix" style={inputStyle} placeholder="CPF, e-mail ou telefone" />
          </div>

          {erro && (
            <div style={{ background: "#fee2e2", color: "#e53e3e", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>
              {erro}
            </div>
          )}
          {sucesso && (
            <div style={{ background: "#f0fff4", color: "#38a169", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>
              Afiliada cadastrada com sucesso!
            </div>
          )}

          <button
            type="submit"
            disabled={criando}
            style={{ width: "100%", padding: "12px", background: criando ? "#888" : "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "15px", cursor: criando ? "not-allowed" : "pointer" }}
          >
            {criando ? (tipoCupom === "novo" ? "Criando cupom..." : "Cadastrando...") : "Cadastrar"}
          </button>
        </fetcher.Form>
      </div>

      {/* Lista */}
      <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Participantes ({afiliadas.length})</h2>
        </div>
        {afiliadas.length === 0 && (
          <p style={{ padding: "40px", textAlign: "center", color: "#999", margin: 0 }}>Nenhum participante cadastrado ainda</p>
        )}
        {afiliadas.map((a) => (
          <div key={a.id} style={{ padding: "16px 24px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>{a.nome}</div>
              <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>{a.email}</div>
              <span style={{ background: "#111", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: "1px" }}>{a.cupom}</span>
              {!a.ativo &&<span style={{ marginLeft: "6px", background: "#fee2e2", color: "#e53e3e", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>INATIVA</span>}
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Link to={`/painel/afiliada/${a.id}`} style={{ color: "#00C9A7", textDecoration: "none", fontWeight: "600", fontSize: "14px" }}>Ver</Link>
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
