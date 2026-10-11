"""initial schema: all tables, pgvector extension and HNSW indexes

Revision ID: 0001
Revises:
"""
from alembic import op
from app.db import Base
from app import models  # noqa: F401

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

VECTOR_TABLES = ("posts", "briefs", "creator_profiles")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    # 0001 snapshots the schema defined by the models at release 1.0; later changes get their own revisions.
    Base.metadata.create_all(bind)
    if bind.dialect.name == "postgresql":
        for t in VECTOR_TABLES:
            op.execute(f"CREATE INDEX IF NOT EXISTS ix_{t}_embedding_hnsw ON {t} USING hnsw (embedding vector_cosine_ops)")


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
