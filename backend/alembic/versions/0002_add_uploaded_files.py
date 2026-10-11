"""add uploaded_files table

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "uploaded_files" not in inspector.get_table_names():
        op.create_table(
            "uploaded_files",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("content_type", sa.String(length=100), nullable=False),
            sa.Column("data", sa.LargeBinary(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id")
        )
        op.create_index(op.f("ix_uploaded_files_name"), "uploaded_files", ["name"], unique=True)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "uploaded_files" in inspector.get_table_names():
        op.drop_index(op.f("ix_uploaded_files_name"), table_name="uploaded_files")
        op.drop_table("uploaded_files")
