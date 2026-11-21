"""Tokens presos à grade do mapa ativo e leitura do tamanho das imagens."""

import io
import struct

from extensoes import socketio
from imagens import read_image_size


def png(width, height):
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + struct.pack(">II", width, height)
        + b"\x08\x06\x00\x00\x00" + b"\x00" * 16
    )


def gif(width, height):
    return b"GIF89a" + struct.pack("<HH", width, height) + b"\x00" * 16


def jpeg(width, height):
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
    sof0 = (
        b"\xff\xc0" + struct.pack(">H", 17) + b"\x08"
        + struct.pack(">HH", height, width) + b"\x03" + b"\x00" * 9
    )
    return b"\xff\xd8" + app0 + sof0 + b"\xff\xd9"


def webp(chunk, payload):
    body = b"WEBP" + chunk + struct.pack("<I", len(payload)) + payload
    return b"RIFF" + struct.pack("<I", len(body)) + body


def test_le_o_tamanho_das_imagens():
    assert read_image_size(png(400, 300), ".png") == (400, 300)
    assert read_image_size(gif(640, 480), ".gif") == (640, 480)
    assert read_image_size(jpeg(1920, 1080), ".jpg") == (1920, 1080)

    # WEBP com perda (VP8), sem perda (VP8L) e estendido (VP8X).
    vp8 = b"\x00" * 3 + b"\x9d\x01\x2a" + struct.pack("<HH", 800, 600) + b"\x00" * 4
    assert read_image_size(webp(b"VP8 ", vp8), ".webp") == (800, 600)

    bits = (1024 - 1) | ((768 - 1) << 14)
    vp8l = b"\x2f" + struct.pack("<I", bits) + b"\x00" * 4
    assert read_image_size(webp(b"VP8L", vp8l), ".webp") == (1024, 768)

    vp8x = b"\x00" * 4 + (2000 - 1).to_bytes(3, "little") + (1500 - 1).to_bytes(3, "little")
    assert read_image_size(webp(b"VP8X", vp8x), ".webp") == (2000, 1500)

    # Cabeçalho cortado ou estranho: tamanho desconhecido, sem erro.
    assert read_image_size(b"\xff\xd8\xff", ".jpg") is None
    assert read_image_size(b"\xff\xd8garbage-garbage", ".jpg") is None
    assert read_image_size(webp(b"ABCD", b"\x00" * 10), ".webp") is None


def test_tokens_ficam_dentro_da_grade(app, client, register, campaign, sql):
    gm, _, gm_token = register("Mestre", "mestre@teste.local")
    ana, _, _ = register("Ana", "ana@teste.local")
    campaign_id = campaign(gm, [ana])
    tokens_url = f"/api/campaigns/{campaign_id}/tokens"

    # Sem mapa ativo vale a área padrão de 30 x 20 quadrados.
    response = client.post(
        tokens_url, json={"name": "Goblin", "x": 40, "y": 25}, headers=gm
    )
    assert response.status_code == 201, response.json
    token = response.json["token"]
    assert (token["x"], token["y"]) == (29, 19)

    socket_client = socketio.test_client(
        app, flask_test_client=client, auth={"token": gm_token}
    )

    def move(x, y, size=None):
        payload = {"token_id": token["id"], "x": x, "y": y}

        if size is not None:
            payload["size"] = size

        socket_client.get_received()
        assert socket_client.emit("token:mover", payload, callback=True) == {"ok": True}
        moved = [
            item["args"][0]
            for item in socket_client.get_received()
            if item["name"] == "token:movido"
        ]
        row = sql("SELECT x, y, size FROM tokens WHERE id = %s", (token["id"],))[0]
        # Todos recebem a posição final gravada.
        assert moved == [{"id": token["id"], **row}]
        return row["x"], row["y"]

    try:
        assert socket_client.emit(
            "mesa:entrar", {"campaign_id": campaign_id}, callback=True
        ) == {"ok": True}

        assert move(5, 5) == (5, 5)
        assert move(100, 3) == (29, 3)
        # Posição negativa é recusada.
        assert socket_client.emit(
            "token:mover", {"token_id": token["id"], "x": -1, "y": 3}, callback=True
        ) == {"error": "Posição inválida."}

        # Mapa de 400 x 300 px com quadrados de 50 px: grade de 8 x 6.
        response = client.post(
            f"/api/campaigns/{campaign_id}/maps",
            data={
                "name": "Caverna",
                "grid_size": "50",
                "file": (io.BytesIO(png(400, 300)), "caverna.png"),
            },
            headers=gm,
            content_type="multipart/form-data",
        )
        assert response.status_code == 201, response.json
        map_id = response.json["map"]["id"]
        assert sql(
            "SELECT image_width, image_height FROM maps WHERE id = %s", (map_id,)
        )[0] == {"image_width": 400, "image_height": 300}

        assert client.put(
            f"/api/campaigns/{campaign_id}/active-map",
            json={"map_id": map_id},
            headers=gm,
        ).status_code == 200
        assert move(20, 20) == (7, 5)

        # Mapa deslocado e esticado pelo mestre: a grade cobre a imagem.
        assert client.put(
            f"/api/maps/{map_id}",
            json={"x": 100, "y": 0, "width": 600, "height": 120},
            headers=gm,
        ).status_code == 200
        assert move(20, 20) == (13, 2)

        # Grade definida pelo mestre: 3 colunas x 50 linhas.
        assert client.put(
            f"/api/maps/{map_id}",
            json={"grid_columns": 3, "grid_rows": 50},
            headers=gm,
        ).status_code == 200
        assert move(10, 40, size=2) == (2, 40)

        # Mapa antigo, sem o tamanho da imagem: só o limite geral.
        sql(
            """
            UPDATE maps SET grid_columns = NULL, grid_rows = NULL,
                width = NULL, height = NULL,
                image_width = NULL, image_height = NULL
            WHERE id = %s
            """,
            (map_id,),
        )
        assert move(300, 300) == (300, 300)

        # O mapa ativo também limita os tokens novos.
        sql(
            "UPDATE maps SET image_width = 400, image_height = 300, x = 0 WHERE id = %s",
            (map_id,),
        )
        response = client.post(
            tokens_url, json={"name": "Orc", "x": 50, "y": 50}, headers=gm
        )
        assert (response.json["token"]["x"], response.json["token"]["y"]) == (7, 5)

    finally:
        socket_client.disconnect()
