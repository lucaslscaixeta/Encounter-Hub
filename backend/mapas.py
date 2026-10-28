from flask import Blueprint, g, jsonify, request
from autenticacao import login_required
from banco import get_connection, get_member_role
from extensoes import campaign_room, socketio
from imagens import (
    StorageError,
    delete_image_file,
    public_url,
    save_uploaded_image,
)


maps_bp = Blueprint("maps", __name__)

# Pasta dos mapas dentro do bucket do Supabase Storage.
MAPS_FOLDER = "maps"
MAX_MAP_SIZE = 10 * 1024 * 1024

# Limites da posição e do tamanho do mapa na mesa, em pixels.
MAX_MAP_OFFSET = 60000
MIN_MAP_DIMENSION = 20
MAX_MAP_DIMENSION = 60000

# Limite da grade em quadrados (também limita a posição dos tokens).
MAX_GRID_CELLS = 200


def serialize_map(row):
    if row is None:
        return None

    # width/height nulos = tamanho original da imagem.
    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "name": row["name"],
        "grid_size": row["grid_size"],
        "x": row["x"],
        "y": row["y"],
        "width": row["width"],
        "height": row["height"],
        "grid_columns": row["grid_columns"],
        "grid_rows": row["grid_rows"],
        "url": public_url(MAPS_FOLDER, row["filename"])
    }


def delete_map_file(filename):
    delete_image_file(MAPS_FOLDER, filename)


def read_int_in_range(value, minimum, maximum):
    if isinstance(value, bool):
        return None

    try:
        number = round(float(value))
    except (TypeError, ValueError, OverflowError):
        return None

    return number if minimum <= number <= maximum else None


def read_grid_size(value):
    try:
        grid_size = int(value)
    except (TypeError, ValueError):
        return None

    return grid_size if 10 <= grid_size <= 300 else None


def get_map_with_role(connection, map_id):
    row = connection.execute(
        "SELECT * FROM maps WHERE id = %s",
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
        WHERE campaigns.id = %s
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



@maps_bp.route("/api/campaigns/<int:campaign_id>/maps", methods=["GET"])
@login_required
def list_maps(campaign_id):
    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        rows = connection.execute(
            """
            SELECT * FROM maps WHERE campaign_id = %s
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

    if grid_size is None:
        return jsonify({
            "error": "O tamanho da grade deve ficar entre 10 e 300 pixels."
        }), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode enviar mapas."
            }), 403

    try:
        filename = save_uploaded_image(file, MAPS_FOLDER, MAX_MAP_SIZE)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except StorageError as error:
        print(f"Erro ao enviar mapa para o Storage: {error}")
        return jsonify({
            "error": "Não foi possível salvar o mapa. Tente novamente."
        }), 502

    name = (name or file.filename.rsplit(".", 1)[0])[:80]

    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO maps (campaign_id, name, filename, grid_size)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (campaign_id, name, filename, grid_size)
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

        # Posição e tamanho da imagem na mesa (o mestre ajusta arrastando).
        x = read_int_in_range(
            data.get("x", row["x"]), -MAX_MAP_OFFSET, MAX_MAP_OFFSET
        )
        y = read_int_in_range(
            data.get("y", row["y"]), -MAX_MAP_OFFSET, MAX_MAP_OFFSET
        )

        if x is None or y is None:
            return jsonify({"error": "Posição do mapa inválida."}), 400

        width = data.get("width", row["width"])
        height = data.get("height", row["height"])

        # Os dois nulos voltam o mapa ao tamanho original da imagem.
        if width is not None or height is not None:
            width = read_int_in_range(
                width, MIN_MAP_DIMENSION, MAX_MAP_DIMENSION
            )
            height = read_int_in_range(
                height, MIN_MAP_DIMENSION, MAX_MAP_DIMENSION
            )

            if width is None or height is None:
                return jsonify({
                    "error": (
                        f"O mapa deve ter entre {MIN_MAP_DIMENSION} e "
                        f"{MAX_MAP_DIMENSION} pixels de largura e altura."
                    )
                }), 400

        grid_columns = data.get("grid_columns", row["grid_columns"])
        grid_rows = data.get("grid_rows", row["grid_rows"])

        # Os dois nulos = a grade acompanha o tamanho da imagem.
        if grid_columns is not None or grid_rows is not None:
            grid_columns = read_int_in_range(grid_columns, 1, MAX_GRID_CELLS)
            grid_rows = read_int_in_range(grid_rows, 1, MAX_GRID_CELLS)

            if grid_columns is None or grid_rows is None:
                return jsonify({
                    "error": (
                        "A grade deve ter entre 1 e "
                        f"{MAX_GRID_CELLS} quadrados de largura e altura."
                    )
                }), 400

        connection.execute(
            """
            UPDATE maps
            SET name = %s, grid_size = %s, x = %s, y = %s, width = %s, height = %s,
                grid_columns = %s, grid_rows = %s
            WHERE id = %s
            """,
            (
                name.strip()[:80], grid_size, x, y, width, height,
                grid_columns, grid_rows, map_id
            )
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

        connection.execute("DELETE FROM maps WHERE id = %s", (map_id,))
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

    if map_id is not None and (
        not isinstance(map_id, int) or isinstance(map_id, bool)
    ):
        return jsonify({"error": "Mapa não encontrado."}), 404

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) != "gm":
            return jsonify({
                "error": "Apenas o mestre pode trocar o mapa da mesa."
            }), 403

        if map_id is not None:
            exists = connection.execute(
                "SELECT 1 FROM maps WHERE id = %s AND campaign_id = %s",
                (map_id, campaign_id)
            ).fetchone()

            if not exists:
                return jsonify({"error": "Mapa não encontrado."}), 404

        connection.execute(
            "UPDATE campaigns SET active_map_id = %s WHERE id = %s",
            (map_id, campaign_id)
        )

        broadcast_active_map(connection, campaign_id)

    return jsonify({"message": "Mapa da mesa atualizado!"}), 200
