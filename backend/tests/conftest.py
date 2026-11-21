"""Configuração compartilhada dos testes do backend.

Os testes que usam o banco rodam contra o Postgres do DATABASE_URL, mas
cada teste ganha um schema temporário ("teste_xxxxxxxx") que é apagado no
fim, mesmo se o teste falhar. Os dados reais nunca são tocados.

Nenhum e-mail é enviado e nada vai para o Supabase Storage: os dois
serviços são trocados por versões falsas em todos os testes.
"""

import os
import uuid
from urllib.parse import urlparse

# Endereços "de produção", para conferir os links dos e-mails. Precisam
# estar definidos antes de importar o backend (o .env não os sobrescreve).
os.environ["BACKEND_URL"] = "https://api.exemplo.test/"
os.environ["FRONTEND_URL"] = "https://site.exemplo.test"

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

import banco


PASSWORD = "senha1234"


@pytest.fixture(autouse=True)
def fake_services(monkeypatch):
    """Troca e-mail e Storage por versões que só registram as chamadas."""
    import autenticacao
    import avisos
    import conta
    import imagens
    import servico_email

    emails = []
    storage = []

    def fake_send(to, subject, text):
        emails.append((to, subject, text))
        return True

    for module in (servico_email, autenticacao, conta, avisos):
        monkeypatch.setattr(module, "enviar_email", fake_send)

    def fake_storage(method, path, data=None, content_type=None):
        storage.append((method, path))
        return {}

    monkeypatch.setattr(imagens, "storage_request", fake_storage)
    monkeypatch.setattr(imagens, "_bucket_ready", True)

    return {"emails": emails, "storage": storage}


@pytest.fixture
def emails(fake_services):
    #Lista de (destinatário, assunto, texto) dos e-mails "enviados".
    return fake_services["emails"]


@pytest.fixture
def db():
    """Cria um schema temporário com as tabelas e o apaga no fim."""
    if not banco.DATABASE_URL:
        pytest.skip("Configure DATABASE_URL no backend/.env para rodar.")

    if urlparse(banco.DATABASE_URL).port == 6543:
        pytest.skip(
            "Use a connection string do Session pooler (porta 5432): o "
            "Transaction pooler não mantém o search_path do schema de teste."
        )

    schema = "teste_" + uuid.uuid4().hex[:8]
    admin = psycopg.connect(
        banco.DATABASE_URL, autocommit=True, prepare_threshold=None
    )
    admin.execute(f"CREATE SCHEMA {schema}")

    def configure(connection):
        connection.execute(f"SET search_path TO {schema}")
        connection.commit()

    previous_pool = banco._pool
    banco._pool = ConnectionPool(
        banco.DATABASE_URL,
        min_size=1,
        max_size=5,
        configure=configure,
        kwargs={"row_factory": dict_row, "prepare_threshold": None},
        open=True,
    )

    try:
        banco.init_db()
        yield schema
    finally:
        banco._pool.close()
        banco._pool = previous_pool
        admin.execute(f"DROP SCHEMA {schema} CASCADE")
        admin.close()


@pytest.fixture
def app(db):
    # Importado só aqui: o app.py cria as tabelas ao ser importado.
    from app import app as flask_app

    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def make_client(app):
    #Cliente que parece vir de um IP específico (para os limites por IP).
    def make(ip):
        test_client = app.test_client()
        test_client.environ_base["REMOTE_ADDR"] = ip
        return test_client

    return make


@pytest.fixture
def sql(db):
    #Executa SQL direto no schema de teste; devolve as linhas, se houver.
    def run(query, params=()):
        with banco.get_connection() as connection:
            cursor = connection.execute(query, params)
            return cursor.fetchall() if cursor.description else None

    return run


@pytest.fixture
def register(client, sql):
    """Cadastra, confirma e faz login; devolve (headers, user_id, token)."""
    def make(name, email, test_client=None):
        test_client = test_client or client
        response = test_client.post("/api/register", json={
            "name": name,
            "email": email,
            "password": PASSWORD,
            "accept_privacy": True,
        })
        assert response.status_code == 201, response.json

        sql("UPDATE users SET email_verified = 1 WHERE email = %s", (email,))

        response = test_client.post(
            "/api/login", json={"email": email, "password": PASSWORD}
        )
        assert response.status_code == 200, response.json
        token = response.json["token"]

        return (
            {"Authorization": f"Bearer {token}"},
            response.json["user"]["id"],
            token,
        )

    return make


@pytest.fixture
def campaign(client):
    """Cria uma campanha e põe os jogadores nela; devolve o id."""
    def make(gm_headers, players=(), name="Masmorra"):
        response = client.post(
            "/api/campaigns", json={"name": name}, headers=gm_headers
        )
        assert response.status_code == 201, response.json
        campaign_id = response.json["campaign"]["id"]
        code = client.get(
            f"/api/campaigns/{campaign_id}", headers=gm_headers
        ).json["campaign"]["invite_code"]

        for headers in players:
            response = client.post(
                "/api/campaigns/join",
                json={"invite_code": code},
                headers=headers,
            )
            assert response.status_code == 201, response.json

        return campaign_id

    return make
