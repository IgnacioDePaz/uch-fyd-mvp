CREATE TABLE IF NOT EXISTS articles (
    code VARCHAR(64) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO articles (code, name, stock, unit_price) VALUES
    ('ART-001', 'Cuaderno universitario', 30, 2500.00),
    ('ART-002', 'Lápiz grafito HB', 100, 500.00),
    ('ART-003', 'Bolígrafo azul', 80, 800.00),
    ('ART-004', 'Bolígrafo negro', 75, 800.00),
    ('ART-005', 'Goma de borrar', 60, 600.00),
    ('ART-006', 'Sacapuntas', 40, 700.00),
    ('ART-007', 'Regla de 30 cm', 35, 1200.00),
    ('ART-008', 'Marcador fluorescente amarillo', 45, 1000.00),
    ('ART-009', 'Set de lápices de colores', 20, 3500.00),
    ('ART-010', 'Block de dibujo', 25, 2800.00),
    ('ART-011', 'Carpeta tamaño carta', 30, 1800.00),
    ('ART-012', 'Archivador universitario', 15, 4500.00),
    ('ART-013', 'Notas adhesivas', 50, 1500.00),
    ('ART-014', 'Tijera escolar', 20, 2200.00),
    ('ART-015', 'Pegamento en barra', 30, 1300.00),
    ('ART-016', 'Corrector líquido', 25, 1100.00),
    ('ART-017', 'Calculadora básica', 12, 7500.00),
    ('ART-018', 'Mochila urbana', 8, 24900.00),
    ('ART-019', 'Estuche escolar', 18, 5500.00),
    ('ART-020', 'Papel para impresión (resma)', 10, 6200.00)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    stock = EXCLUDED.stock,
    unit_price = EXCLUDED.unit_price;

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
