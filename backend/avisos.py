from datetime import datetime, timedelta
from banco import get_connection
from servico_email import enviar_email
from sessoes import SCHEDULE_FORMAT


# Com quanta antecedência o mestre é avisado e de quanto em quanto tempo
# o backend procura sessões que precisam de aviso.
REMINDER_WINDOW = timedelta(hours=24)
CHECK_INTERVAL_SECONDS = 300

ATTENDANCE_TEXT = {
    "recusado": "Não vão comparecer",
    "talvez": "Talvez compareçam",
}


def format_schedule(scheduled_at):
    #"2026-11-20T19:00" -> "20/11/2026 às 19:00" (24 horas).
    date = datetime.strptime(scheduled_at, SCHEDULE_FORMAT)
    return date.strftime("%d/%m/%Y às %H:%M")


def describe_session(session):
    lines = [
        f"Sessão: {session['title']}",
        f"Campanha: {session['campaign_name']}",
        f"Data: {format_schedule(session['scheduled_at'])}",
    ]

    if session["mode"] == "presencial":
        lines.append(f"Local: {session['location']}")
    else:
        lines.append("Formato: online, na mesa virtual")

    return "\n".join(lines)


def send_safely(destination, subject, content):
    #Uma falha de envio não pode derrubar a requisição nem a verificação.
    try:
        return enviar_email(destination, subject, content)
    except (ValueError, OSError) as error:
        print(f"Aviso: e-mail para {destination} não enviado: {error}")
        return False


def session_details(connection, session_id):
    return connection.execute(
        """
        SELECT game_sessions.*, campaigns.name AS campaign_name,
               campaigns.owner_id
        FROM game_sessions
        JOIN campaigns ON campaigns.id = game_sessions.campaign_id
        WHERE game_sessions.id = %s
        """,
        (session_id,)
    ).fetchone()


def players_with_status(connection, session, statuses):
    #Jogadores atuais da campanha com uma das respostas pedidas.
    return connection.execute(
        """
        SELECT users.name, users.email, session_attendance.status
        FROM session_attendance
        JOIN users ON users.id = session_attendance.user_id
        JOIN campaign_members
            ON campaign_members.user_id = session_attendance.user_id
           AND campaign_members.campaign_id = %s
        WHERE session_attendance.session_id = %s
          AND session_attendance.status = ANY(%s)
          AND campaign_members.role = 'player'
        ORDER BY users.name
        """,
        (session["campaign_id"], session["id"], list(statuses))
    ).fetchall()


def notify_cancellation(session_id):
    """Avisa quem respondeu "confirmado" ou "talvez" que a sessão foi cancelada."""
    with get_connection() as connection:
        session = session_details(connection, session_id)

        if session is None or session["status"] != "cancelada":
            return 0

        players = players_with_status(
            connection, session, ("confirmado", "talvez")
        )

    sent = 0

    for player in players:
        content = (
            f"Olá, {player['name']}!\n\n"
            "O mestre cancelou uma sessão em que você tinha marcado presença:\n\n"
            f"{describe_session(session)}\n\n"
            "Fique de olho no Encounter Hub para a próxima data."
        )

        if send_safely(
            player["email"],
            f"Sessão cancelada: {session['title']} - Encounter Hub",
            content
        ):
            sent += 1

    return sent


def send_gm_reminders(now=None):
    """Avisa o mestre das ausências nas sessões das próximas 24 horas.

    Cada sessão gera um único aviso, mesmo com vários backends ligados ao
    mesmo banco: o envio é "reservado" no banco antes de mandar o e-mail.
    """
    now = now or datetime.now()
    start = now.strftime(SCHEDULE_FORMAT)
    end = (now + REMINDER_WINDOW).strftime(SCHEDULE_FORMAT)

    with get_connection() as connection:
        sessions = connection.execute(
            """
            SELECT id FROM game_sessions
            WHERE status = 'agendada'
              AND gm_reminder_sent_at IS NULL
              AND scheduled_at > %s
              AND scheduled_at <= %s
            """,
            (start, end)
        ).fetchall()

    sent = 0

    for row in sessions:
        with get_connection() as connection:
            session = session_details(connection, row["id"])

            # A sessão pode ter sido excluída ou cancelada nesse meio-tempo.
            if session is None or session["status"] != "agendada":
                continue

            absentees = players_with_status(
                connection, session, ATTENDANCE_TEXT.keys()
            )

            # Sem ausências, nada a avisar (alguém ainda pode mudar a resposta).
            if not absentees:
                continue

            claimed = connection.execute(
                """
                UPDATE game_sessions SET gm_reminder_sent_at = now()
                WHERE id = %s AND gm_reminder_sent_at IS NULL
                RETURNING id
                """,
                (session["id"],)
            ).fetchone()

            gm = connection.execute(
                "SELECT name, email FROM users WHERE id = %s",
                (session["owner_id"],)
            ).fetchone()

        # Outro backend já reservou este aviso.
        if claimed is None:
            continue

        groups = []

        for status, title in ATTENDANCE_TEXT.items():
            names = [
                player["name"] for player in absentees
                if player["status"] == status
            ]

            if names:
                groups.append(f"{title}:\n" + "\n".join(f"- {name}" for name in names))

        content = (
            f"Olá, {gm['name']}!\n\n"
            "Sua sessão começa nas próximas 24 horas, e alguns jogadores "
            "avisaram que podem não comparecer:\n\n"
            f"{describe_session(session)}\n\n"
            + "\n\n".join(groups)
        )

        if send_safely(
            gm["email"],
            f"Ausências na sessão {session['title']} - Encounter Hub",
            content
        ):
            sent += 1
        else:
            # Libera a reserva para tentar de novo na próxima verificação.
            with get_connection() as connection:
                connection.execute(
                    "UPDATE game_sessions SET gm_reminder_sent_at = NULL WHERE id = %s",
                    (session["id"],)
                )

    return sent


def reminder_loop(socketio):
    #Roda em segundo plano enquanto o backend estiver ligado.
    while True:
        try:
            send_gm_reminders()
        except Exception as error:
            print(f"Aviso: falha ao verificar lembretes de sessão: {error}")

        socketio.sleep(CHECK_INTERVAL_SECONDS)
