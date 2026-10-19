import sqlite3
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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
        return jsonify({
            "error": "Preencha todos os campos."
        }), 400

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

    try:
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (name, email, password_hash)
            )

        return jsonify({
            "message": "Conta criada com sucesso!"
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({
            "error": "Este e-mail já está cadastrado."
        }), 409
    

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Os dados enviados são inválidos."}), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({"error": "Preencha o e-mail e a senha."}), 400

    with get_connection() as connection:
        user = connection.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,)
        ).fetchone()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "E-mail ou senha incorretos."}), 401

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
