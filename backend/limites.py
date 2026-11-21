import math

from datetime import datetime, timedelta, timezone
from flask import jsonify, request
from banco import get_connection


# Cada regra: (máximo de tentativas, janela de tempo).
LOGIN_FAILURES_PER_ACCOUNT = (5, timedelta(minutes=15))
LOGIN_FAILURES_PER_IP = (20, timedelta(minutes=15))
REGISTER_PER_IP = (10, timedelta(hours=1))
FORGOT_PASSWORD_PER_IP = (5, timedelta(hours=1))
FORGOT_PASSWORD_PER_ACCOUNT = (3, timedelta(hours=1))
RESET_PASSWORD_PER_IP = (10, timedelta(hours=1))
DELETE_ACCOUNT_FAILURES = (5, timedelta(minutes=15))

# Por quanto tempo os registros ficam guardados antes da limpeza.
EVENT_RETENTION = timedelta(days=1)


def client_ip():
    # Atrás de um proxy, configure TRUSTED_PROXIES para o Flask ler o IP real.
    return request.remote_addr or "desconhecido"


def retry_after(key, rule):
    """Segundos até liberar a chave, ou None se ainda há tentativas."""
    limit, window = rule
    since = datetime.now(timezone.utc) - window

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total, MIN(created_at) AS oldest
            FROM rate_limit_events
            WHERE key = %s AND created_at > %s
            """,
            (key, since)
        ).fetchone()

    if row["total"] < limit:
        return None

    # Libera quando a tentativa mais antiga da janela expirar.
    wait = row["oldest"] + window - datetime.now(timezone.utc)
    return max(1, math.ceil(wait.total_seconds()))


def check_limits(*checks):
    """Recebe pares (chave, regra) e devolve a resposta 429 ou None."""
    waits = [retry_after(key, rule) for key, rule in checks]
    waits = [wait for wait in waits if wait is not None]

    if not waits:
        return None

    wait = max(waits)
    minutes = math.ceil(wait / 60)

    response = jsonify({
        "error": (
            "Muitas tentativas. Tente novamente em "
            f"{minutes} {'minuto' if minutes == 1 else 'minutos'}."
        )
    })
    response.status_code = 429
    response.headers["Retry-After"] = str(wait)
    return response


def record(*keys):
    with get_connection() as connection:
        connection.cursor().executemany(
            "INSERT INTO rate_limit_events (key) VALUES (%s)",
            [(key,) for key in keys]
        )


def clear(key):
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM rate_limit_events WHERE key = %s",
            (key,)
        )
