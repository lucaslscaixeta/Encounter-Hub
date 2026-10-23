from datetime import datetime
from flask import Blueprint, g, jsonify, request
from autenticacao import login_required
from banco import get_connection, get_member_role


sessions_bp = Blueprint("sessions", __name__)

SCHEDULE_FORMAT = "%Y-%m-%dT%H:%M"
SESSION_MODES = {"online", "presencial"}
SESSION_STATUSES = {"agendada", "concluida", "cancelada"}
ATTENDANCE_STATUSES = {"confirmado", "talvez", "recusado"}

SESSION_COLUMNS = """
    game_sessions.id, game_sessions.campaign_id, game_sessions.title,
    game_sessions.description, game_sessions.scheduled_at,
    game_sessions.mode, game_sessions.location, game_sessions.status,
    campaigns.name AS campaign_name
"""


def read_session_fields(data, partial=False):
    #Valida os campos enviados; com partial=True aceita só alguns campos.
    fields = {}

    for key in ("title", "description", "scheduled_at", "mode",
                "location", "status"):
        if key in data:
            if not isinstance(data[key], str):
                return None, "Os dados enviados são inválidos."
            fields[key] = data[key].strip()

    if not partial:
        fields.setdefault("description", "")
        fields.setdefault("mode", "online")
        fields.setdefault("location", "")

        if not fields.get("title"):
            return None, "Informe o título da sessão."

        if not fields.get("scheduled_at"):
            return None, "Informe a data e o horário da sessão."

    if "title" in fields:
        if not fields["title"]:
            return None, "Informe o título da sessão."
        if len(fields["title"]) > 80:
            return None, "O título deve ter até 80 caracteres."

    if len(fields.get("description", "")) > 1000:
        return None, "A descrição deve ter até 1000 caracteres."

    if len(fields.get("location", "")) > 200:
        return None, "O local deve ter até 200 caracteres."

    if "scheduled_at" in fields:
        try:
            scheduled_at = datetime.fromisoformat(fields["scheduled_at"])
        except ValueError:
            return None, "Data e horário inválidos."

        if not partial and scheduled_at < datetime.now():
            return None, "Escolha uma data no futuro."

        fields["scheduled_at"] = scheduled_at.strftime(SCHEDULE_FORMAT)

    if "mode" in fields and fields["mode"] not in SESSION_MODES:
        return None, "Escolha entre sessão online ou presencial."

    if "status" in fields and fields["status"] not in SESSION_STATUSES:
        return None, "Status da sessão inválido."

    if fields.get("mode") == "presencial" and "location" in fields \
            and not fields["location"]:
        return None, "Informe o local da sessão presencial."

    return fields, None


def attach_attendance(connection, sessions):
    #Adiciona a lista de presença de cada membro da campanha às sessões.
    if not sessions:
        return sessions

    session_ids = [session["id"] for session in sessions]
    campaign_ids = list({session["campaign_id"] for session in sessions})

    members_by_campaign = {}
    rows = connection.execute(
        """
        SELECT campaign_members.campaign_id, users.id, users.name,
               campaign_members.role
        FROM campaign_members
        JOIN users ON users.id = campaign_members.user_id
        WHERE campaign_members.campaign_id = ANY(%s)
        ORDER BY users.name
        """,
        (campaign_ids,)
    ).fetchall()

    for row in rows:
        members_by_campaign.setdefault(row["campaign_id"], []).append(row)

    statuses = {}
    rows = connection.execute(
        """
        SELECT session_id, user_id, status
        FROM session_attendance
        WHERE session_id = ANY(%s)
        """,
        (session_ids,)
    ).fetchall()

    for row in rows:
        statuses[(row["session_id"], row["user_id"])] = row["status"]

    for session in sessions:
        attendance = [
            {
                "user_id": member["id"],
                "name": member["name"],
                "role": member["role"],
                "status": statuses.get((session["id"], member["id"]))
            }
            for member in members_by_campaign.get(session["campaign_id"], [])
        ]

        session["attendance"] = attendance
        session["my_status"] = statuses.get((session["id"], g.user["id"]))
        session["confirmed_count"] = sum(
            1 for item in attendance if item["status"] == "confirmado"
        )

    return sessions


def get_session_with_role(connection, session_id):
    session = connection.execute(
        f"""
        SELECT {SESSION_COLUMNS}
        FROM game_sessions
        JOIN campaigns ON campaigns.id = game_sessions.campaign_id
        WHERE game_sessions.id = %s
        """,
        (session_id,)
    ).fetchone()

    if session is None:
        return None, None

    role = get_member_role(connection, session["campaign_id"], g.user["id"])
    return dict(session), role



@sessions_bp.route("/api/sessions", methods=["GET"])
@login_required
def list_my_sessions():
    #?periodo=proximas (padrão) ou anteriores.
    period = request.args.get("periodo", "proximas")
    today = datetime.now().strftime("%Y-%m-%dT00:00")

    if period == "anteriores":
        condition = "game_sessions.scheduled_at < %s"
        order = "DESC"
    else:
        condition = "game_sessions.scheduled_at >= %s"
        order = "ASC"

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT {SESSION_COLUMNS}, campaign_members.role
            FROM game_sessions
            JOIN campaigns ON campaigns.id = game_sessions.campaign_id
            JOIN campaign_members
                ON campaign_members.campaign_id = campaigns.id
               AND campaign_members.user_id = %s
            WHERE {condition}
            ORDER BY game_sessions.scheduled_at {order}
            """,
            (g.user["id"], today)
        ).fetchall()

        sessions = attach_attendance(connection, [dict(row) for row in rows])

    return jsonify({"sessions": sessions}), 200



@sessions_bp.route(
    "/api/campaigns/<int:campaign_id>/sessions",
    methods=["GET"]
)
@login_required
def list_campaign_sessions(campaign_id):
    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, g.user["id"])

        if role is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        rows = connection.execute(
            f"""
            SELECT {SESSION_COLUMNS}
            FROM game_sessions
            JOIN campaigns ON campaigns.id = game_sessions.campaign_id
            WHERE game_sessions.campaign_id = %s
            ORDER BY game_sessions.scheduled_at DESC
            """,
            (campaign_id,)
        ).fetchall()

        sessions = attach_attendance(connection, [dict(row) for row in rows])

    return jsonify({"sessions": sessions}), 200



@sessions_bp.route(
    "/api/campaigns/<int:campaign_id>/sessions",
    methods=["POST"]
)
@login_required
def create_session(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    fields, error = read_session_fields(data)

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode marcar sessões."
            }), 403

        session_id = connection.execute(
            """
            INSERT INTO game_sessions (
                campaign_id, title, description, scheduled_at,
                mode, location
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                campaign_id,
                fields["title"],
                fields["description"],
                fields["scheduled_at"],
                fields["mode"],
                fields["location"]
            )
        ).fetchone()["id"]

        # O mestre já fica confirmado na sessão que marcou.
        connection.execute(
            """
            INSERT INTO session_attendance (session_id, user_id, status)
            VALUES (%s, %s, 'confirmado')
            """,
            (session_id, g.user["id"])
        )

    return jsonify({
        "message": "Sessão marcada!",
        "session_id": session_id
    }), 201



@sessions_bp.route("/api/sessions/<int:session_id>", methods=["PUT"])
@login_required
def update_session(session_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    fields, error = read_session_fields(data, partial=True)

    if error:
        return jsonify({"error": error}), 400

    if not fields:
        return jsonify({"error": "Nenhum campo para atualizar."}), 400

    with get_connection() as connection:
        session, role = get_session_with_role(connection, session_id)

        if session is None or role is None:
            return jsonify({"error": "Sessão não encontrada."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode editar a sessão."
            }), 403

        mode = fields.get("mode", session["mode"])
        location = fields.get("location", session["location"])

        if mode == "presencial" and not location:
            return jsonify({
                "error": "Informe o local da sessão presencial."
            }), 400

        assignments = ", ".join(f"{key} = %s" for key in fields)

        connection.execute(
            f"UPDATE game_sessions SET {assignments} WHERE id = %s",
            (*fields.values(), session_id)
        )

    return jsonify({"message": "Sessão atualizada!"}), 200



@sessions_bp.route("/api/sessions/<int:session_id>", methods=["DELETE"])
@login_required
def delete_session(session_id):
    with get_connection() as connection:
        session, role = get_session_with_role(connection, session_id)

        if session is None or role is None:
            return jsonify({"error": "Sessão não encontrada."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode excluir a sessão."
            }), 403

        connection.execute(
            "DELETE FROM game_sessions WHERE id = %s",
            (session_id,)
        )

    return jsonify({"message": "Sessão excluída."}), 200



@sessions_bp.route(
    "/api/sessions/<int:session_id>/attendance",
    methods=["PUT"]
)
@login_required
def set_attendance(session_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    status = data.get("status")

    if status not in ATTENDANCE_STATUSES:
        return jsonify({
            "error": "Escolha entre confirmado, talvez ou recusado."
        }), 400

    with get_connection() as connection:
        session, role = get_session_with_role(connection, session_id)

        if session is None or role is None:
            return jsonify({"error": "Sessão não encontrada."}), 404

        if session["status"] != "agendada":
            return jsonify({
                "error": "Esta sessão não está mais aberta para confirmação."
            }), 400

        connection.execute(
            """
            INSERT INTO session_attendance (session_id, user_id, status)
            VALUES (%s, %s, %s)
            ON CONFLICT (session_id, user_id)
            DO UPDATE SET status = excluded.status,
                          updated_at = CURRENT_TIMESTAMP
            """,
            (session_id, g.user["id"], status)
        )

    return jsonify({"message": "Presença atualizada!", "status": status}), 200
