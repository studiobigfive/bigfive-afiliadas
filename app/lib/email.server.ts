import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function wrapHtml(body: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body style="margin:0;padding:0;background:#f5f5f5;">${body}</body></html>`;
}

export async function enviarCodigoOTP(email: string, nome: string, codigo: string) {
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: email,
    subject: `${codigo} é seu código BigFive Afiliadas`,
    html: wrapHtml(`
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:40px auto;padding:40px 24px;background:#fff;border-radius:16px;">
        <div style="font-weight:800;font-size:18px;letter-spacing:3px;margin-bottom:32px;color:#111;">BIGFIVE</div>
        <p style="font-size:15px;color:#333;margin:0 0 8px;">Olá, <strong>${nome}</strong>!</p>
        <p style="font-size:14px;color:#666;margin:0 0 28px;">Use o código abaixo para acessar o Programa de Afiliados:</p>
        <div style="background:#111;color:#00C9A7;font-size:38px;font-weight:800;letter-spacing:10px;text-align:center;padding:28px;border-radius:12px;margin-bottom:24px;">
          ${codigo}
        </div>
        <p style="font-size:13px;color:#999;text-align:center;margin:0;">Válido por <strong>10 minutos</strong>. Não compartilhe este código.</p>
      </div>
    `),
  });

  if (error) throw new Error(`Erro ao enviar email: ${error.message}`);
}

export async function enviarNotificacaoPedido(
  email: string,
  nome: string,
  valorVenda: number,
  comissao: number,
  mes: string,
  portalUrl: string
) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const [ano, num] = mes.split("-");
  const mesLabel = new Date(Number(ano), Number(num) - 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: email,
    subject: `Nova venda com seu cupom! Você ganhou ${fmt(comissao)}`,
    html: wrapHtml(`
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:40px auto;padding:40px 24px;background:#fff;border-radius:16px;">
        <div style="font-weight:800;font-size:18px;letter-spacing:3px;margin-bottom:32px;color:#111;">BIGFIVE</div>
        <p style="font-size:15px;color:#333;margin:0 0 8px;">🎉 Boa notícia, <strong>${nome}</strong>!</p>
        <p style="font-size:14px;color:#666;margin:0 0 28px;">Alguém usou seu cupom e você acabou de ganhar uma comissão:</p>

        <div style="background:#f0fdf9;border:1px solid #a7f3d0;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Comissão gerada</p>
          <p style="margin:0;font-size:40px;font-weight:800;color:#00C9A7;">${fmt(comissao)}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#888;">sobre uma venda de ${fmt(valorVenda)}</p>
        </div>

        <p style="font-size:13px;color:#888;text-align:center;margin:0 0 24px;">
          Mês de referência: <strong style="color:#444;text-transform:capitalize;">${mesLabel}</strong>
        </p>

        <a href="${portalUrl}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:700;font-size:15px;">
          Ver meu painel →
        </a>

        <p style="font-size:12px;color:#bbb;text-align:center;margin:24px 0 0;">
          Você está recebendo este e-mail porque participa do Programa de Afiliados BigFive Hype.
        </p>
      </div>
    `),
  });

  if (error) {
    console.error("[email] Falha ao enviar notificação de pedido:", error.message);
  }
}
