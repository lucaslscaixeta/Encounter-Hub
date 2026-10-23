import os

from pathlib import Path
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


BASE_DIR = Path(__file__).resolve().parent
SCHEMA_FILE = BASE_DIR / "schema.sql"

load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

_pool = None


def get_pool():
    #Cria o pool na primeira conexão, para o import não exigir o .env.
    global _pool

    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError(
                "Configure DATABASE_URL no backend/.env com a connection "
                "string do Supabase."
            )

        # prepare_threshold=None: o pooler do Supabase não aceita
        # prepared statements no modo transaction.
        _pool = ConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
            open=True,
        )

    return _pool


def get_connection():
    #Use com "with": confirma a transação ao sair e devolve a conexão ao pool.
    return get_pool().connection()


def get_member_role(connection, campaign_id, user_id):
    #Retorna "gm", "player" ou None quando o usuário não é membro.
    row = connection.execute(
        """
        SELECT role FROM campaign_members
        WHERE campaign_id = %s AND user_id = %s
        """,
        (campaign_id, user_id)
    ).fetchone()

    return row["role"] if row else None


def init_db():
    with get_connection() as connection:
        connection.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
