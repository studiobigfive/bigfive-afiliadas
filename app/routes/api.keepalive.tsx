import type { LoaderFunctionArgs } from "react-router";
import { supabase } from "../lib/supabase.server";

// Chamado pelo cron do Vercel a cada poucos dias só pra manter o Supabase ativo
// (o plano free pausa o banco depois de 7 dias sem nenhuma atividade).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const { error } = await supabase.from("tiers_comissao").select("id").limit(1);
  if (error) {
    console.error("[keepalive] erro ao pingar banco:", error.message);
    return new Response("erro", { status: 500 });
  }
  return new Response("ok", { status: 200 });
};
