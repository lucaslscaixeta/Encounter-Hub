import secrets

from flask import Blueprint, g, jsonify, request
from autenticacao import login_required
from banco import get_connection, get_member_role
from mapas import delete_map_file
from mesa_virtual import delete_token_image


campaigns_bp = Blueprint("campaigns", __name__)


def generate_invite_code(connection):
    while True:
        code = secrets.token_hex(4).upper()

        exists = connection.execute(
            "SELECT 1 FROM campaigns WHERE invite_code = ?",
            (code,)
        ).fetchone()

        if not exists:
            return code


def read_campaign_fields(data):
    name = data.get("name", "")
    description = data.get("description", "")

    if not isinstance(name, str) or not isinstance(description, str):
        return None, "Os dados enviados são inválidos."

    name = name.strip()
    description = description.strip()

    if not name:
        return None, "Informe o nome da campanha."

    if len(name) > 80:
        return None, "O nome deve ter até 80 caracteres."

    if len(description) > 1000:
        return None, "A descrição deve ter até 1000 caracteres."

    return {"name": name, "description": description}, None


def list_members(connection, campaign_id):
    rows = connection.execute(
        """
        SELECT users.id, users.name, campaign_members.role
        FROM campaign_members
        JOIN users ON users.id = campaign_members.user_id
        WHERE campaign_members.campaign_id = ?
        ORDER BY campaign_members.role = 'player', users.name
        """,
        (campaign_id,)
    ).fetchall()

    return [dict(row) for row in rows]



@campaigns_bp.route("/api/campaigns", methods=["GET"])
@login_required
def list_campaigns():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT campaigns.id, campaigns.name, campaigns.description,
                   campaign_members.role,
                   owner.name AS owner_name,
                   (
                       SELECT COUNT(*) FROM campaign_members AS members
                       WHERE members.campaign_id = campaigns.id
                   ) AS member_count,
                   (
                       SELECT MIN(scheduled_at) FROM game_sessions
                       WHERE game_sessions.campaign_id = campaigns.id
                         AND game_sessions.status = 'agendada'
                         AND game_sessions.scheduled_at >=
                             strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
                   ) AS next_session_at
            FROM campaigns
            JOIN campaign_members
                ON campaign_members.campaign_id = campaigns.id
            JOIN users AS owner ON owner.id = campaigns.owner_id
            WHERE campaign_members.user_id = ?
            ORDER BY campaigns.created_at DESC
            """,
            (g.user["id"],)
        ).fetchall()

    return jsonify({"campaigns": [dict(row) for row in rows]}), 200



@campaigns_bp.route("/api/campaigns", methods=["POST"])
@login_required
def create_campaign():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    fields, error = read_campaign_fields(data)

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO campaigns (owner_id, name, description, invite_code)
            VALUES (?, ?, ?, ?)
            """,
            (
                g.user["id"],
                fields["name"],
                fields["description"],
                generate_invite_code(connection)
            )
        )
        campaign_id = cursor.lastrowid

        connection.execute(
            """
            INSERT INTO campaign_members (campaign_id, user_id, role)
            VALUES (?, ?, 'gm')
            """,
            (campaign_id, g.user["id"])
        )

    return jsonify({
        "message": "Campanha criada!",
        "campaign": {"id": campaign_id, **fields}
    }), 201



@campaigns_bp.route("/api/campaigns/<int:campaign_id>", methods=["GET"])
@login_required
def get_campaign(campaign_id):
    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, g.user["id"])

        if role is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        campaign = connection.execute(
            """
            SELECT id, owner_id, name, description, invite_code
            FROM campaigns
            WHERE id = ?
            """,
            (campaign_id,)
        ).fetchone()

        members = list_members(connection, campaign_id)

    campaign = dict(campaign)

    # Só o mestre vê o código de convite.
    if role != "gm":
        campaign.pop("invite_code")

    return jsonify({
        "campaign": campaign,
        "role": role,
        "members": members
    }), 200



@campaigns_bp.route("/api/campaigns/<int:campaign_id>", methods=["PUT"])
@login_required
def update_campaign(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    fields, error = read_campaign_fields(data)

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode editar a campanha."
            }), 403

        connection.execute(
            """
            UPDATE campaigns SET name = ?, description = ?
            WHERE id = ?
            """,
            (fields["name"], fields["description"], campaign_id)
        )

    return jsonify({"message": "Campanha atualizada!"}), 200



@campaigns_bp.route("/api/campaigns/<int:campaign_id>", methods=["DELETE"])
@login_required
def delete_campaign(campaign_id):
    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode excluir a campanha."
            }), 403

        filenames = [
            row["filename"]
            for row in connection.execute(
                "SELECT filename FROM maps WHERE campaign_id = ?",
                (campaign_id,)
            ).fetchall()
        ]

        token_images = [
            row["image_filename"]
            for row in connection.execute(
                """
                SELECT image_filename FROM tokens
                WHERE campaign_id = ? AND image_filename IS NOT NULL
                """,
                (campaign_id,)
            ).fetchall()
        ]

        connection.execute(
            "DELETE FROM campaigns WHERE id = ?",
            (campaign_id,)
        )

    for filename in filenames:
        delete_map_file(filename)

    for filename in token_images:
        delete_token_image(filename)

    return jsonify({"message": "Campanha excluída."}), 200



@campaigns_bp.route("/api/campaigns/join", methods=["POST"])
@login_required
def join_campaign():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    code = data.get("invite_code", "")

    if not isinstance(code, str) or not code.strip():
        return jsonify({"error": "Informe o código de convite."}), 400

    code = code.strip().upper()

    with get_connection() as connection:
        campaign = connection.execute(
            "SELECT id, name FROM campaigns WHERE invite_code = ?",
            (code,)
        ).fetchone()

        if campaign is None:
            return jsonify({"error": "Código de convite inválido."}), 404

        if get_member_role(connection, campaign["id"], g.user["id"]):
            return jsonify({
                "message": "Você já participa desta campanha.",
                "campaign": dict(campaign)
            }), 200

        connection.execute(
            """
            INSERT INTO campaign_members (campaign_id, user_id, role)
            VALUES (?, ?, 'player')
            """,
            (campaign["id"], g.user["id"])
        )

    return jsonify({
        "message": f"Você entrou na campanha {campaign['name']}!",
        "campaign": dict(campaign)
    }), 201



@campaigns_bp.route(
    "/api/campaigns/<int:campaign_id>/invite-code",
    methods=["POST"]
)
@login_required
def regenerate_invite_code(campaign_id):
    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode gerar um novo convite."
            }), 403

        code = generate_invite_code(connection)

        connection.execute(
            "UPDATE campaigns SET invite_code = ? WHERE id = ?",
            (code, campaign_id)
        )

    return jsonify({"invite_code": code}), 200



@campaigns_bp.route(
    "/api/campaigns/<int:campaign_id>/members/<int:user_id>",
    methods=["DELETE"]
)
@login_required
def remove_member(campaign_id, user_id):
    #O mestre remove jogadores; o jogador pode remover a si mesmo (sair).
    with get_connection() as connection:
        my_role = get_member_role(connection, campaign_id, g.user["id"])
        target_role = get_member_role(connection, campaign_id, user_id)

        if my_role is None or target_role is None:
            return jsonify({"error": "Membro não encontrado."}), 404

        if target_role == "gm":
            return jsonify({
                "error": "O mestre não pode sair da própria campanha."
            }), 400

        if my_role != "gm" and user_id != g.user["id"]:
            return jsonify({
                "error": "Apenas o mestre pode remover jogadores."
            }), 403

        connection.execute(
            """
            DELETE FROM campaign_members
            WHERE campaign_id = ? AND user_id = ?
            """,
            (campaign_id, user_id)
        )

        connection.execute(
            """
            DELETE FROM session_attendance
            WHERE user_id = ? AND session_id IN (
                SELECT id FROM game_sessions WHERE campaign_id = ?
            )
            """,
            (user_id, campaign_id)
        )

    return jsonify({"message": "Membro removido."}), 200
