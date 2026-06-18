-- Tiers de comissão (configurável pelo admin)
CREATE TABLE tiers_comissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendas_ate numeric NOT NULL,        -- limite superior em R$ (null = sem limite)
  percentual numeric NOT NULL,        -- ex: 5, 8, 10
  criado_em timestamptz DEFAULT now()
);

-- Afiliadas
CREATE TABLE afiliadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text UNIQUE NOT NULL,
  cupom text UNIQUE NOT NULL,
  pix text,                           -- chave pix para pagamento
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now()
);

-- Pedidos capturados via webhook do Shopify
CREATE TABLE pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id text UNIQUE NOT NULL,
  afiliada_id uuid REFERENCES afiliadas(id),
  valor_total numeric NOT NULL,
  comissao numeric NOT NULL,
  mes_referencia text NOT NULL,       -- ex: "2026-06"
  criado_em timestamptz DEFAULT now()
);

-- Pagamentos realizados
CREATE TABLE pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  afiliada_id uuid REFERENCES afiliadas(id),
  valor numeric NOT NULL,
  mes_referencia text NOT NULL,       -- ex: "2026-06"
  pago_em timestamptz DEFAULT now(),
  observacao text
);

-- Dados iniciais: tiers de comissão padrão
INSERT INTO tiers_comissao (vendas_ate, percentual) VALUES
  (500, 5),
  (1500, 8),
  (NULL, 10);
