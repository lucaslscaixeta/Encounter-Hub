import os
import smtplib
import ssl
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

USERNAME = os.getenv("MAIL_USERNAME")
PASSWORD = os.getenv("MAIL_PASSWORD")
SENDER = os.getenv("MAIL_DEFAULT_SENDER")


def enviar_email(destinatario, assunto, conteudo):
    if not USERNAME or not PASSWORD or not SENDER:
        raise ValueError("Configure as variáveis de e-mail no .env")

    mensagem = EmailMessage()
    mensagem["Subject"] = assunto
    mensagem["From"] = SENDER
    mensagem["To"] = destinatario
    mensagem.set_content(conteudo)

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as servidor:
            servidor.ehlo()
            servidor.starttls(context=ssl.create_default_context())
            servidor.ehlo()
            servidor.login(USERNAME, PASSWORD)
            servidor.send_message(mensagem)

        return True

    except (smtplib.SMTPException, OSError, ssl.SSLError):
        return False


if __name__ == "__main__":
    destinatario = input("E-mail destinatário: ").strip()

    sucesso = enviar_email(
        destinatario,
        "Teste de e-mail - Encounter Hub",
        "O envio de e-mails do Encounter Hub está funcionando!"
    )

    print("E-mail enviado!" if sucesso else "Falha no envio.")
