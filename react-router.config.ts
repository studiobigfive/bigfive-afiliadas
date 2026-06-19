import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // SSR ligado (o app depende de loaders/actions no servidor)
  ssr: true,
  // Preset da Vercel: gera o Build Output API (.vercel/output) no deploy.
  // Em build local/Node continua funcionando normalmente.
  presets: [vercelPreset()],
} satisfies Config;
