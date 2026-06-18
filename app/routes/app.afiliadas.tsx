import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { supabase } from "../lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const { data: afiliadas } = await supabase
    .from("afiliadas")
    .select("*")
    .order("nome");
  return { afiliadas: afiliadas ?? [] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "criar") {
    const { error } = await supabase.from("afiliadas").insert({
      nome: form.get("nome"),
      email: form.get("email"),
      cupom: (form.get("cupom") as string)?.toUpperCase(),
      pix: form.get("pix"),
    });
    if (error) return { erro: error.message };
    return { sucesso: true };
  }

  if (intent === "toggle") {
    const id = form.get("id");
    const ativo = form.get("ativo") === "true";
    await supabase.from("afiliadas").update({ ativo: !ativo }).eq("id", id);
    return { sucesso: true };
  }

  return null;
};

export default function Afiliadas() {
  const { afiliadas } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const criando = fetcher.state !== "idle";

  return (
    <s-page heading="Afiliadas">
      <s-layout>
        {/* Formulário de nova afiliada */}
        <s-layout-section variant="oneThird">
          <s-card>
            <s-box padding="400">
              <s-text variant="headingMd" as="h2">Nova afiliada</s-text>
            </s-box>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="criar" />
              <s-form-layout>
                <s-text-field label="Nome" name="nome" required autoComplete="off" />
                <s-text-field label="E-mail" name="email" type="email" required autoComplete="off" />
                <s-text-field label="Cupom" name="cupom" required autoComplete="off"
                  helpText="Será automaticamente em maiúsculas" />
                <s-text-field label="Chave PIX" name="pix" autoComplete="off"
                  helpText="CPF, e-mail ou telefone para pagamento" />
                <s-button submit variant="primary" loading={criando}>
                  Cadastrar
                </s-button>
              </s-form-layout>
            </fetcher.Form>
          </s-card>
        </s-layout-section>

        {/* Lista de afiliadas */}
        <s-layout-section>
          <s-card>
            <s-resource-list
              resource-name='{"singular":"afiliada","plural":"afiliadas"}'
              items={JSON.stringify(afiliadas)}
              render-item="true"
            >
              {afiliadas.map((a) => (
                <s-resource-item key={a.id} id={a.id} url={`/app/afiliadas/${a.id}`}>
                  <s-box>
                    <s-inline-stack align="space-between">
                      <s-block-stack gap="100">
                        <s-text variant="bodyMd" fontWeight="bold">{a.nome}</s-text>
                        <s-text tone="subdued">{a.email}</s-text>
                        <s-badge>{a.cupom}</s-badge>
                      </s-block-stack>
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="ativo" value={String(a.ativo)} />
                        <s-button submit tone={a.ativo ? "critical" : undefined} variant="plain">
                          {a.ativo ? "Desativar" : "Ativar"}
                        </s-button>
                      </fetcher.Form>
                    </s-inline-stack>
                  </s-box>
                </s-resource-item>
              ))}
            </s-resource-list>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
