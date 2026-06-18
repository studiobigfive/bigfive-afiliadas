import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { supabase } from "../lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const { data: tiers } = await supabase
    .from("tiers_comissao")
    .select("*")
    .order("vendas_ate", { ascending: true, nullsFirst: false });
  return { tiers: tiers ?? [] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAuth(request);
  const form = await request.formData();
  const id = form.get("id") as string;
  const percentual = parseFloat(form.get("percentual") as string);
  const vendas_ate_raw = form.get("vendas_ate") as string;
  const vendas_ate = vendas_ate_raw === "" ? null : parseFloat(vendas_ate_raw);
  const label = form.get("label") as string;

  if (!id || isNaN(percentual)) return { erro: "Dados inválidos" };

  const { error } = await supabase
    .from("tiers_comissao")
    .update({ percentual, vendas_ate, label })
    .eq("id", id);

  if (error) return { erro: error.message };
  return { sucesso: true };
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #ddd", borderRadius: "6px",
  fontSize: "14px", width: "100%", boxSizing: "border-box",
};

const EMOJI: Record<string, string> = { Bronze: "🥉", Prata: "🥈", Ouro: "🥇" };

export default function PainelConfiguracoes() {
  const { tiers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ erro?: string; sucesso?: boolean }>();

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: "700" }}>Configurações</h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>
          Tiers de comissão baseados no total vendido pela afiliada no mês
        </p>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", maxWidth: "600px" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: "700" }}>Tiers de comissão</h2>

        <div style={{ background: "#f9f9f9", borderRadius: "8px", padding: "14px 16px", marginBottom: "24px", fontSize: "13px", color: "#666", lineHeight: "1.6" }}>
          A taxa aplicada depende do <strong>total acumulado no mês</strong>. Quando a afiliada cruza um tier, os próximos pedidos já entram com a taxa mais alta.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {tiers.map((tier) => (
            <fetcher.Form key={tier.id} method="post">
              <input type="hidden" name="id" value={tier.id} />
              <div style={{ border: "1px solid #eee", borderRadius: "10px", padding: "16px", display: "grid", gridTemplateColumns: "120px 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#888", marginBottom: "4px" }}>Tier</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "18px" }}>{EMOJI[tier.label] ?? "⭐"}</span>
                    <input name="label" defaultValue={tier.label} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#888", marginBottom: "4px" }}>
                    Vendas até (R$)
                  </label>
                  <input
                    name="vendas_ate"
                    type="number"
                    defaultValue={tier.vendas_ate ?? ""}
                    placeholder="Ilimitado (topo)"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#888", marginBottom: "4px" }}>
                    Comissão (%)
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      name="percentual"
                      type="number"
                      defaultValue={tier.percentual}
                      min="1" max="100" step="0.5"
                      style={{ ...inputStyle, paddingRight: "28px" }}
                    />
                    <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: "13px", fontWeight: "700" }}>%</span>
                  </div>
                </div>
                <button type="submit" style={{ padding: "9px 16px", background: "#111", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "700", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  Salvar
                </button>
              </div>
            </fetcher.Form>
          ))}
        </div>

        {fetcher.data?.sucesso && (
          <p style={{ color: "#38a169", fontSize: "13px", marginTop: "16px", fontWeight: "600" }}>✓ Salvo com sucesso</p>
        )}
        {fetcher.data?.erro && (
          <p style={{ color: "#e53e3e", fontSize: "13px", marginTop: "16px" }}>{fetcher.data.erro}</p>
        )}

        <div style={{ marginTop: "24px", padding: "16px", background: "#f0fdf9", borderRadius: "8px", fontSize: "13px", color: "#444" }}>
          <strong style={{ color: "#00C9A7" }}>Como funciona:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: "20px", lineHeight: "1.8" }}>
            {tiers.map((t, i) => {
              const anterior = i === 0 ? 0 : (tiers[i - 1].vendas_ate ?? 0) + 0.01;
              const limite = t.vendas_ate ? `R$ ${t.vendas_ate.toLocaleString("pt-BR")}` : "acima";
              const de = `R$ ${anterior.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              return (
                <li key={t.id}>
                  {EMOJI[t.label] ?? "⭐"} <strong>{t.label}</strong>: {i === 0 ? `Até ${limite}` : `De ${de} até ${limite}`} → <strong style={{ color: "#00C9A7" }}>{t.percentual}%</strong>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
