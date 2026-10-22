import secrets

from flask import Blueprint, g, jsonify, request, send_from_directory
from autenticacao import login_required
from banco import BASE_DIR, get_connection, get_member_role
from extensoes import campaign_room, socketio


maps_bp = Blueprint("maps", __name__)

UPLOAD_DIR = BASE_DIR / "uploads" / "maps"
MAX_MAP_SIZE = 10 * 1024 * 1024

# Assinatura dos primeiros bytes de cada formato aceito.
IMAGE_SIGNATURES = {
    ".png": lambda header: header.startswith(b"\x89PNG\r\n\x1a\n"),
    ".jpg": lambda header: header.startswith(b"\xff\xd8\xff"),
    ".gif": lambda header: header[:6] in (b"GIF87a", b"GIF89a"),
    ".webp": lambda header: header[:4] == b"RIFF" and header[8:12] == b"WEBP",
}


def serialize_map(row):
    if row is None:
        return None

    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "name": row["name"],
        "grid_size": row["grid_size"],
        "url": f"/uploads/maps/{row['filename']}"
    }


def delete_map_file(filename):
    path = UPLOAD_DIR / filename

    if path.parent == UPLOAD_DIR and path.exists():
        path.unlink()


def detect_image_extension(header):
    for extension, matches in IMAGE_SIGNATURES.items():
        if matches(header):
            return extension

    return None


def read_grid_size(value):
    try:
        grid_size = int(value)
    except (TypeError, ValueError):
        return None

    return grid_size if 10 <= grid_size <= 300 else None


def get_map_with_role(connection, map_id):
    row = connection.execute(
        "SELECT * FROM maps WHERE id = ?",
        (map_id,)
    ).fetchone()

    if row is None:
        return None, None

    return row, get_member_role(connection, row["campaign_id"], g.user["id"])


def get_active_map(connection, campaign_id):
    row = connection.execute(
        """
        SELECT maps.* FROM campaigns
        JOIN maps ON maps.id = campaigns.active_map_id
        WHERE campaigns.id = ?
        """,
        (campaign_id,)
    ).fetchone()

    return serialize_map(row)


def broadcast_active_map(connection, campaign_id):
    socketio.emit(
        "mesa:mapa",
        {"map": get_active_map(connection, campaign_id)},
        to=campaign_room(campaign_id)
    )



@maps_bp.route("/uploads/maps/<path:filename>", methods=["GET"])
def serve_map(filename):
    #Os nomes dos arquivos são aleatórios, então não são adivinháveis.
    return send_from_directory(UPLOAD_DIR, filename)



@maps_bp.route("/api/campaigns/<int:campaign_id>/maps", methods=["GET"])
@login_required
def list_maps(campaign_id):
    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        rows = connection.execute(
            """
            SELECT * FROM maps WHERE campaign_id = ?
            ORDER BY created_at DESC
            """,
            (campaign_id,)
        ).fetchall()

    return jsonify({"maps": [serialize_map(row) for row in rows]}), 200



@maps_bp.route("/api/campaigns/<int:campaign_id>/maps", methods=["POST"])
@login_required
def upload_map(campaign_id):
    file = request.files.get("file")
    name = request.form.get("name", "").strip()
    grid_size = read_grid_size(request.form.get("grid_size", 50))

    if file is None or not file.filename:
        return jsonify({"error": "Selecione a imagem do mapa."}), 400

    if grid_size is None:
        return jsonify({
            "error": "O tamanho da grade deve ficar entre 10 e 300 pixels."
        }), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode enviar mapas."
            }), 403

    content = file.read(MAX_MAP_SIZE + 1)

    if len(content) > MAX_MAP_SIZE:
        return jsonify({"error": "O mapa deve ter no máximo 10 MB."}), 413

    extension = detect_image_extension(content[:12])

    if extension is None:
        return jsonify({
            "error": "Envie uma imagem PNG, JPG, WEBP ou GIF."
        }), 400

    name = (name or file.filename.rsplit(".", 1)[0])[:80]
    filename = f"{secrets.token_hex(16)}{extension}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / filename).write_bytes(content)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO maps (campaign_id, name, filename, grid_size)
            VALUES (?, ?, ?, ?)
            """,
            (campaign_id, name, filename, grid_size)
        )

        row = connection.execute(
            "SELECT * FROM maps WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

    return jsonify({
        "message": "Mapa enviado!",
        "map": serialize_map(row)
    }), 201



@maps_bp.route("/api/maps/<int:map_id>", methods=["PUT"])
@login_required
def update_map(map_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    with get_connection() as connection:
        row, role = get_map_with_role(connection, map_id)

        if row is None or role is None:
            return jsonify({"error": "Mapa não encontrado."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode editar mapas."
            }), 403

        name = data.get("name", row["name"])
        grid_size = read_grid_size(data.get("grid_size", row["grid_size"]))

        if not isinstance(name, str) or not name.strip():
            return jsonify({"error": "Informe o nome do mapa."}), 400

        if grid_size is None:
            return jsonify({
                "error": "O tamanho da grade deve ficar entre 10 e 300 pixels."
            }), 400

        connection.execute(
            "UPDATE maps SET name = ?, grid_size = ? WHERE id = ?",
            (name.strip()[:80], grid_size, map_id)
        )

        broadcast_active_map(connection, row["campaign_id"])

    return jsonify({"message": "Mapa atualizado!"}), 200



@maps_bp.route("/api/maps/<int:map_id>", methods=["DELETE"])
@login_required
def delete_map(map_id):
    with get_connection() as connection:
        row, role = get_map_with_role(connection, map_id)

        if row is None or role is None:
            return jsonify({"error": "Mapa não encontrado."}), 404

        if role != "gm":
            return jsonify({
                "error": "Apenas o mestre pode excluir mapas."
            }), 403

        connection.execute("DELETE FROM maps WHERE id = ?", (map_id,))
        broadcast_active_map(connection, row["campaign_id"])

    delete_map_file(row["filename"])

    return jsonify({"message": "Mapa excluído."}), 200



@maps_bp.route(
    "/api/campaigns/<int:campaign_id>/active-map",
    methods=["PUT"]
)
@login_required
def set_active_map(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    map_id = data.get("map_id")

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode trocar o mapa da mesa."
            }), 403

        if map_id is not None:
            exists = connection.execute(
                "SELECT 1 FROM maps WHERE id = ? AND campaign_id = ?",
                (map_id, campaign_id)
            ).fetchone()

            if not exists:
                return jsonify({"error": "Mapa não encontrado."}), 404

        connection.execute(
            "UPDATE campaigns SET active_map_id = ? WHERE id = ?",
            (map_id, campaign_id)
        )

        broadcast_active_map(connection, campaign_id)

    return jsonify({"message": "Mapa da mesa atualizado!"}), 200
