import os
import sqlite3
import hashlib
import secrets


from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from servico_email import enviar_email
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash


app = Flask(__name__)
CORS(app)

DATABASE = Path(__file__).resolve().parent / "encounter_hub.db"


def get_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection



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



@app.route("/")
def home():
    return jsonify({
        "message": "Encounter Hub API funcionando :D !"
    })



@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    name = data.get("name", "")
    email = data.get("email", "")
    password = data.get("password", "")

    if not all(isinstance(value, str) for value in (name, email, password)):
        return jsonify({"error": "Os dados enviados são inválidos."}), 400

    name = name.strip()
    email = email.strip().lower()

    if not name or not email or not password:
        return jsonify({"error": "Preencha todos os campos."}), 400

    if len(name) > 20:
        return jsonify({"error": "O nome deve ter até 20 caracteres."}), 400

    if len(email) > 254 or "@" not in email:
        return jsonify({"error": "Informe um e-mail válido."}), 400

    if len(password) < 8:
        return jsonify({
            "error": "A senha deve ter pelo menos 8 caracteres."
        }), 400

    if len(password) > 1024:
        return jsonify({"error": "A senha é muito longa."}), 400

    password_hash = generate_password_hash(password)

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=24)
    ).isoformat()

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    email_verified,
                    verification_token_hash,
                    verification_expires_at
                )
                VALUES (?, ?, ?, 0, ?, ?)
                """,
                (name, email, password_hash, token_hash, expires_at)
            )
            user_id = cursor.lastrowid

    except sqlite3.IntegrityError:
        return jsonify({
            "error": "Este e-mail já está cadastrado."
        }), 409

    verification_url = (
    f"http://localhost:5000/api/verify-email?"
    f"{urlencode({'token': token})}"
)

    conteudo = (
        f"Olá, {name}!\n\n"
        "Obrigado por se cadastrar no Encounter Hub.\n"
        "Para confirmar seu endereço de e-mail, acesse:\n\n"
        f"{verification_url}\n\n"
        "Este link expira em 24 horas.\n"
        "Se você não criou esta conta, ignore esta mensagem."
    )

    try:
        enviado = enviar_email(
            email,
            "Confirme seu e-mail - Encounter Hub",
            conteudo
        )
    except (ValueError, OSError):
        enviado = False

    if not enviado:
        with get_connection() as connection:
            connection.execute(
                """
                DELETE FROM users
                WHERE id = ? AND email_verified = 0
                """,
                (user_id,)
            )

        return jsonify({
            "error": (
                "Não foi possível enviar o e-mail de confirmação. "
                "Tente novamente mais tarde."
            )
        }), 503

    return jsonify({
        "message": (
            "Cadastro realizado! Verifique seu e-mail "
            "para ativar sua conta."
        )
    }), 201


@app.route("/api/verify-email", methods=["GET"])
def verify_email():
    token = request.args.get("token", "").strip()

    if not token:
        return jsonify({
            "error": "Token de confirmação não informado."
        }), 400

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    with get_connection() as connection:
        user = connection.execute(
            """
            SELECT id, email_verified, verification_expires_at
            FROM users
            WHERE verification_token_hash = ?
            """,
            (token_hash,)
        ).fetchone()

        if user is None:
            return jsonify({
                "error": "Link de confirmação inválido ou já utilizado."
            }), 400

        if user["email_verified"]:
            return jsonify({
                "message": "Este e-mail já foi confirmado."
            }), 200

        expires_at = datetime.fromisoformat(
            user["verification_expires_at"]
        )

        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if datetime.now(timezone.utc) >= expires_at:
            return jsonify({
                "error": "Este link expirou. Solicite um novo."
            }), 400

        connection.execute(
            """
            UPDATE users
            SET email_verified = 1,
                verification_token_hash = NULL,
                verification_expires_at = NULL
            WHERE id = ?
            """,
            (user["id"],)
        )

    return jsonify({
        "message": "E-mail confirmado com sucesso! Sua conta está ativada."
    }), 200



@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Envie os dados em formato JSON."
        }), 400

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({
            "error": "Os dados enviados são inválidos."
        }), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({
            "error": "Preencha o e-mail e a senha."
        }), 400

    with get_connection() as connection:
        user = connection.execute(
            """
            SELECT id, name, email, password_hash, email_verified
            FROM users
            WHERE email = ?
            """,
            (email,)
        ).fetchone()

    if user is None or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify({
            "error": "E-mail ou senha incorretos."
        }), 401

    if not user["email_verified"]:
        return jsonify({
            "error": "Confirme seu e-mail antes de entrar."
        }), 403

    return jsonify({
        "message": "Login realizado com sucesso!",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200



init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
