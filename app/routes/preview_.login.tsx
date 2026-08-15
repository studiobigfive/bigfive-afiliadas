import type { ActionFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { criarSessaoAfiliadaPreview } from "../lib/afiliada.auth.server";
import { criarSessaoDesignerPreview } from "../lib/designer.auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const senha = form.get("senha") as string;

  if (senha !== process.env.DASHBOARD_PASSWORD) return { erro: "Senha incorreta" };

  const [cookieAfiliada, cookieDesigner] = await Promise.all([
    criarSessaoAfiliadaPreview(),
    criarSessaoDesignerPreview(),
  ]);

  throw redirect("/parcerias", {
    headers: [
      ["Set-Cookie", cookieAfiliada],
      ["Set-Cookie", cookieDesigner],
    ],
  });
};

export default function PreviewLogin() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const enviando = nav.state === "submitting";

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: "20px", padding: "48px 40px", width: "100%", maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontWeight: "800", fontSize: "18px", letterSpacing: "3px", marginBottom: "16px", color: "#111" }}>BIGFIVE</div>
          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "700", color: "#111" }}>Minha visualização</h1>
          <p style={{ margin: 0, color: "#888", fontSize: "14px" }}>Sua conta de teste — a mesma senha do painel</p>
        </div>

        <Form method="post">
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#444" }}>
              Senha
            </label>
            <input
              name="senha"
              type="password"
              required
              autoFocus
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #ddd", borderRadius: "10px", fontSize: "15px", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          {data?.erro && (
            <p style={{ color: "#e53e3e", fontSize: "13px", margin: "-8px 0 16px", textAlign: "center" }}>{data.erro}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            style={{ width: "100%", padding: "14px", background: enviando ? "#888" : "#00C9A7", color: "#fff", border: "none", borderRadius: "10px", fontWeight: "800", fontSize: "15px", cursor: enviando ? "not-allowed" : "pointer" }}
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </Form>
      </div>
    </div>
  );
}
