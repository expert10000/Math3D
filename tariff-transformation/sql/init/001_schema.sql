CREATE TABLE IF NOT EXISTS reference_country (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariff_rule (
  id BIGSERIAL PRIMARY KEY,
  commodity_code TEXT NOT NULL,
  origin_country CHAR(2) NOT NULL REFERENCES reference_country(code),
  duty_rate NUMERIC(8, 4) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_file_audit (
  id BIGSERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected')),
  message TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
