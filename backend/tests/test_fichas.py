"""Fichas de D&D 5e: acesso, normalização, rolagens, PV e token vinculado."""

import personagens
from extensoes import socketio


def received(socket_client, event):
    return [
        item["args"][0]
        for item in socket_client.get_received()
        if item["name"] == event
    ]


def test_fichas_de_personagem(app, client, register, campaign, sql, monkeypatch):
    deleted_files = []
    monkeypatch.setattr(
        personagens,
        "delete_image_file",
        lambda folder, name: name and deleted_files.append((folder, name)),
    )

    gm, _, gm_token = register("Mestre", "mestre@teste.local")
    ana, ana_id, ana_token = register("Ana", "ana@teste.local")
    bia, bia_id, bia_token = register("Bia", "bia@teste.local")
    outsider, _, _ = register("Fora", "fora@teste.local")
    campaign_id = campaign(gm, [ana, bia])
    characters_url = f"/api/campaigns/{campaign_id}/characters"

    # 1. Criação com a ficha padrão completa.
    assert client.post(characters_url, json={"name": " "}, headers=ana).status_code == 400
    assert client.post(characters_url, json={"name": "X"}, headers=outsider).status_code == 404

    response = client.post(characters_url, json={"name": "Lyra"}, headers=ana)
    assert response.status_code == 201, response.json
    lyra = response.json["character"]
    sheet = lyra["data"]
    assert sheet["level"] == 1 and sheet["abilities"]["str"] == 10
    assert sheet["player_name"] == "Ana"
    assert len(sheet["skills"]) == 18
    assert sheet["spell_slots"]["9"] == {"total": 0, "used": 0}

    npc = client.post(characters_url, json={"name": "Goblin chefe"}, headers=gm).json["character"]
    bran = client.post(characters_url, json={"name": "Bran"}, headers=bia).json["character"]

    # 2. Só o dono e o mestre veem a ficha.
    lyra_url = f"/api/characters/{lyra['id']}"
    assert client.get(lyra_url, headers=ana).status_code == 200
    assert client.get(lyra_url, headers=gm).json["character"]["viewer_role"] == "gm"
    assert client.get(lyra_url, headers=bia).status_code == 404
    assert client.get(lyra_url, headers=outsider).status_code == 404

    def names(url, headers):
        return [item["name"] for item in client.get(url, headers=headers).json["characters"]]

    assert names(characters_url, gm) == ["Bran", "Goblin chefe", "Lyra"]
    assert names(characters_url, ana) == ["Lyra"]
    assert names("/api/characters", ana) == ["Lyra"]
    assert client.get("/api/characters", headers=ana).json["characters"][0]["campaign_name"] == "Masmorra"

    # 3. Ao salvar, os valores são limitados e campos estranhos descartados.
    edited = dict(sheet)
    edited.update({
        "level": 99,
        "abilities": {**sheet["abilities"], "dex": 16, "str": "abc"},
        "hp_max": 30, "hp_current": 22, "hp_temp": 5,
        "skills": {**sheet["skills"], "stealth": 2, "arcana": 7},
        "attacks": [
            {"name": "Arco", "ability": "dex", "damage": "1d8", "evil": True},
            {"name": "X", "damage": "__import__('os')"},
        ],
        "spells": [{
            "level": 3, "name": "Bola de Fogo", "roll": "save",
            "damage": "8d6", "save_ability": "dex",
        }],
        "conditions": ["prone", "prone", "voando"],
        "hack": "x",
    })
    response = client.put(lyra_url, json={"name": "Lyra Vento", "data": edited}, headers=ana)
    assert response.status_code == 200, response.json
    saved = response.json["character"]["data"]
    assert saved["level"] == 20
    assert saved["abilities"]["dex"] == 16 and saved["abilities"]["str"] == 10
    assert saved["skills"]["stealth"] == 2 and saved["skills"]["arcana"] == 0
    assert saved["attacks"][0]["damage"] == "1d8"
    assert "evil" not in saved["attacks"][0] and saved["attacks"][0]["id"]
    assert saved["attacks"][1]["damage"] == ""
    assert saved["conditions"] == ["prone"] and "hack" not in saved
    assert saved["spells"][0]["name"] == "Bola de Fogo"
    assert saved["spells"][0]["concentration"] is False

    assert client.put(lyra_url, json={"name": "Hack", "data": edited}, headers=bia).status_code == 404
    assert client.put(
        lyra_url, json={"name": "Lyra Vento", "data": {**saved, "hp_current": 18}}, headers=gm
    ).status_code == 200
    assert client.put(
        lyra_url, json={"name": "x", "data": {"features": "a" * 500_000}}, headers=ana
    ).status_code == 400

    # 4. Rolagens pela ficha e rolagens só para o mestre.
    sockets = {
        name: socketio.test_client(app, flask_test_client=client, auth={"token": token})
        for name, token in (("gm", gm_token), ("ana", ana_token), ("bia", bia_token))
    }

    try:
        for socket_client in sockets.values():
            assert socket_client.emit(
                "mesa:entrar", {"campaign_id": campaign_id}, callback=True
            ) == {"ok": True}
            socket_client.get_received()

        rolls_url = f"/api/campaigns/{campaign_id}/rolls"
        assert client.post(rolls_url, json={"expression": "1d20+5"}, headers=outsider).status_code == 404
        assert client.post(rolls_url, json={"expression": "rm -rf"}, headers=ana).status_code == 400

        response = client.post(rolls_url, json={
            "expression": "2d20kh1+6", "label": "Lyra: Furtividade (vantagem)"
        }, headers=ana)
        assert response.status_code == 201, response.json
        message = response.json["message"]
        term = message["roll"]["terms"][0]
        assert len(term["values"]) == 2 and term["kept"] == [max(term["values"])]
        assert message["roll"]["total"] == max(term["values"]) + 6

        def ids(name):
            return [item["id"] for item in received(sockets[name], "chat:mensagem")]

        assert ids("gm") == [message["id"]] and ids("bia") == [message["id"]]
        assert ids("ana")

        private = client.post(rolls_url, json={
            "expression": "1d20+2", "label": "Lyra: Intuição", "private": True
        }, headers=ana).json["message"]
        assert private["private"] is True
        assert ids("gm") == [private["id"]] and ids("ana") == [private["id"]]
        assert ids("bia") == []

        def table(headers):
            return client.get(f"/api/campaigns/{campaign_id}/table", headers=headers).json

        assert private["id"] in [item["id"] for item in table(gm)["messages"]]
        assert private["id"] in [item["id"] for item in table(ana)["messages"]]
        assert private["id"] not in [item["id"] for item in table(bia)["messages"]]

        assert sockets["bia"].emit("dados:rolar", {
            "campaign_id": campaign_id, "expression": "1d20", "private": True
        }, callback=True) == {"ok": True}
        assert len(ids("bia")) == 1 and len(ids("gm")) == 1 and ids("ana") == []

        # 5. Os PV só vão para o dono da ficha e para o mestre.
        seen_by_bia = {item["id"]: item for item in table(bia)["characters"]}
        assert seen_by_bia[lyra["id"]]["name"] == "Lyra Vento"
        assert seen_by_bia[lyra["id"]]["hp_current"] is None
        assert seen_by_bia[bran["id"]]["hp_current"] == 10
        assert {item["id"]: item for item in table(ana)["characters"]}[lyra["id"]]["hp_current"] == 18
        assert {item["id"]: item for item in table(gm)["characters"]}[npc["id"]]["hp_max"] == 10

        for socket_client in sockets.values():
            socket_client.get_received()

        assert client.put(
            lyra_url, json={"name": "Lyra Vento", "data": {**saved, "hp_current": 9}}, headers=ana
        ).status_code == 200

        def hp_updates(name):
            return [item["hp_current"] for item in received(sockets[name], "personagem:atualizado")]

        assert hp_updates("bia") == [None]
        assert 9 in hp_updates("ana") and 9 in hp_updates("gm")

        # 6. Token vinculado à ficha pertence ao dono da ficha.
        tokens_url = f"/api/campaigns/{campaign_id}/tokens"
        assert client.post(tokens_url, json={"character_id": lyra["id"]}, headers=bia).status_code == 404
        assert client.post(tokens_url, json={"character_id": 999999}, headers=gm).status_code == 404
        assert client.post(tokens_url, json={"character_id": "1"}, headers=gm).status_code == 404

        response = client.post(
            tokens_url, json={"character_id": lyra["id"], "x": 2, "y": 2}, headers=ana
        )
        assert response.status_code == 201
        token = response.json["token"]
        assert token["character_id"] == lyra["id"] and token["name"] == "Lyra Vento"
        assert token["owner_id"] == ana_id

        response = client.post(
            tokens_url, json={"character_id": bran["id"], "name": "Bran no mapa"}, headers=gm
        )
        assert response.status_code == 201
        assert response.json["token"]["owner_id"] == bia_id
        assert response.json["token"]["name"] == "Bran no mapa"

        # 7. Excluir ficha ou sair da campanha apaga fichas e retratos.
        sql("UPDATE characters SET image_filename = 'retrato-bran.png' WHERE id = %s", (bran["id"],))
        sql("UPDATE characters SET image_filename = 'retrato-npc.png' WHERE id = %s", (npc["id"],))
        assert client.delete(f"/api/characters/{npc['id']}", headers=ana).status_code == 404
        assert client.delete(f"/api/characters/{npc['id']}", headers=gm).status_code == 200
        assert ("characters", "retrato-npc.png") in deleted_files

        for socket_client in sockets.values():
            socket_client.get_received()

        assert client.delete(
            f"/api/campaigns/{campaign_id}/members/{bia_id}", headers=bia
        ).status_code == 200
        assert sql("SELECT id FROM characters WHERE owner_id = %s", (bia_id,)) == []
        assert ("characters", "retrato-bran.png") in deleted_files
        assert received(sockets["gm"], "personagem:removido")
        assert sql(
            "SELECT character_id FROM tokens WHERE name = 'Bran no mapa'"
        )[0]["character_id"] is None

    finally:
        for socket_client in sockets.values():
            if socket_client.is_connected():
                socket_client.disconnect()
