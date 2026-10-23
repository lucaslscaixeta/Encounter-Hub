import json
import os
import secrets
import urllib.error
import urllib.request

from dotenv import load_dotenv
from banco import BASE_DIR


load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")
BUCKET = os.getenv("SUPABASE_BUCKET", "encounter-hub")

CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

# Assinatura dos primeiros bytes de cada formato aceito.
IMAGE_SIGNATURES = {
    ".png": lambda header: header.startswith(b"\x89PNG\r\n\x1a\n"),
    ".jpg": lambda header: header.startswith(b"\xff\xd8\xff"),
    ".gif": lambda header: header[:6] in (b"GIF87a", b"GIF89a"),
    ".webp": lambda header: header[:4] == b"RIFF" and header[8:12] == b"WEBP",
}

_bucket_ready = False


class StorageError(Exception):
    #Falha ao falar com o Supabase Storage.
    pass


def storage_request(method, path, data=None, content_type=None):
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise StorageError(
            "Configure SUPABASE_URL e SUPABASE_SECRET_KEY no backend/.env."
        )

    headers = {
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "apikey": SUPABASE_SECRET_KEY,
    }

    if content_type:
        headers["Content-Type"] = content_type

    request = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/{path}",
        data=data,
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise StorageError(f"Storage respondeu {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise StorageError(f"Sem conexão com o Storage: {error.reason}") from error


def ensure_bucket():
    #Cria o bucket público na primeira vez que uma imagem é enviada.
    global _bucket_ready

    if _bucket_ready:
        return

    try:
        storage_request("GET", f"bucket/{BUCKET}")
    except StorageError:
        storage_request(
            "POST",
            "bucket",
            json.dumps({
                "id": BUCKET,
                "name": BUCKET,
                "public": True,
                "allowed_mime_types": list(CONTENT_TYPES.values()),
            }).encode("utf-8"),
            "application/json",
        )

    _bucket_ready = True


def public_url(folder, filename):
    #Os nomes dos arquivos são aleatórios, então não são adivinháveis.
    if not filename:
        return None

    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{folder}/{filename}"


def detect_image_extension(header):
    for extension, matches in IMAGE_SIGNATURES.items():
        if matches(header):
            return extension

    return None


def save_uploaded_image(file, folder, max_size):
    """Valida a imagem enviada e grava no Storage com um nome aleatório.

    Retorna o nome do arquivo salvo. Lança ValueError com uma mensagem
    amigável se a imagem for inválida, ou StorageError se o envio falhar.
    """
    if file is None or not file.filename:
        raise ValueError("Selecione uma imagem.")

    content = file.read(max_size + 1)

    if len(content) > max_size:
        raise ValueError(
            f"A imagem deve ter no máximo {max_size // (1024 * 1024)} MB."
        )

    extension = detect_image_extension(content[:12])

    if extension is None:
        raise ValueError("Envie uma imagem PNG, JPG, WEBP ou GIF.")

    filename = f"{secrets.token_hex(16)}{extension}"

    ensure_bucket()
    storage_request(
        "POST",
        f"object/{BUCKET}/{folder}/{filename}",
        content,
        CONTENT_TYPES[extension],
    )

    return filename


def delete_image_file(folder, filename):
    #Uma imagem que não foi apagada não deve quebrar a ação do usuário.
    if not filename:
        return

    try:
        storage_request(
            "DELETE",
            f"object/{BUCKET}",
            json.dumps({"prefixes": [f"{folder}/{filename}"]}).encode("utf-8"),
            "application/json",
        )
    except StorageError as error:
        print(f"Aviso: não foi possível apagar {folder}/{filename}: {error}")
