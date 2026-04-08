INSERT INTO reference_country (code, name) VALUES
  ('PL', 'Poland'),
  ('DE', 'Germany'),
  ('CN', 'China'),
  ('US', 'United States')
ON CONFLICT (code) DO NOTHING;
