from datetime import date, datetime, timedelta
from flask import Blueprint, g, jsonify, request
from autenticacao import login_required
from banco import get_connection, get_member_role


availability_bp = Blueprint("availability", __name__)

DATE_FORMAT = "%Y-%m-%d"
SLOT_FORMAT = "%Y-%m-%dT%H:00"
POLL_STATUSES = {"aberta", "encerrada"}
MAX_POLL_DAYS = 31


def read_poll_fields(data):
    title = data.get("title", "")
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")
    start_hour = data.get("start_hour")
    end_hour = data.get("end_hour")

    if not isinstance(title, str) or not title.strip():
        return None, "Informe o título da enquete."

    if len(title.strip()) > 80:
        return None, "O título deve ter até 80 caracteres."

    try:
        first_day = datetime.strptime(start_date, DATE_FORMAT).date()
        last_day = datetime.strptime(end_date, DATE_FORMAT).date()
    except (TypeError, ValueError):
        return None, "Informe datas válidas para o período."

    if first_day < date.today():
        return None, "O período deve começar hoje ou depois."

    if last_day < first_day:
        return None, "A data final deve ser igual ou posterior à inicial."

    if (last_day - first_day).days + 1 > MAX_POLL_DAYS:
        return None, f"O período pode ter no máximo {MAX_POLL_DAYS} dias."

    if not all(
        isinstance(hour, int) and not isinstance(hour, bool)
        for hour in (start_hour, end_hour)
    ):
        return None, "Informe a faixa de horário."

    if not 0 <= start_hour <= 23 or not 1 <= end_hour <= 24:
        return None, "Horário inválido."

    if end_hour <= start_hour:
        return None, "O horário final deve ser depois do inicial."

    return {
        "title": title.strip(),
        "start_date": first_day.strftime(DATE_FORMAT),
        "end_date": last_day.strftime(DATE_FORMAT),
        "start_hour": start_hour,
        "end_hour": end_hour,
    }, None


def poll_slots(poll):
    #Todos os blocos de 1 hora válidos da enquete.
    day = datetime.strptime(poll["start_date"], DATE_FORMAT)
    last_day = datetime.strptime(poll["end_date"], DATE_FORMAT)
    slots = set()

    while day <= last_day:
        for hour in range(poll["start_hour"], poll["end_hour"]):
            slots.add(day.replace(hour=hour).strftime(SLOT_FORMAT))
        day += timedelta(days=1)

    return slots


def serialize_poll(row):
    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "title": row["title"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "start_hour": row["start_hour"],
        "end_hour": row["end_hour"],
        "status": row["status"],
        "session_id": row["session_id"],
    }


def get_poll_with_role(connection, poll_id):
    poll = connection.execute(
        "SELECT * FROM availability_polls WHERE id = %s",
        (poll_id,)
    ).fetchone()

    if poll is None:
        return None, None

    return poll, get_member_role(connection, poll["campaign_id"], g.user["id"])



@availability_bp.route(
    "/api/campaigns/<int:campaign_id>/polls",
    methods=["GET"]
)
@login_required
def list_polls(campaign_id):
    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        polls = connection.execute(
            """
            SELECT * FROM availability_polls
            WHERE campaign_id = %s
            ORDER BY status = 'encerrada', start_date, id
            """,
            (campaign_id,)
        ).fetchall()

        # Quantos membros atuais já responderam cada enquete.
        counts = connection.execute(
            """
            SELECT availability_slots.poll_id,
                   COUNT(DISTINCT availability_slots.user_id) AS respondents
            FROM availability_slots
            JOIN availability_polls
                ON availability_polls.id = availability_slots.poll_id
            JOIN campaign_members
                ON campaign_members.campaign_id = availability_polls.campaign_id
               AND campaign_members.user_id = availability_slots.user_id
            WHERE availability_polls.campaign_id = %s
            GROUP BY availability_slots.poll_id
            """,
            (campaign_id,)
        ).fetchall()

        member_count = connection.execute(
            "SELECT COUNT(*) AS total FROM campaign_members WHERE campaign_id = %s",
            (campaign_id,)
        ).fetchone()["total"]

    respondents = {row["poll_id"]: row["respondents"] for row in counts}

    return jsonify({
        "polls": [
            {
                **serialize_poll(poll),
                "respondent_count": respondents.get(poll["id"], 0),
                "member_count": member_count,
            }
            for poll in polls
        ]
    }), 200



@availability_bp.route(
    "/api/campaigns/<int:campaign_id>/polls",
    methods=["POST"]
)
@login_required
def create_poll(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    fields, error = read_poll_fields(data)

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode criar enquetes de disponibilidade."
            }), 403

        poll = connection.execute(
            """
            INSERT INTO availability_polls (
                campaign_id, title, start_date, end_date, start_hour, end_hour
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                campaign_id,
                fields["title"],
                fields["start_date"],
                fields["end_date"],
                fields["start_hour"],
                fields["end_hour"]
            )
        ).fetchone()

    return jsonify({
        "message": "Enquete criada!",
        "poll": serialize_poll(poll)
    }), 201



@availability_bp.route("/api/polls/<int:poll_id>", methods=["GET"])
@login_required
def get_poll(poll_id):
    with get_connection() as connection:
        poll, role = get_poll_with_role(connection, poll_id)

        if poll is None or role is None:
            return jsonify({"error": "Enquete não encontrada."}), 404

        members = connection.execute(
            """
            SELECT users.id, users.name, campaign_members.role
            FROM campaign_members
            JOIN users ON users.id = campaign_members.user_id
            WHERE campaign_members.campaign_id = %s
            ORDER BY campaign_members.role = 'player', users.name
            """,
            (poll["campaign_id"],)
        ).fetchall()

        rows = connection.execute(
            """
            SELECT user_id, slot FROM availability_slots
            WHERE poll_id = %s
            ORDER BY slot
            """,
            (poll_id,)
        ).fetchall()

    member_ids = {member["id"] for member in members}
    availability = {}

    # Só membros atuais aparecem; quem saiu da campanha fica de fora.
    for row in rows:
        if row["user_id"] in member_ids:
            availability.setdefault(str(row["user_id"]), []).append(row["slot"])

    return jsonify({
        "poll": serialize_poll(poll),
        "role": role,
        "members": [dict(member) for member in members],
        "availability": availability
    }), 200



@availability_bp.route(
    "/api/polls/<int:poll_id>/availability",
    methods=["PUT"]
)
@login_required
def set_availability(poll_id):
    #Substitui todos os blocos marcados pelo usuário nesta enquete.
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not isinstance(data.get("slots"), list):
        return jsonify({"error": "Envie a lista de horários."}), 400

    slots = data["slots"]

    with get_connection() as connection:
        poll, role = get_poll_with_role(connection, poll_id)

        if poll is None or role is None:
            return jsonify({"error": "Enquete não encontrada."}), 404

        if poll["status"] != "aberta":
            return jsonify({"error": "Esta enquete já foi encerrada."}), 400

        valid_slots = poll_slots(poll)

        if not all(isinstance(slot, str) and slot in valid_slots for slot in slots):
            return jsonify({
                "error": "Algum horário está fora do período da enquete."
            }), 400

        chosen = sorted(set(slots))

        connection.execute(
            "DELETE FROM availability_slots WHERE poll_id = %s AND user_id = %s",
            (poll_id, g.user["id"])
        )

        if chosen:
            connection.cursor().executemany(
                """
                INSERT INTO availability_slots (poll_id, user_id, slot)
                VALUES (%s, %s, %s)
                """,
                [(poll_id, g.user["id"], slot) for slot in chosen]
            )

    return jsonify({"message": "Disponibilidade salva!", "slots": chosen}), 200



@availability_bp.route("/api/polls/<int:poll_id>", methods=["PUT"])
@login_required
def update_poll(poll_id):
    #O mestre encerra/reabre a enquete e pode ligá-la à sessão marcada.
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    with get_connection() as connection:
        poll, role = get_poll_with_role(connection, poll_id)

        if poll is None or role is None:
            return jsonify({"error": "Enquete não encontrada."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode alterar a enquete."
            }), 403

        status = data.get("status", poll["status"])
        session_id = data.get("session_id", poll["session_id"])

        if status not in POLL_STATUSES:
            return jsonify({"error": "Status da enquete inválido."}), 400

        if session_id is not None:
            if not isinstance(session_id, int) or isinstance(session_id, bool):
                return jsonify({"error": "Sessão não encontrada."}), 404

            exists = connection.execute(
                "SELECT 1 FROM game_sessions WHERE id = %s AND campaign_id = %s",
                (session_id, poll["campaign_id"])
            ).fetchone()

            if not exists:
                return jsonify({"error": "Sessão não encontrada."}), 404

        poll = connection.execute(
            """
            UPDATE availability_polls SET status = %s, session_id = %s
            WHERE id = %s
            RETURNING *
            """,
            (status, session_id, poll_id)
        ).fetchone()

    return jsonify({
        "message": "Enquete atualizada!",
        "poll": serialize_poll(poll)
    }), 200



@availability_bp.route("/api/polls/<int:poll_id>", methods=["DELETE"])
@login_required
def delete_poll(poll_id):
    with get_connection() as connection:
        poll, role = get_poll_with_role(connection, poll_id)

        if poll is None or role is None:
            return jsonify({"error": "Enquete não encontrada."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode excluir a enquete."
            }), 403

        connection.execute(
            "DELETE FROM availability_polls WHERE id = %s",
            (poll_id,)
        )

    return jsonify({"message": "Enquete excluída."}), 200
