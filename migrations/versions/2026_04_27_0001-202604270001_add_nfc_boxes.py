"""Add NFC boxes.

Revision ID: 202604270001
Revises: 415a8f855e14
Create Date: 2026-04-27 00:01:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "202604270001"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "nfc_box",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("token", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=True),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["spool_id"], ["spool.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("spool_id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_nfc_box_id"), "nfc_box", ["id"], unique=False)
    op.create_index(op.f("ix_nfc_box_token"), "nfc_box", ["token"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_nfc_box_token"), table_name="nfc_box")
    op.drop_index(op.f("ix_nfc_box_id"), table_name="nfc_box")
    op.drop_table("nfc_box")
