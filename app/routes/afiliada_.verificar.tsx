import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, redirect } from "react-router";
import { verificarCodigoAction, getPendingEmail } from "../lib/afiliada.auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const emailMascarado = await getPendingEmail(request);
  if (!emailMascarado) throw redirect("/afiliada/login");
  return { emailMascarado };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return verificarCodigoAction(request);
};

export default function AfiliadaVerificar() {
  const { emailMascarado } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const verificando = nav.state === "submitting";

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: "20px", padding: "48px 40px", width: "100%", maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontWeight: "800", fontSize: "18px", letterSpacing: "3px", marginBottom: "16px", color: "#111" }}>BIGFIVE</div>
          <div style={{ width: "56px", height: "56px", background: "#f0fdf9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "24px" }}>
            ✉️
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: "700", color: "#111" }}>Verifique seu e-mail</h1>
          <p style={{ margin: 0, color: "#888", fontSize: "14px", lineHeight: "1.5" }}>
            Enviamos um código de 6 dígitos para<br />
            <strong style={{ color: "#444" }}>{emailMascarado}</strong>
          </p>
        </div>

        <Form method="post">
          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "8px", color: "#444", textAlign: "center" }}>
              Código de verificação
            </label>
            <input
              name="codigo"
              required
              maxLength={6}
              minLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              style={{ width: "100%", padding: "16px", border: "1.5px solid #ddd", borderRadius: "10px", fontSize: "28px", boxSizing: "border-box", textAlign: "center", letterSpacing: "8px", fontWeight: "700", outline: "none" }}
            />
          </div>

          {data?.erro && (
            <p style={{ color: "#e53e3e", fontSize: "13px", margin: "-8px 0 16px", textAlign: "center" }}>{data.erro}</p>
          )}

          <button
            type="submit"
            disabled={verificando}
            style={{ width: "100%", padding: "14px", background: verificando ? "#888" : "#00C9A7", color: "#fff", border: "none", borderRadius: "10px", fontWeight: "800", fontSize: "15px", cursor: verificando ? "not-allowed" : "pointer" }}
          >
            {verificando ? "Verificando..." : "Entrar"}
          </button>
        </Form>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#999" }}>
          Não recebeu?{" "}
          <a href="/afiliada/login" style={{ color: "#00C9A7", fontWeight: "600", textDecoration: "none" }}>
            Tentar novamente
          </a>
        </p>
      </div>
    </div>
  );
}
