import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "../lib/painel.auth.server";
import { buscarProdutos } from "../lib/shopify-admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return { produtos: [] };
  try {
    const produtos = await buscarProdutos(q.trim());
    return { produtos };
  } catch {
    return { produtos: [] };
  }
};
