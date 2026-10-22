import sqlite3

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "encounter_hub.db"


def get_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def get_member_role(connection, campaign_id, user_id):
    #Retorna "gm", "player" ou None quando o usuário não é membro.
    row = connection.execute(
        """
        SELECT role FROM campaign_members
        WHERE campaign_id = ? AND user_id = ?
        """,
        (campaign_id, user_id)
    ).fetchone()

    return row["role"] if row else None


def add_missing_columns(connection, table, columns):
    #Adiciona colunas novas em bancos criados por versões anteriores.
    existing = {
        row["name"]
        for row in connection.execute(
            f"PRAGMA table_info({table})"
        ).fetchall()
    }

    for name, definition in columns.items():
        if name not in existing:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {name} {definition}"
            )


def init_db():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                email_verified INTEGER NOT NULL DEFAULT 0,
                verification_token_hash TEXT,
                verification_expires_at TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        #Adiciona os campos caso a tabela já exista.
        columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(users)"
            ).fetchall()
        }

        if "email_verified" not in columns:
            connection.execute("""
                ALTER TABLE users
                ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0
            """)

        if "verification_token_hash" not in columns:
            connection.execute("""
                ALTER TABLE users
                ADD COLUMN verification_token_hash TEXT
            """)

        if "verification_expires_at" not in columns:
            connection.execute("""
                ALTER TABLE users
                ADD COLUMN verification_expires_at TEXT
            """)

        # Tokens de acesso gerados no login.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS auth_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # A campanha é a mesa permanente (como um "jogo" do Roll20):
        # os membros podem entrar no mapa a qualquer momento.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                invite_code TEXT NOT NULL UNIQUE,
                active_map_id INTEGER
                    REFERENCES maps(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # role: "gm" (mestre) ou "player" (jogador).
        connection.execute("""
            CREATE TABLE IF NOT EXISTS campaign_members (
                campaign_id INTEGER NOT NULL
                    REFERENCES campaigns(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL DEFAULT 'player',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (campaign_id, user_id)
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS maps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL
                    REFERENCES campaigns(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                filename TEXT NOT NULL,
                grid_size INTEGER NOT NULL DEFAULT 50,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Posição e tamanho da imagem na mesa, em pixels.
        # width/height nulos = tamanho original da imagem.
        # grid_columns/grid_rows: tamanho da grade em quadrados;
        # nulos = a grade acompanha o tamanho da imagem.
        add_missing_columns(connection, "maps", {
            "x": "INTEGER NOT NULL DEFAULT 0",
            "y": "INTEGER NOT NULL DEFAULT 0",
            "width": "INTEGER",
            "height": "INTEGER",
            "grid_columns": "INTEGER",
            "grid_rows": "INTEGER",
        })

        # Sessões agendadas da campanha.
        # mode: "online" ou "presencial".
        # status: "agendada", "concluida" ou "cancelada".
        connection.execute("""
            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL
                    REFERENCES campaigns(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                scheduled_at TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'online',
                location TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'agendada',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # status: "confirmado", "talvez" ou "recusado".
        connection.execute("""
            CREATE TABLE IF NOT EXISTS session_attendance (
                session_id INTEGER NOT NULL
                    REFERENCES game_sessions(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (session_id, user_id)
            )
        """)

        # Peças posicionadas no mapa da mesa (coordenadas em células).
        connection.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL
                    REFERENCES campaigns(id) ON DELETE CASCADE,
                owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#ffb82e',
                x INTEGER NOT NULL DEFAULT 0,
                y INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # size: quantas células o token ocupa de lado (1 = 1x1).
        add_missing_columns(connection, "tokens", {
            "size": "INTEGER NOT NULL DEFAULT 1",
            "image_filename": "TEXT",
        })

        # kind: "message" (chat) ou "roll" (rolagem de dados).
        connection.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL
                    REFERENCES campaigns(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                kind TEXT NOT NULL DEFAULT 'message',
                content TEXT NOT NULL,
                roll_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
