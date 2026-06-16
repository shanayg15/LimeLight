-- Runs once on first boot of the Postgres container (docker-entrypoint-initdb.d).
-- pgvector ships in the pgvector/pgvector image; enable the extension so that
-- vector columns added in later milestones (embeddings for RAG / gap analysis) work.
CREATE EXTENSION IF NOT EXISTS vector;
