"""LGPD: aceite da Política de Privacidade e exportação dos dados."""

import json


def test_cadastro_exige_aceite_da_politica(client, sql):
    account = {"name": "Ana", "email": "ana@teste.local", "password": "senha1234"}

    for consent in ({}, {"accept_privacy": False}, {"accept_privacy": "true"}):
        response = client.post("/api/register", json={**account, **consent})
        assert response.status_code == 400
        assert "Política de Privacidade" in response.json["error"]

    assert sql("SELECT id FROM users") == []

    response = client.post("/api/register", json={**account, "accept_privacy": True})
    assert response.status_code == 201, response.json
    assert sql("SELECT privacy_accepted_at FROM users")[0]["privacy_accepted_at"] is not None


def test_exportacao_dos_dados_pessoais(client, register, campaign, sql):
    gm, gm_id, _ = register("Mestre", "mestre@teste.local")
    ana, ana_id, _ = register("Ana", "ana@teste.local")
    bia, _, _ = register("Bia", "bia@teste.local")
    campaign_id = campaign(gm, [ana, bia])

    assert client.get("/api/me/export").status_code == 401

    session_id = client.post(
        f"/api/campaigns/{campaign_id}/sessions",
        json={"title": "Sessão 1", "scheduled_at": "2099-01-10T19:00"},
        headers=gm,
    ).json["session_id"]
    client.put(
        f"/api/sessions/{session_id}/attendance",
        json={"status": "confirmado"},
        headers=ana,
    )
    character = client.post(
        f"/api/campaigns/{campaign_id}/characters", json={"name": "Lyra"}, headers=ana
    ).json["character"]
    client.post(
        f"/api/campaigns/{campaign_id}/tokens",
        json={"character_id": character["id"]},
        headers=ana,
    )
    client.post(
        f"/api/campaigns/{campaign_id}/rolls",
        json={"expression": "1d20+3", "label": "Iniciativa"},
        headers=ana,
    )
    sql(
        """
        INSERT INTO messages (campaign_id, user_id, content)
        VALUES (%s, %s, 'mensagem da Ana'), (%s, %s, 'mensagem do mestre')
        """,
        (campaign_id, ana_id, campaign_id, gm_id),
    )

    response = client.get("/api/me/export", headers=ana)
    assert response.status_code == 200
    data = response.json

    assert data["profile"]["id"] == ana_id
    assert data["profile"]["email"] == "ana@teste.local"
    assert data["profile"]["email_verified"] is True
    assert data["profile"]["privacy_accepted_at"]
    assert data["campaigns"][0]["name"] == "Masmorra"
    assert data["campaigns"][0]["role"] == "player"
    assert [(item["title"], item["status"]) for item in data["session_attendance"]] == [
        ("Sessão 1", "confirmado")
    ]
    assert [item["name"] for item in data["characters"]] == ["Lyra"]
    assert data["characters"][0]["data"]["player_name"] == "Ana"
    assert [item["name"] for item in data["tokens"]] == ["Lyra"]
    assert [item["kind"] for item in data["messages"]] == ["roll", "message"]
    assert data["messages"][0]["roll"]["expression"] == "1d20+3"
    assert data["messages"][1]["content"] == "mensagem da Ana"
    assert len(data["login_sessions"]) == 1

    # Só os dados da própria pessoa, e nenhum segredo.
    exported = json.dumps(data)
    assert "mensagem do mestre" not in exported
    assert "mestre@teste.local" not in exported
    assert "bia@teste.local" not in exported
    assert "password" not in exported
    assert "token_hash" not in exported
    assert "verification" not in exported
