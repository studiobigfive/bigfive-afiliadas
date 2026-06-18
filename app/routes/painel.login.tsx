import type { ActionFunctionArgs } from "react-router";
import { Form, useActionData } from "react-router";
import { loginAction } from "../lib/painel.auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return loginAction(request);
};

export default function PainelLogin() {
  const data = useActionData<typeof action>();

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "48px", width: "100%", maxWidth: "380px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: "800", letterSpacing: "2px" }}>BIGFIVE</h1>
        <p style={{ margin: "0 0 32px", color: "#888", fontSize: "14px" }}>Painel de Afiliadas</p>
        <Form method="post">
          <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "8px", color: "#444" }}>Senha</label>
          <input
            type="password"
            name="password"
            autoFocus
            style={{ width: "100%", padding: "12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "16px", boxSizing: "border-box", outline: "none" }}
          />
          {data?.erro && (
            <p style={{ margin: "8px 0 0", color: "#e53e3e", fontSize: "13px" }}>{data.erro}</p>
          )}
          <button
            type="submit"
            style={{ width: "100%", marginTop: "16px", padding: "14px", background: "#111", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "15px", cursor: "pointer", letterSpacing: "0.5px" }}
          >
            Entrar
          </button>
        </Form>
      </div>
    </div>
  );
}
