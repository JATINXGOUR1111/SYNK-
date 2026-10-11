"""add password_reset_codes table

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "password_reset_codes" not in inspector.get_table_names():
        op.create_table(
            "password_reset_codes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("code", sa.String(length=32), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id")
        )
        op.create_index(op.f("ix_password_reset_codes_email"), "password_reset_codes", ["email"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "password_reset_codes" in inspector.get_table_names():
        op.drop_index(op.f("ix_password_reset_codes_email"), table_name="password_reset_codes")
        op.drop_table("password_reset_codes")
