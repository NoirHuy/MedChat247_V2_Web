// Neo4j Index Creation Script for Performance Optimization
// Run these commands in Neo4j Browser or via cypher-shell

// ─── Symptom Indexes ───────────────────────────────────────────────────────
// Index on Symptom.id for fast symptom lookups during extraction
CREATE INDEX symptom_id_idx IF NOT EXISTS FOR (s:Symptom) ON (s.id);

// Index on Symptom.name for text-based matching
CREATE INDEX symptom_name_idx IF NOT EXISTS FOR (s:Symptom) ON (s.name);

// Index on Symptom.cui for UMLS matching
CREATE INDEX symptom_cui_idx IF NOT EXISTS FOR (s:Symptom) ON (s.cui);

// ─── Disease Indexes ───────────────────────────────────────────────────────
// Index on Disease.name for fast disease lookups during ranking
CREATE INDEX disease_name_idx IF NOT EXISTS FOR (d:Disease) ON (d.name);

// Index on Disease.prevalence_per_100k for filtering common diseases
CREATE INDEX disease_prevalence_idx IF NOT EXISTS FOR (d:Disease) ON (d.prevalence_per_100k);

// ─── AgeGroup and Sex Indexes ──────────────────────────────────────────────
// Index on AgeGroup.name for demographic filtering
CREATE INDEX age_group_name_idx IF NOT EXISTS FOR (a:AgeGroup) ON (a.name);

// Index on Sex.name for demographic filtering
CREATE INDEX sex_name_idx IF NOT EXISTS FOR (g:Sex) ON (g.name);

// ─── Verify Indexes ────────────────────────────────────────────────────────
// Run this to verify all indexes are created
SHOW INDEXES;
