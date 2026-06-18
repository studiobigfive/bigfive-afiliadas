import type { ActionFunctionArgs } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { iniciarLoginAction } from "../lib/afiliada.auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return iniciarLoginAction(request);
};

export default function AfiliadaLogin() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const enviando = nav.state === "submitting";

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: "20px", padding: "48px 40px", width: "100%", maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontWeight: "800", fontSize: "18px", letterSpacing: "3px", marginBottom: "16px", color: "#111" }}>BIGFIVE</div>
          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "700", color: "#111" }}>Portal da afiliada</h1>
          <p style={{ margin: 0, color: "#888", fontSize: "14px" }}>Vamos enviar um código para o seu e-mail</p>
        </div>

        <Form method="post">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#444" }}>
              Seu cupom
            </label>
            <input
              name="cupom"
              required
              placeholder="Ex: MARIA15"
              autoComplete="off"
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #ddd", borderRadius: "10px", fontSize: "15px", boxSizing: "border-box", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "700", textAlign: "center", outline: "none" }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px", color: "#444" }}>
              Seu e-mail
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="seu@email.com"
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
            {enviando ? "Enviando código..." : "Enviar código"}
          </button>
        </Form>
      </div>
    </div>
  );
}
