-- =====================================================
-- DOCTOUR Analytics - Migration SQL
-- Ajouter last_activity_time aux tables existantes
-- =====================================================

-- Pour les leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_time TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_by TEXT;

-- Pour les deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_activity_time TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_activity_by TEXT;

-- Créer des index
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_time);
CREATE INDEX IF NOT EXISTS idx_deals_last_activity ON deals(last_activity_time);

-- Vérification
SELECT 'Migration terminée!' as status;

SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('leads', 'deals') 
  AND column_name LIKE 'last_activity%'
ORDER BY table_name, column_name;
