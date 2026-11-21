from banco import get_connection
from limites import EVENT_RETENTION


# De quanto em quanto tempo a limpeza roda e por quanto tempo uma conta
# não confirmada é mantida antes de ser apagada.
CLEANUP_INTERVAL_SECONDS = 3600
UNVERIFIED_ACCOUNT_RETENTION = "7 days"


def purge_expired_data():
    """Apaga dados vencidos (LGPD: não guardar além do necessário).

    Devolve quantos registros foram apagados de cada tipo.
    """
    with get_connection() as connection:
        removed = {
            # expires_at é texto ISO com fuso horário.
            "tokens de login": connection.execute(
                "DELETE FROM auth_tokens WHERE expires_at::timestamptz < now()"
            ).rowcount,
            "tokens de recuperação de senha": connection.execute(
                "DELETE FROM password_reset_tokens WHERE expires_at < now()"
            ).rowcount,
            "registros de tentativas": connection.execute(
                "DELETE FROM rate_limit_events WHERE created_at < now() - %s",
                (EVENT_RETENTION,)
            ).rowcount,
            # Quem nunca confirmou o e-mail não chegou a entrar no sistema.
            "contas não confirmadas": connection.execute(
                """
                DELETE FROM users
                WHERE email_verified = 0
                  AND created_at < now() - %s::interval
                """,
                (UNVERIFIED_ACCOUNT_RETENTION,)
            ).rowcount,
        }

    return removed


def cleanup_loop(socketio):
    #Roda em segundo plano enquanto o backend estiver ligado.
    while True:
        try:
            removed = purge_expired_data()
            summary = ", ".join(
                f"{count} {name}" for name, count in removed.items() if count
            )

            if summary:
                print(f"Limpeza automática: {summary}.")
        except Exception as error:
            print(f"Aviso: falha na limpeza automática: {error}")

        socketio.sleep(CLEANUP_INTERVAL_SECONDS)
