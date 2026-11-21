"""Enquetes de disponibilidade para marcar sessões."""

from datetime import date, timedelta


def test_enquete_de_disponibilidade(client, register, campaign, sql):
    gm, gm_id, _ = register("Mestre", "gm@teste.local")
    p1, p1_id, _ = register("Ana", "ana@teste.local")
    p2, _, _ = register("Bia", "bia@teste.local")
    campaign_id = campaign(gm, [p1])
    other = campaign(p2, name="Outra")

    d1 = (date.today() + timedelta(days=1)).isoformat()
    d3 = (date.today() + timedelta(days=3)).isoformat()
    base = {
        "title": "Sessão 4", "start_date": d1, "end_date": d3,
        "start_hour": 18, "end_hour": 22,
    }
    url = f"/api/campaigns/{campaign_id}/polls"

    # Criação e validações.
    assert client.post(url, json=base, headers=p1).status_code == 403

    for invalid in [
        {**base, "title": " "},
        {**base, "start_date": (date.today() - timedelta(days=1)).isoformat()},
        {**base, "end_date": (date.today() + timedelta(days=40)).isoformat()},
        {**base, "end_date": date.today().isoformat()},
        {**base, "start_hour": 22, "end_hour": 22},
        {**base, "end_hour": 25},
        {**base, "start_hour": "18"},
        {**base, "start_date": "20/11/2026"},
    ]:
        response = client.post(url, json=invalid, headers=gm)
        assert response.status_code == 400, (invalid, response.json)

    response = client.post(url, json=base, headers=gm)
    assert response.status_code == 201, response.json
    poll_id = response.json["poll"]["id"]

    # Listagem e acesso só para membros.
    polls = client.get(url, headers=p1).json["polls"]
    assert len(polls) == 1
    assert polls[0]["respondent_count"] == 0 and polls[0]["member_count"] == 2
    assert client.get(url, headers=p2).status_code == 404
    assert client.get(f"/api/polls/{poll_id}", headers=p2).status_code == 404

    # Marcação de disponibilidade.
    availability = f"/api/polls/{poll_id}/availability"
    today = date.today().isoformat()

    for invalid in (
        [f"{d1}T17:00"],   # antes da faixa
        [f"{d1}T22:00"],   # a hora final é exclusiva
        [f"{today}T19:00"],
        "x",
        [19],
    ):
        response = client.put(availability, json={"slots": invalid}, headers=p1)
        assert response.status_code == 400, invalid

    assert client.put(availability, json={"slots": []}, headers=p2).status_code == 404

    response = client.put(availability, json={"slots": [
        f"{d1}T19:00", f"{d1}T20:00", f"{d1}T19:00", f"{d3}T21:00"
    ]}, headers=p1)
    assert response.status_code == 200
    assert response.json["slots"] == [f"{d1}T19:00", f"{d1}T20:00", f"{d3}T21:00"]

    # Uma nova marcação substitui a anterior.
    response = client.put(
        availability, json={"slots": [f"{d1}T19:00", f"{d1}T20:00"]}, headers=p1
    )
    assert response.json["slots"] == [f"{d1}T19:00", f"{d1}T20:00"]
    assert client.put(
        availability, json={"slots": [f"{d1}T19:00"]}, headers=gm
    ).status_code == 200

    data = client.get(f"/api/polls/{poll_id}", headers=p1).json
    assert data["availability"] == {
        str(gm_id): [f"{d1}T19:00"],
        str(p1_id): [f"{d1}T19:00", f"{d1}T20:00"],
    }
    assert data["role"] == "player"
    assert [member["name"] for member in data["members"]] == ["Mestre", "Ana"]
    assert client.get(url, headers=gm).json["polls"][0]["respondent_count"] == 2

    # Encerramento e ligação com a sessão marcada.
    poll_url = f"/api/polls/{poll_id}"
    assert client.put(poll_url, json={"status": "encerrada"}, headers=p1).status_code == 403
    assert client.put(poll_url, json={"status": "x"}, headers=gm).status_code == 400

    session_id = client.post(
        f"/api/campaigns/{campaign_id}/sessions",
        json={"title": "Sessão 4", "scheduled_at": f"{d1}T19:00"},
        headers=gm,
    ).json["session_id"]
    other_session = client.post(
        f"/api/campaigns/{other}/sessions",
        json={"title": "X", "scheduled_at": f"{d1}T19:00"},
        headers=p2,
    ).json["session_id"]

    assert client.put(poll_url, json={"session_id": other_session}, headers=gm).status_code == 404
    assert client.put(poll_url, json={"session_id": "1"}, headers=gm).status_code == 404

    response = client.put(
        poll_url, json={"status": "encerrada", "session_id": session_id}, headers=gm
    )
    assert response.status_code == 200
    assert response.json["poll"]["status"] == "encerrada"
    assert response.json["poll"]["session_id"] == session_id
    assert client.put(availability, json={"slots": []}, headers=p1).status_code == 400

    response = client.put(poll_url, json={"status": "aberta"}, headers=gm)
    assert response.json["poll"]["session_id"] == session_id

    # Quem sai da campanha some da enquete.
    assert client.delete(
        f"/api/campaigns/{campaign_id}/members/{p1_id}", headers=p1
    ).status_code == 200
    assert str(p1_id) not in client.get(poll_url, headers=gm).json["availability"]
    assert sql(
        "SELECT COUNT(*) AS n FROM availability_slots WHERE user_id = %s", (p1_id,)
    )[0]["n"] == 0
    assert client.get(url, headers=gm).json["polls"][0]["respondent_count"] == 1

    # Exclusão da enquete e dos horários.
    assert client.delete(poll_url, headers=p2).status_code == 404
    assert client.delete(poll_url, headers=gm).status_code == 200
    assert client.get(poll_url, headers=gm).status_code == 404
    assert sql("SELECT COUNT(*) AS n FROM availability_slots")[0]["n"] == 0
