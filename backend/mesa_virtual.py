import json
import re
import threading

from flask import Blueprint, g, jsonify, request
from flask_socketio import ConnectionRefusedError, join_room, leave_room
from autenticacao import get_user_by_token, login_required
from banco import get_connection, get_member_role
from dados import roll_expression
from extensoes import campaign_room, socketio
from mapas import get_active_map, serialize_map


table_bp = Blueprint("table", __name__)

COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_GRID_POSITION = 500
MAX_MESSAGE_LENGTH = 1000
MESSAGE_HISTORY = 100

# Usuários conectados por socket e quem está em cada mesa agora.
connected_users = {}
presence = {}
presence_lock = threading.Lock()


def serialize_token(row):
    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "owner_id": row["owner_id"],
        "name": row["name"],
        "color": row["color"],
        "x": row["x"],
        "y": row["y"]
    }


def serialize_message(row):
    return {
        "id": row["id"],
        "kind": row["kind"],
        "content": row["content"],
        "roll": json.loads(row["roll_data"]) if row["roll_data"] else None,
        "user": {"id": row["user_id"], "name": row["user_name"]},
        # O SQLite grava CURRENT_TIMESTAMP em UTC.
        "created_at": row["created_at"].replace(" ", "T") + "Z"
    }


def read_position(value):
    if isinstance(value, bool) or not isinstance(value, int):
        return None

    return value if 0 <= value < MAX_GRID_POSITION else None


def save_message(connection, campaign_id, user_id, kind, content, roll=None):
    cursor = connection.execute(
        """
        INSERT INTO messages (campaign_id, user_id, kind, content, roll_data)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            campaign_id,
            user_id,
            kind,
            content,
            json.dumps(roll) if roll else None
        )
    )

    row = connection.execute(
        """
        SELECT messages.*, users.name AS user_name
        FROM messages
        LEFT JOIN users ON users.id = messages.user_id
        WHERE messages.id = ?
        """,
        (cursor.lastrowid,)
    ).fetchone()

    return serialize_message(row)


def online_users(campaign_id):
    #Lista sem repetição (o mesmo usuário pode abrir várias abas).
    with presence_lock:
        users = {
            user["id"]: user
            for user in presence.get(campaign_id, {}).values()
        }

    return sorted(users.values(), key=lambda user: user["name"])


def broadcast_presence(campaign_id):
    socketio.emit(
        "mesa:presenca",
        {"users": online_users(campaign_id)},
        to=campaign_room(campaign_id)
    )



@table_bp.route("/api/campaigns/<int:campaign_id>/table", methods=["GET"])
@login_required
def get_table(campaign_id):
    #Estado inicial da mesa; as mudanças seguintes chegam pelo socket.
    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, g.user["id"])

        if role is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        campaign = connection.execute(
            "SELECT id, name, owner_id FROM campaigns WHERE id = ?",
            (campaign_id,)
        ).fetchone()

        maps = connection.execute(
            """
            SELECT * FROM maps WHERE campaign_id = ?
            ORDER BY created_at DESC
            """,
            (campaign_id,)
        ).fetchall()

        tokens = connection.execute(
            "SELECT * FROM tokens WHERE campaign_id = ? ORDER BY id",
            (campaign_id,)
        ).fetchall()

        messages = connection.execute(
            """
            SELECT * FROM (
                SELECT messages.*, users.name AS user_name
                FROM messages
                LEFT JOIN users ON users.id = messages.user_id
                WHERE messages.campaign_id = ?
                ORDER BY messages.id DESC
                LIMIT ?
            )
            ORDER BY id
            """,
            (campaign_id, MESSAGE_HISTORY)
        ).fetchall()

        members = connection.execute(
            """
            SELECT users.id, users.name, campaign_members.role
            FROM campaign_members
            JOIN users ON users.id = campaign_members.user_id
            WHERE campaign_members.campaign_id = ?
            ORDER BY users.name
            """,
            (campaign_id,)
        ).fetchall()

        active_map = get_active_map(connection, campaign_id)

    return jsonify({
        "campaign": dict(campaign),
        "role": role,
        "active_map": active_map,
        "maps": [serialize_map(row) for row in maps],
        "tokens": [serialize_token(row) for row in tokens],
        "messages": [serialize_message(row) for row in messages],
        "members": [dict(row) for row in members]
    }), 200



@table_bp.route("/api/campaigns/<int:campaign_id>/tokens", methods=["POST"])
@login_required
def create_token(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    name = data.get("name", "")
    color = data.get("color", "#ffb82e")
    x = read_position(data.get("x", 0))
    y = read_position(data.get("y", 0))
    owner_id = data.get("owner_id", g.user["id"])

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Informe o nome do token."}), 400

    if len(name.strip()) > 40:
        return jsonify({"error": "O nome deve ter até 40 caracteres."}), 400

    if not isinstance(color, str) or not COLOR_PATTERN.match(color):
        return jsonify({"error": "Cor inválida."}), 400

    if x is None or y is None:
        return jsonify({"error": "Posição inválida."}), 400

    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, g.user["id"])

        if role is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        # Jogadores só criam tokens para si; o mestre escolhe o dono
        # (ou deixa sem dono, para monstros e NPCs).
        if role != "gm":
            owner_id = g.user["id"]
        elif owner_id is not None and get_member_role(
            connection, campaign_id, owner_id
        ) is None:
            return jsonify({"error": "O dono do token não está na campanha."}), 400

        cursor = connection.execute(
            """
            INSERT INTO tokens (campaign_id, owner_id, name, color, x, y)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (campaign_id, owner_id, name.strip(), color, x, y)
        )

        row = connection.execute(
            "SELECT * FROM tokens WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    token = serialize_token(row)
    socketio.emit("token:criado", token, to=campaign_room(campaign_id))

    return jsonify({"token": token}), 201



@table_bp.route("/api/tokens/<int:token_id>", methods=["DELETE"])
@login_required
def delete_token(token_id):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tokens WHERE id = ?",
            (token_id,)
        ).fetchone()

        role = row and get_member_role(
            connection, row["campaign_id"], g.user["id"]
        )

        if row is None or role is None:
            return jsonify({"error": "Token não encontrado."}), 404

        if role != "gm" and row["owner_id"] != g.user["id"]:
            return jsonify({
                "error": "Você só pode remover os seus tokens."
            }), 403

        connection.execute("DELETE FROM tokens WHERE id = ?", (token_id,))

    socketio.emit(
        "token:removido",
        {"id": token_id},
        to=campaign_room(row["campaign_id"])
    )

    return jsonify({"message": "Token removido."}), 200



# ===== EVENTOS EM TEMPO REAL =====

def current_user():
    return connected_users.get(request.sid)


def require_member(campaign_id):
    #Retorna (usuário, papel) ou (None, mensagem de erro).
    user = current_user()

    if user is None:
        return None, "Sua sessão expirou. Entre novamente."

    if isinstance(campaign_id, bool) or not isinstance(campaign_id, int):
        return None, "Campanha inválida."

    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, user["id"])

    if role is None:
        return None, "Você não participa desta campanha."

    return user, role


@socketio.on("connect")
def handle_connect(auth):
    token = auth.get("token") if isinstance(auth, dict) else None
    user = get_user_by_token(token)

    if user is None:
        raise ConnectionRefusedError("Sua sessão expirou. Entre novamente.")

    connected_users[request.sid] = {"id": user["id"], "name": user["name"]}


@socketio.on("disconnect")
def handle_disconnect(*args):
    connected_users.pop(request.sid, None)

    with presence_lock:
        left = [
            campaign_id
            for campaign_id, sids in presence.items()
            if sids.pop(request.sid, None)
        ]

    for campaign_id in left:
        broadcast_presence(campaign_id)


@socketio.on("mesa:entrar")
def handle_join_table(data):
    campaign_id = data.get("campaign_id") if isinstance(data, dict) else None
    user, role = require_member(campaign_id)

    if user is None:
        return {"error": role}

    join_room(campaign_room(campaign_id))

    with presence_lock:
        presence.setdefault(campaign_id, {})[request.sid] = user

    broadcast_presence(campaign_id)
    return {"ok": True}


@socketio.on("mesa:sair")
def handle_leave_table(data):
    campaign_id = data.get("campaign_id") if isinstance(data, dict) else None

    leave_room(campaign_room(campaign_id))

    with presence_lock:
        presence.get(campaign_id, {}).pop(request.sid, None)

    broadcast_presence(campaign_id)
    return {"ok": True}


@socketio.on("token:mover")
def handle_move_token(data):
    if not isinstance(data, dict):
        return {"error": "Dados inválidos."}

    x = read_position(data.get("x"))
    y = read_position(data.get("y"))

    if x is None or y is None:
        return {"error": "Posição inválida."}

    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tokens WHERE id = ?",
            (data.get("token_id"),)
        ).fetchone()

    if row is None:
        return {"error": "Token não encontrado."}

    user, role = require_member(row["campaign_id"])

    if user is None:
        return {"error": role}

    if role != "gm" and row["owner_id"] != user["id"]:
        return {"error": "Você só pode mover os seus tokens."}

    with get_connection() as connection:
        connection.execute(
            "UPDATE tokens SET x = ?, y = ? WHERE id = ?",
            (x, y, row["id"])
        )

    socketio.emit(
        "token:movido",
        {"id": row["id"], "x": x, "y": y},
        to=campaign_room(row["campaign_id"])
    )
    return {"ok": True}


@socketio.on("chat:enviar")
def handle_chat_message(data):
    if not isinstance(data, dict):
        return {"error": "Dados inválidos."}

    campaign_id = data.get("campaign_id")
    content = data.get("content", "")
    user, role = require_member(campaign_id)

    if user is None:
        return {"error": role}

    if not isinstance(content, str) or not content.strip():
        return {"error": "Escreva uma mensagem."}

    if len(content) > MAX_MESSAGE_LENGTH:
        return {
            "error": f"A mensagem deve ter até {MAX_MESSAGE_LENGTH} caracteres."
        }

    with get_connection() as connection:
        message = save_message(
            connection, campaign_id, user["id"], "message", content.strip()
        )

    socketio.emit("chat:mensagem", message, to=campaign_room(campaign_id))
    return {"ok": True}


@socketio.on("dados:rolar")
def handle_dice_roll(data):
    #A rolagem é feita no servidor para que ninguém possa trapacear.
    if not isinstance(data, dict):
        return {"error": "Dados inválidos."}

    campaign_id = data.get("campaign_id")
    label = data.get("label", "")
    user, role = require_member(campaign_id)

    if user is None:
        return {"error": role}

    try:
        roll = roll_expression(data.get("expression"))
    except ValueError as error:
        return {"error": str(error)}

    label = label.strip()[:60] if isinstance(label, str) else ""

    with get_connection() as connection:
        message = save_message(
            connection,
            campaign_id,
            user["id"],
            "roll",
            label or roll["expression"],
            roll
        )

    socketio.emit("chat:mensagem", message, to=campaign_room(campaign_id))
    return {"ok": True}
