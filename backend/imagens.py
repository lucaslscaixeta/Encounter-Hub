import secrets

from banco import BASE_DIR


UPLOAD_ROOT = BASE_DIR / "uploads"

# Assinatura dos primeiros bytes de cada formato aceito.
IMAGE_SIGNATURES = {
    ".png": lambda header: header.startswith(b"\x89PNG\r\n\x1a\n"),
    ".jpg": lambda header: header.startswith(b"\xff\xd8\xff"),
    ".gif": lambda header: header[:6] in (b"GIF87a", b"GIF89a"),
    ".webp": lambda header: header[:4] == b"RIFF" and header[8:12] == b"WEBP",
}


def detect_image_extension(header):
    for extension, matches in IMAGE_SIGNATURES.items():
        if matches(header):
            return extension

    return None


def save_uploaded_image(file, directory, max_size):
    """Valida e grava a imagem enviada com um nome aleatório.

    Retorna o nome do arquivo salvo. Lança ValueError com uma mensagem
    amigável se a imagem for inválida.
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

    directory.mkdir(parents=True, exist_ok=True)
    (directory / filename).write_bytes(content)

    return filename


def delete_image_file(directory, filename):
    if not filename:
        return

    path = directory / filename

    if path.parent == directory and path.exists():
        path.unlink()
