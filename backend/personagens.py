import json
import re
import secrets

from flask import Blueprint, g, jsonify, request
from psycopg.types.json import Jsonb
from autenticacao import login_required
from banco import get_connection, get_member_role
from extensoes import campaign_room, emit_to_users, socketio
from imagens import (
    StorageError,
    delete_image_file,
    public_url,
    save_uploaded_image,
)


characters_bp = Blueprint("characters", __name__)

CHARACTERS_FOLDER = "characters"
MAX_CHARACTER_IMAGE_SIZE = 5 * 1024 * 1024
MAX_SHEET_BYTES = 400 * 1024

ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]

# Perícia -> atributo usado.
SKILLS = {
    "acrobatics": "dex",
    "arcana": "int",
    "athletics": "str",
    "performance": "cha",
    "deception": "cha",
    "stealth": "dex",
    "history": "int",
    "intimidation": "cha",
    "insight": "wis",
    "investigation": "int",
    "animal_handling": "wis",
    "medicine": "wis",
    "nature": "int",
    "perception": "wis",
    "persuasion": "cha",
    "sleight_of_hand": "dex",
    "religion": "int",
    "survival": "wis",
}

CONDITIONS = [
    "blinded", "charmed", "deafened", "frightened", "grappled",
    "incapacitated", "invisible", "paralyzed", "petrified", "poisoned",
    "prone", "restrained", "stunned", "unconscious",
]

DICE_PATTERN = re.compile(r"^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$")


# ===== Estrutura da ficha =====
# Cada campo é uma função que recebe o valor enviado e devolve o valor
# normalizado (ou o padrão, se vier faltando ou inválido).

def Text(max_length, default=""):
    def normalize(value):
        return value[:max_length] if isinstance(value, str) else default
    return normalize


def Int(minimum, maximum, default):
    def normalize(value):
        if isinstance(value, bool):
            return default
        try:
            number = int(float(value))
        except (TypeError, ValueError, OverflowError):
            return default
        return min(max(number, minimum), maximum)
    return normalize


def Number(minimum, maximum, default):
    def normalize(value):
        if isinstance(value, bool):
            return default
        try:
            number = round(float(value), 2)
        except (TypeError, ValueError, OverflowError):
            return default
        return min(max(number, minimum), maximum)
    return normalize


def Bool(default=False):
    def normalize(value):
        return value if isinstance(value, bool) else default
    return normalize


def Choice(options, default):
    def normalize(value):
        return value if value in options else default
    return normalize


def Dice(max_length=40):
    #Expressão de dados como "1d8" ou "2d6+1d4"; inválida vira vazio.
    def normalize(value):
        if not isinstance(value, str):
            return ""
        compact = value.replace(" ", "").lower()[:max_length]
        return compact if DICE_PATTERN.match(compact) else ""
    return normalize


def Obj(fields):
    def normalize(value):
        value = value if isinstance(value, dict) else {}
        return {key: field(value.get(key)) for key, field in fields.items()}
    return normalize


def ListOf(item, max_items):
    def normalize(value):
        if not isinstance(value, list):
            return []
        return [item(entry) for entry in value[:max_items]]
    return normalize


def WithId(fields):
    #Itens de listas recebem um id estável (gerado se vier faltando).
    normalize_fields = Obj(fields)

    def normalize(value):
        entry = normalize_fields(value)
        raw_id = value.get("id") if isinstance(value, dict) else None
        entry["id"] = (
            raw_id[:40] if isinstance(raw_id, str) and raw_id
            else secrets.token_hex(6)
        )
        return entry
    return normalize


def UniqueChoices(options, max_items):
    def normalize(value):
        if not isinstance(value, list):
            return []
        chosen = []
        for entry in value[:max_items]:
            if entry in options and entry not in chosen:
                chosen.append(entry)
        return chosen
    return normalize


ABILITY_OR_NONE = ["none"] + ABILITIES

SHEET = Obj({
    # Cabeçalho
    "level": Int(1, 20, 1),
    "class_level": Text(80),
    "background": Text(80),
    "player_name": Text(80),
    "race": Text(80),
    "alignment": Text(40),
    "xp": Int(0, 10_000_000, 0),
    "inspiration": Bool(),

    # Atributos, testes de resistência e perícias
    # skills: 0 = sem proficiência, 1 = proficiente, 2 = especialização.
    "abilities": Obj({ability: Int(1, 30, 10) for ability in ABILITIES}),
    "saves": Obj({ability: Bool() for ability in ABILITIES}),
    "skills": Obj({skill: Choice([0, 1, 2], 0) for skill in SKILLS}),
    "jack_of_all_trades": Bool(),

    # Combate e vida
    "armor_class": Int(0, 50, 10),
    "initiative_bonus": Int(-20, 20, 0),
    "speed": Text(20, "9 m"),
    "hp_max": Int(0, 9999, 10),
    "hp_current": Int(0, 9999, 10),
    "hp_temp": Int(0, 9999, 0),
    "hit_dice": Text(40, "1d8"),
    "hit_dice_used": Int(0, 40, 0),
    "death_successes": Int(0, 3, 0),
    "death_failures": Int(0, 3, 0),
    "conditions": UniqueChoices(CONDITIONS, len(CONDITIONS)),
    "exhaustion": Int(0, 6, 0),

    "attacks": ListOf(WithId({
        "name": Text(60),
        "ability": Choice(ABILITY_OR_NONE, "str"),
        "proficient": Bool(True),
        "bonus": Int(-20, 20, 0),
        "damage": Dice(),
        "damage_add_ability": Bool(True),
        "damage_type": Text(30),
        "damage2": Dice(),
        "damage2_type": Text(30),
        "crit_range": Int(2, 20, 20),
        "notes": Text(500),
    }), 30),

    "resources": ListOf(WithId({
        "name": Text(60),
        "total": Int(0, 999, 0),
        "used": Int(0, 999, 0),
    }), 20),

    # Textos da página principal
    "proficiencies": Text(5000),
    "features": Text(10000),
    "personality": Text(2000),
    "ideals": Text(2000),
    "bonds": Text(2000),
    "flaws": Text(2000),

    # Equipamento
    "items": ListOf(WithId({
        "name": Text(80),
        "quantity": Int(0, 9999, 1),
        "weight": Number(0, 9999, 0),
        "equipped": Bool(),
        "notes": Text(300),
    }), 200),
    "coins": Obj({coin: Int(0, 1_000_000_000, 0) for coin in ["cp", "sp", "ep", "gp", "pp"]}),

    # Biografia
    "bio": Obj({
        "age": Text(40),
        "height": Text(40),
        "weight": Text(40),
        "eyes": Text(40),
        "skin": Text(40),
        "hair": Text(40),
        "appearance": Text(10000),
        "backstory": Text(10000),
        "allies": Text(10000),
        "other_features": Text(10000),
        "treasure": Text(10000),
    }),

    # Magias
    "spellcasting_class": Text(60),
    "spellcasting_ability": Choice(ABILITY_OR_NONE, "none"),
    "spell_slots": Obj({
        str(level): Obj({"total": Int(0, 20, 0), "used": Int(0, 20, 0)})
        for level in range(1, 10)
    }),
    "spells": ListOf(WithId({
        "level": Int(0, 9, 0),
        "name": Text(80),
        "school": Text(40),
        "casting_time": Text(40),
        "range": Text(40),
        "components": Text(80),
        "duration": Text(60),
        "concentration": Bool(),
        "ritual": Bool(),
        "prepared": Bool(),
        "roll": Choice(["none", "attack", "save"], "none"),
        "save_ability": Choice(ABILITIES, "dex"),
        "damage": Dice(),
        "damage_type": Text(30),
        "higher_levels": Text(1000),
        "description": Text(5000),
    }), 300),

    # Configurações de rolagem
    # roll_mode: "ask" pergunta a cada rolagem se é normal, com vantagem
    # ou com desvantagem.
    "settings": Obj({
        "roll_mode": Choice(["normal", "advantage", "disadvantage", "ask"], "normal"),
        "private_rolls": Bool(),
        "global_attack": Dice(),
        "global_damage": Dice(),
        "global_save": Dice(),
        "global_check": Dice(),
        "track_encumbrance": Bool(True),
    }),
})


def normalize_sheet(data):
    return SHEET(data)


# ===== Acesso e serialização =====

def character_summary(row):
    #Dados resumidos, usados nas listas e na mesa (sem o conteúdo da ficha).
    data = row["data"] or {}

    return {
        "id": row["id"],
        "campaign_id": row["campaign_id"],
        "owner_id": row["owner_id"],
        "name": row["name"],
        "image_url": public_url(CHARACTERS_FOLDER, row["image_filename"]),
        "class_level": data.get("class_level", ""),
        "level": data.get("level", 1),
        "hp_current": data.get("hp_current", 0),
        "hp_max": data.get("hp_max", 0),
        "hp_temp": data.get("hp_temp", 0),
    }


def serialize_character(row, can_edit):
    return {
        **character_summary(row),
        "data": normalize_sheet(row["data"]),
        "can_edit": can_edit,
    }


def delete_character_image(filename):
    delete_image_file(CHARACTERS_FOLDER, filename)


def get_character_access(connection, character_id):
    """Retorna (ficha, papel) se o usuário pode ver a ficha.

    Só o dono e o mestre da campanha têm acesso (os dois podem editar).
    """
    row = connection.execute(
        "SELECT * FROM characters WHERE id = %s",
        (character_id,)
    ).fetchone()

    if row is None:
        return None, None

    role = get_member_role(connection, row["campaign_id"], g.user["id"])

    if role == "gm" or (role is not None and row["owner_id"] == g.user["id"]):
        return row, role

    return None, None


HP_FIELDS = ("hp_current", "hp_max", "hp_temp")


def hide_hp(summary):
    #Os PV só aparecem para o dono da ficha e o mestre.
    return {**summary, **{field: None for field in HP_FIELDS}}


def summary_for(row, viewer_id, viewer_role):
    summary = character_summary(row)

    if viewer_role == "gm" or row["owner_id"] == viewer_id:
        return summary

    return hide_hp(summary)


def broadcast_character(row):
    """Atualiza nome, retrato e PV dos tokens vinculados na mesa.

    Todos recebem o nome e o retrato; só o dono e o mestre recebem os PV.
    """
    summary = character_summary(row)

    socketio.emit(
        "personagem:atualizado",
        hide_hp(summary),
        to=campaign_room(row["campaign_id"])
    )

    with get_connection() as connection:
        gm_id = connection.execute(
            "SELECT owner_id FROM campaigns WHERE id = %s",
            (row["campaign_id"],)
        ).fetchone()["owner_id"]

    emit_to_users(
        "personagem:atualizado",
        summary,
        row["campaign_id"],
        [row["owner_id"], gm_id]
    )


def read_name(value):
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()[:60]



# ===== Rotas =====

@characters_bp.route("/api/characters", methods=["GET"])
@login_required
def list_my_characters():
    #Todas as fichas do usuário, de todas as campanhas ("Suas Fichas").
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT characters.*, campaigns.name AS campaign_name
            FROM characters
            JOIN campaigns ON campaigns.id = characters.campaign_id
            JOIN campaign_members
                ON campaign_members.campaign_id = characters.campaign_id
               AND campaign_members.user_id = characters.owner_id
            WHERE characters.owner_id = %s
            ORDER BY campaigns.name, characters.name
            """,
            (g.user["id"],)
        ).fetchall()

    return jsonify({
        "characters": [
            {**character_summary(row), "campaign_name": row["campaign_name"]}
            for row in rows
        ]
    }), 200



@characters_bp.route(
    "/api/campaigns/<int:campaign_id>/characters",
    methods=["GET"]
)
@login_required
def list_campaign_characters(campaign_id):
    #O mestre vê todas as fichas da campanha; o jogador, só as suas.
    with get_connection() as connection:
        role = get_member_role(connection, campaign_id, g.user["id"])

        if role is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        rows = connection.execute(
            """
            SELECT characters.*, users.name AS owner_name
            FROM characters
            JOIN users ON users.id = characters.owner_id
            WHERE characters.campaign_id = %s
              AND (%s OR characters.owner_id = %s)
            ORDER BY characters.name
            """,
            (campaign_id, role == "gm", g.user["id"])
        ).fetchall()

    return jsonify({
        "characters": [
            {**character_summary(row), "owner_name": row["owner_name"]}
            for row in rows
        ],
        "role": role
    }), 200



@characters_bp.route(
    "/api/campaigns/<int:campaign_id>/characters",
    methods=["POST"]
)
@login_required
def create_character(campaign_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    name = read_name(data.get("name"))

    if name is None:
        return jsonify({"error": "Informe o nome do personagem."}), 400

    with get_connection() as connection:
        if get_member_role(connection, campaign_id, g.user["id"]) is None:
            return jsonify({"error": "Campanha não encontrada."}), 404

        sheet = normalize_sheet({"player_name": g.user["name"]})

        row = connection.execute(
            """
            INSERT INTO characters (campaign_id, owner_id, name, data)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (campaign_id, g.user["id"], name, Jsonb(sheet))
        ).fetchone()

    return jsonify({
        "message": "Personagem criado!",
        "character": serialize_character(row, True)
    }), 201



@characters_bp.route("/api/characters/<int:character_id>", methods=["GET"])
@login_required
def get_character(character_id):
    with get_connection() as connection:
        row, role = get_character_access(connection, character_id)

        if row is None:
            return jsonify({"error": "Ficha não encontrada."}), 404

        campaign = connection.execute(
            "SELECT name FROM campaigns WHERE id = %s",
            (row["campaign_id"],)
        ).fetchone()

    return jsonify({
        "character": {
            **serialize_character(row, True),
            "campaign_name": campaign["name"],
            "viewer_role": role,
        }
    }), 200



@characters_bp.route("/api/characters/<int:character_id>", methods=["PUT"])
@login_required
def update_character(character_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Envie os dados em formato JSON."}), 400

    name = read_name(data.get("name"))

    if name is None:
        return jsonify({"error": "Informe o nome do personagem."}), 400

    if len(json.dumps(data.get("data"))) > MAX_SHEET_BYTES:
        return jsonify({"error": "A ficha ficou grande demais."}), 400

    sheet = normalize_sheet(data.get("data"))

    with get_connection() as connection:
        row, _ = get_character_access(connection, character_id)

        if row is None:
            return jsonify({"error": "Ficha não encontrada."}), 404

        row = connection.execute(
            """
            UPDATE characters SET name = %s, data = %s, updated_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (name, Jsonb(sheet), character_id)
        ).fetchone()

    broadcast_character(row)

    return jsonify({
        "message": "Ficha salva!",
        "character": serialize_character(row, True)
    }), 200



@characters_bp.route("/api/characters/<int:character_id>", methods=["DELETE"])
@login_required
def delete_character(character_id):
    with get_connection() as connection:
        row, _ = get_character_access(connection, character_id)

        if row is None:
            return jsonify({"error": "Ficha não encontrada."}), 404

        # Os tokens vinculados continuam na mesa, sem vínculo.
        connection.execute(
            "DELETE FROM characters WHERE id = %s",
            (character_id,)
        )

    delete_character_image(row["image_filename"])
    socketio.emit(
        "personagem:removido",
        {"id": character_id},
        to=campaign_room(row["campaign_id"])
    )

    return jsonify({"message": "Ficha excluída."}), 200



@characters_bp.route(
    "/api/characters/<int:character_id>/image",
    methods=["POST"]
)
@login_required
def upload_character_image(character_id):
    with get_connection() as connection:
        row, _ = get_character_access(connection, character_id)

    if row is None:
        return jsonify({"error": "Ficha não encontrada."}), 404

    try:
        filename = save_uploaded_image(
            request.files.get("file"),
            CHARACTERS_FOLDER,
            MAX_CHARACTER_IMAGE_SIZE
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except StorageError as error:
        print(f"Erro ao enviar retrato para o Storage: {error}")
        return jsonify({
            "error": "Não foi possível salvar a imagem. Tente novamente."
        }), 502

    with get_connection() as connection:
        updated = connection.execute(
            """
            UPDATE characters SET image_filename = %s, updated_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (filename, character_id)
        ).fetchone()

    delete_character_image(row["image_filename"])
    broadcast_character(updated)

    return jsonify({"character": serialize_character(updated, True)}), 200



@characters_bp.route(
    "/api/characters/<int:character_id>/image",
    methods=["DELETE"]
)
@login_required
def remove_character_image(character_id):
    with get_connection() as connection:
        row, _ = get_character_access(connection, character_id)

        if row is None:
            return jsonify({"error": "Ficha não encontrada."}), 404

        updated = connection.execute(
            """
            UPDATE characters SET image_filename = NULL, updated_at = now()
            WHERE id = %s
            RETURNING *
            """,
            (character_id,)
        ).fetchone()

    delete_character_image(row["image_filename"])
    broadcast_character(updated)

    return jsonify({"character": serialize_character(updated, True)}), 200
