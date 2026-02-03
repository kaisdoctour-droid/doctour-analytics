-- =====================================================
-- DOCTOUR Analytics - Script SQL Complet Supabase
-- Version: 9.0.0 - Avec LAST_ACTIVITY_TIME
-- =====================================================

-- Table: leads
DROP TABLE IF EXISTS leads CASCADE;
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  title TEXT,
  name TEXT,
  status_id TEXT,
  source_id TEXT,
  assigned_by_id TEXT,
  date_create TIMESTAMPTZ,
  date_modify TIMESTAMPTZ,
  date_closed TIMESTAMPTZ,
  opportunity DECIMAL,
  currency_id TEXT,
  phone TEXT,
  email TEXT,
  last_activity_time TIMESTAMPTZ,  -- NOUVEAU: Date du dernier contact réel
  last_activity_by TEXT,            -- NOUVEAU: ID de qui a fait le dernier contact
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_assigned ON leads(assigned_by_id);
CREATE INDEX idx_leads_status ON leads(status_id);
CREATE INDEX idx_leads_date_create ON leads(date_create);
CREATE INDEX idx_leads_date_modify ON leads(date_modify);
CREATE INDEX idx_leads_last_activity ON leads(last_activity_time);

-- Table: deals
DROP TABLE IF EXISTS deals CASCADE;
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  title TEXT,
  stage_id TEXT,
  assigned_by_id TEXT,
  date_create TIMESTAMPTZ,
  date_modify TIMESTAMPTZ,
  closedate TIMESTAMPTZ,
  opportunity DECIMAL,
  currency_id TEXT,
  lead_id TEXT,
  last_activity_time TIMESTAMPTZ,  -- NOUVEAU: Date du dernier contact réel
  last_activity_by TEXT,            -- NOUVEAU: ID de qui a fait le dernier contact
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_assigned ON deals(assigned_by_id);
CREATE INDEX idx_deals_stage ON deals(stage_id);
CREATE INDEX idx_deals_date_create ON deals(date_create);
CREATE INDEX idx_deals_date_modify ON deals(date_modify);
CREATE INDEX idx_deals_lead ON deals(lead_id);
CREATE INDEX idx_deals_last_activity ON deals(last_activity_time);

-- Table: activities
DROP TABLE IF EXISTS activities CASCADE;
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  owner_type_id TEXT,
  owner_id TEXT,
  type_id TEXT,
  subject TEXT,
  completed TEXT,  -- 'true' ou 'false' (stocké en texte)
  responsible_id TEXT,
  created TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  direction TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_owner ON activities(owner_type_id, owner_id);
CREATE INDEX idx_activities_responsible ON activities(responsible_id);
CREATE INDEX idx_activities_created ON activities(created);
CREATE INDEX idx_activities_deadline ON activities(deadline);
CREATE INDEX idx_activities_completed ON activities(completed);

-- Table: users
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  last_name TEXT,
  email TEXT,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: sources
DROP TABLE IF EXISTS sources CASCADE;
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: quotes
DROP TABLE IF EXISTS quotes CASCADE;
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  title TEXT,
  status_id TEXT,
  assigned_by_id TEXT,
  date_create TIMESTAMPTZ,
  date_modify TIMESTAMPTZ,
  closedate TIMESTAMPTZ,
  opportunity DECIMAL,
  deal_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_assigned ON quotes(assigned_by_id);
CREATE INDEX idx_quotes_deal ON quotes(deal_id);

-- =====================================================
-- Vérification
-- =====================================================
SELECT 'Tables créées avec succès!' as status;

SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('leads', 'deals') 
  AND column_name LIKE 'last_activity%'
ORDER BY table_name, column_name;
