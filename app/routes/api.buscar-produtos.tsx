import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { buscarProdutos } from "../lib/shopify-admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return { produtos: [], erro: null };
  try {
    const produtos = await buscarProdutos(q.trim());
    return { produtos, erro: null };
  } catch (e: any) {
    return { produtos: [], erro: e?.message ?? "Erro desconhecido na busca de produtos." };
  }
};
