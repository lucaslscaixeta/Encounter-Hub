"""Links por ambiente, limites de tentativas, exclusão de conta e limpeza."""

import time

import conta
import manutencao


WRONG = "errada123"


def login(test_client, email, password):
    return test_client.post(
        "/api/login", json={"email": email, "password": password}
    )


def test_links_dos_emails_usam_os_enderecos_do_ambiente(
    make_client, register, emails
):
    test_client = make_client("10.0.0.1")
    register("Mestre", "mestre@teste.local", test_client)
    assert "https://api.exemplo.test/api/verify-email?token=" in emails[-1][2]

    test_client.post(
        "/api/forgot-password", json={"email": "mestre@teste.local"}
    )
    assert "https://site.exemplo.test/?reset_token=" in emails[-1][2]
    assert "localhost" not in emails[-1][2]
    assert "localhost" not in emails[-2][2]


def test_limite_de_tentativas_no_login(make_client, register):
    ana = make_client("10.0.1.1")
    register("Ana", "ana@teste.local", ana)

    for _ in range(5):
        assert login(ana, "ana@teste.local", WRONG).status_code == 401

    response = login(ana, "ana@teste.local", "senha1234")
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert "minuto" in response.json["error"]

    # De outro IP o dono da conta continua entrando.
    other_ip = make_client("10.0.1.2")
    assert login(other_ip, "ana@teste.local", "senha1234").status_code == 200

    # Login certo zera as falhas daquela conta naquele IP.
    bia = make_client("10.0.2.1")
    register("Bia", "bia@teste.local", bia)

    for _ in range(2):
        for _ in range(4):
            login(bia, "bia@teste.local", WRONG)

        assert login(bia, "bia@teste.local", "senha1234").status_code == 200

    # Muitas falhas do mesmo IP em contas diferentes.
    attacker = make_client("10.0.3.1")

    for index in range(20):
        login(attacker, f"x{index}@teste.local", WRONG)

    assert login(attacker, "bia@teste.local", "senha1234").status_code == 429


def test_limites_de_cadastro_e_recuperacao_de_senha(make_client, register):
    register("Ana", "ana@teste.local", make_client("10.0.4.0"))

    same_ip = make_client("10.0.4.1")
    new_account = {
        "name": "N", "password": "senha1234", "accept_privacy": True
    }

    for index in range(10):
        same_ip.post("/api/register", json={
            **new_account, "email": f"novo{index}@teste.local"
        })

    response = same_ip.post("/api/register", json={
        **new_account, "email": "novo99@teste.local"
    })
    assert response.status_code == 429

    # 3 pedidos por hora para a mesma conta, de qualquer IP.
    for index in range(3):
        response = make_client(f"10.0.5.{index}").post(
            "/api/forgot-password", json={"email": "ana@teste.local"}
        )
        assert response.status_code == 200

    response = make_client("10.0.5.9").post(
        "/api/forgot-password", json={"email": "ana@teste.local"}
    )
    assert response.status_code == 429

    # 5 pedidos por hora do mesmo IP.
    forgot = make_client("10.0.6.1")

    for index in range(5):
        response = forgot.post(
            "/api/forgot-password", json={"email": f"y{index}@teste.local"}
        )
        assert response.status_code == 200

    response = forgot.post(
        "/api/forgot-password", json={"email": "y9@teste.local"}
    )
    assert response.status_code == 429

    # 10 redefinições por hora do mesmo IP.
    reset = make_client("10.0.7.1")
    attempt = {"token": "invalido", "password": "senha12345"}

    for _ in range(10):
        assert reset.post("/api/reset-password", json=attempt).status_code == 400

    assert reset.post("/api/reset-password", json=attempt).status_code == 429


def test_exclusao_de_conta(
    client, make_client, register, sql, emails, monkeypatch
):
    deleted_files = []
    monkeypatch.setattr(
        conta, "delete_map_file", lambda name: deleted_files.append(("maps", name))
    )
    monkeypatch.setattr(
        conta,
        "delete_token_image",
        lambda name: deleted_files.append(("tokens", name)),
    )
    monkeypatch.setattr(
        conta,
        "delete_image_file",
        lambda folder, name: name and deleted_files.append((folder, name)),
    )

    gm, gm_id, _ = register("Gui", "gui@teste.local", make_client("10.0.8.1"))
    p1, p1_id, _ = register(
        "Pedro", "pedro@teste.local", make_client("10.0.8.2")
    )
    p2, p2_id, _ = register(
        "Paula", "paula@teste.local", make_client("10.0.8.3")
    )
    sql("UPDATE users SET avatar_filename = 'avatar-gui.png' WHERE id = %s", (gm_id,))

    campaign_a = client.post(
        "/api/campaigns", json={"name": "Campanha do Gui"}, headers=gm
    ).json["campaign"]["id"]
    campaign_b = client.post(
        "/api/campaigns", json={"name": "Campanha da Paula"}, headers=p2
    ).json["campaign"]["id"]
    code_a = client.get(f"/api/campaigns/{campaign_a}", headers=gm).json["campaign"]["invite_code"]
    code_b = client.get(f"/api/campaigns/{campaign_b}", headers=p2).json["campaign"]["invite_code"]
    client.post("/api/campaigns/join", json={"invite_code": code_a}, headers=p1)
    client.post("/api/campaigns/join", json={"invite_code": code_b}, headers=gm)

    sql(
        "INSERT INTO maps (campaign_id, name, filename) VALUES (%s, 'Mapa', 'mapa-a.png')",
        (campaign_a,),
    )
    sql(
        """
        INSERT INTO tokens (campaign_id, owner_id, name, image_filename)
        VALUES (%s, %s, 'Token Pedro', 'tok-pedro.png'),
               (%s, %s, 'Token Gui', 'tok-gui.png')
        """,
        (campaign_a, p1_id, campaign_b, gm_id),
    )
    sql(
        "INSERT INTO tokens (campaign_id, owner_id, name) VALUES (%s, %s, 'Token Paula')",
        (campaign_b, p2_id),
    )
    sql(
        """
        INSERT INTO messages (campaign_id, user_id, content)
        VALUES (%s, %s, 'oi do Gui'), (%s, %s, 'oi da Paula')
        """,
        (campaign_b, gm_id, campaign_b, p2_id),
    )

    assert client.delete("/api/me", json={"password": ""}, headers=gm).status_code == 400
    assert client.delete("/api/me", json={"password": WRONG}, headers=gm).status_code == 403

    # Mestre de campanha: precisa confirmar que as campanhas serão apagadas.
    response = client.delete("/api/me", json={"password": "senha1234"}, headers=gm)
    assert response.status_code == 409
    assert response.json["campaigns"] == [
        {"id": campaign_a, "name": "Campanha do Gui", "player_count": 1}
    ]
    assert client.get("/api/me", headers=gm).status_code == 200

    emails_before = len(emails)
    response = client.delete(
        "/api/me",
        json={"password": "senha1234", "delete_campaigns": True},
        headers=gm,
    )
    assert response.status_code == 200, response.json
    assert client.get("/api/me", headers=gm).status_code == 401
    assert sql("SELECT id FROM users WHERE id = %s", (gm_id,)) == []
    assert sql("SELECT id FROM campaigns WHERE id = %s", (campaign_a,)) == []
    assert [row["name"] for row in sql("SELECT name FROM tokens ORDER BY name")] == ["Token Paula"]
    assert [row["content"] for row in sql("SELECT content FROM messages")] == ["oi da Paula"]
    assert client.get(f"/api/campaigns/{campaign_b}", headers=p2).json["members"] == [
        {"id": p2_id, "name": "Paula", "role": "gm"}
    ]
    assert sorted(deleted_files) == [
        ("avatars", "avatar-gui.png"),
        ("maps", "mapa-a.png"),
        ("tokens", "tok-gui.png"),
        ("tokens", "tok-pedro.png"),
    ]

    # O e-mail de despedida sai em segundo plano.
    deadline = time.time() + 20

    while len(emails) == emails_before and time.time() < deadline:
        time.sleep(0.2)

    assert emails[-1][0] == "gui@teste.local"
    assert "Conta excluída" in emails[-1][1]

    # Jogador: sem confirmação extra.
    assert client.delete("/api/me", json={"password": "senha1234"}, headers=p1).status_code == 200

    for _ in range(5):
        client.delete("/api/me", json={"password": WRONG}, headers=p2)

    assert client.delete("/api/me", json={"password": "senha1234"}, headers=p2).status_code == 429


def test_limpeza_automatica(register, sql):
    _, ana_id, _ = register("Ana", "ana@teste.local")
    sql("DELETE FROM rate_limit_events")
    sql("DELETE FROM auth_tokens")
    sql("DELETE FROM password_reset_tokens")

    old_user = sql(
        """
        INSERT INTO users (name, email, password_hash, created_at)
        VALUES ('Velho', 'velho@teste.local', 'x', now() - interval '8 days')
        RETURNING id
        """
    )[0]["id"]
    sql(
        "INSERT INTO users (name, email, password_hash) VALUES ('Novo', 'novo-nc@teste.local', 'x')"
    )
    # Conta confirmada antiga não é apagada.
    sql("UPDATE users SET created_at = now() - interval '30 days' WHERE id = %s", (ana_id,))
    sql(
        """
        INSERT INTO auth_tokens (user_id, token_hash, expires_at)
        VALUES (%s, 'vencido', '2020-01-01T00:00:00+00:00'),
               (%s, 'valido', '2099-01-01T00:00:00+00:00')
        """,
        (ana_id, ana_id),
    )
    sql(
        """
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (%s, 'r-vencido', now() - interval '1 minute'),
               (%s, 'r-valido', now() + interval '1 hour')
        """,
        (ana_id, ana_id),
    )
    sql(
        """
        INSERT INTO rate_limit_events (key, created_at)
        VALUES ('velho', now() - interval '2 days'), ('recente', now())
        """
    )

    assert manutencao.purge_expired_data() == {
        "tokens de login": 1,
        "tokens de recuperação de senha": 1,
        "registros de tentativas": 1,
        "contas não confirmadas": 1,
    }
    assert [row["token_hash"] for row in sql("SELECT token_hash FROM auth_tokens")] == ["valido"]
    assert [row["token_hash"] for row in sql("SELECT token_hash FROM password_reset_tokens")] == ["r-valido"]
    assert [row["key"] for row in sql("SELECT key FROM rate_limit_events")] == ["recente"]
    assert sql("SELECT id FROM users WHERE id = %s", (old_user,)) == []
    assert len(sql(
        "SELECT id FROM users WHERE email IN ('novo-nc@teste.local', 'ana@teste.local')"
    )) == 2

    assert manutencao.purge_expired_data() == {
        "tokens de login": 0,
        "tokens de recuperação de senha": 0,
        "registros de tentativas": 0,
        "contas não confirmadas": 0,
    }
