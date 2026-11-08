CREATE TABLE IF NOT EXISTS articles (
    code VARCHAR(64) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    order_number BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id VARCHAR(128) NOT NULL,
    customer_name VARCHAR(160) NOT NULL,
    article_code VARCHAR(64) NOT NULL REFERENCES articles(code),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_order_date_idx ON orders (order_date DESC);
