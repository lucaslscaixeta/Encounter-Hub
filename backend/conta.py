from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash
from autenticacao import login_required
from banco import get_connection
from extensoes import socketio
from imagens import delete_image_file
from mapas import delete_map_file
from mesa_virtual import delete_token_image
from servico_email import enviar_email
import limites


account_bp = Blueprint("account", __name__)


def send_goodbye_email(name, email):
    content = (
        f"Olá, {name}!\n\n"
        "Sua conta no Encounter Hub foi excluída, junto com os seus dados "
        "pessoais, mensagens e tokens.\n\n"
        "Se não foi você quem pediu a exclusão, responda este e-mail."
    )

    try:
        enviar_email(email, "Conta excluída - Encounter Hub", content)
    except (ValueError, OSError) as error:
        print(f"Aviso: e-mail de exclusão não enviado: {error}")



@account_bp.route("/api/me", methods=["DELETE"])
@login_required
def delete_account():
    """Exclui a conta e os dados pessoais do usuário (LGPD).

    Pede a senha. Se o usuário for mestre de campanhas, elas também são
    excluídas, mas só depois de ele confirmar com "delete_campaigns": true.
    """
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    password = data.get("password", "")

    if not isinstance(password, str) or not password:
        return jsonify({"error": "Informe sua senha para confirmar."}), 400

    attempts_key = f"exclusao-conta:{g.user['id']}"
    blocked = limites.check_limits(
        (attempts_key, limites.DELETE_ACCOUNT_FAILURES)
    )

    if blocked:
        return blocked

    with get_connection() as connection:
        user = connection.execute(
            "SELECT name, email, password_hash, avatar_filename FROM users WHERE id = %s",
            (g.user["id"],)
        ).fetchone()

    # 403 e não 401: o frontend trata 401 como sessão expirada.
    if not check_password_hash(user["password_hash"], password):
        limites.record(attempts_key)
        return jsonify({"error": "Senha incorreta."}), 403

    limites.clear(attempts_key)

    with get_connection() as connection:
        owned = connection.execute(
            """
            SELECT campaigns.id, campaigns.name,
                   COUNT(campaign_members.user_id) - 1 AS player_count
            FROM campaigns
            JOIN campaign_members
                ON campaign_members.campaign_id = campaigns.id
            WHERE campaigns.owner_id = %s
            GROUP BY campaigns.id
            ORDER BY campaigns.name
            """,
            (g.user["id"],)
        ).fetchall()

        if owned and data.get("delete_campaigns") is not True:
            return jsonify({
                "error": (
                    "Você é mestre de campanhas que também serão excluídas, "
                    "para todos os participantes. Confirme para continuar."
                ),
                "campaigns": [dict(row) for row in owned]
            }), 409

        owned_ids = [row["id"] for row in owned]

        # Arquivos no Storage: só podem ser apagados depois do banco.
        map_files = [
            row["filename"]
            for row in connection.execute(
                "SELECT filename FROM maps WHERE campaign_id = ANY(%s)",
                (owned_ids,)
            ).fetchall()
        ]

        token_files = [
            row["image_filename"]
            for row in connection.execute(
                """
                SELECT image_filename FROM tokens
                WHERE image_filename IS NOT NULL
                  AND (campaign_id = ANY(%s) OR owner_id = %s)
                """,
                (owned_ids, g.user["id"])
            ).fetchall()
        ]

        # Mensagens e tokens do usuário nas campanhas de outras pessoas
        # também são dados dele; o restante sai em cascata com a conta.
        connection.execute(
            "DELETE FROM messages WHERE user_id = %s",
            (g.user["id"],)
        )
        connection.execute(
            "DELETE FROM tokens WHERE owner_id = %s",
            (g.user["id"],)
        )
        connection.execute(
            "DELETE FROM users WHERE id = %s",
            (g.user["id"],)
        )

    for filename in map_files:
        delete_map_file(filename)

    for filename in token_files:
        delete_token_image(filename)

    delete_image_file("avatars", user["avatar_filename"])

    socketio.start_background_task(
        send_goodbye_email, user["name"], user["email"]
    )

    return jsonify({"message": "Sua conta foi excluída."}), 200
