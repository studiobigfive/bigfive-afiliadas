import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarCodigoOTP(email: string, nome: string, codigo: string) {
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: email,
    subject: `${codigo} é seu código BigFive Afiliadas`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#fff;">
        <div style="font-weight:800;font-size:18px;letter-spacing:3px;margin-bottom:32px;color:#111;">BIGFIVE</div>
        <p style="font-size:15px;color:#333;margin:0 0 8px;">Olá, <strong>${nome}</strong>!</p>
        <p style="font-size:14px;color:#666;margin:0 0 28px;">Use o código abaixo para acessar o portal de afiliadas:</p>
        <div style="background:#111;color:#00C9A7;font-size:38px;font-weight:800;letter-spacing:10px;text-align:center;padding:28px;border-radius:12px;margin-bottom:24px;">
          ${codigo}
        </div>
        <p style="font-size:13px;color:#999;text-align:center;margin:0;">Válido por <strong>10 minutos</strong>. Não compartilhe este código.</p>
      </div>
    `,
  });

  if (error) throw new Error(`Erro ao enviar email: ${error.message}`);
}
