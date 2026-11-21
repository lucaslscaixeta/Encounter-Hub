import re
import secrets


# Exemplos aceitos: "d20", "1d20+5", "2d6 + 1d4 - 1".
# "kh"/"kl" ficam com os maiores/menores dados: "2d20kh1" é vantagem e
# "2d20kl1" é desvantagem.
DICE_TERM = r"\d*d\d+(?:k[hl]\d+)?"
EXPRESSION_PATTERN = re.compile(
    rf"^[+-]?({DICE_TERM}|\d+)([+-]({DICE_TERM}|\d+))*$"
)
TERM_PATTERN = re.compile(rf"([+-]?)({DICE_TERM}|\d+)")
DICE_PATTERN = re.compile(r"^(\d*)d(\d+)(?:k([hl])(\d+))?$")

MAX_DICE = 100
MAX_SIDES = 1000
MAX_TERMS = 10


def roll_dice_term(sign, term):
    count_text, sides_text, keep_mode, keep_text = DICE_PATTERN.match(term).groups()
    count = int(count_text) if count_text else 1
    sides = int(sides_text)

    if not 1 <= count <= MAX_DICE:
        raise ValueError(f"Role entre 1 e {MAX_DICE} dados por termo.")

    if not 2 <= sides <= MAX_SIDES:
        raise ValueError(f"Os dados devem ter entre 2 e {MAX_SIDES} lados.")

    values = [secrets.randbelow(sides) + 1 for _ in range(count)]
    kept = values

    if keep_mode:
        keep = int(keep_text)

        if not 1 <= keep <= count:
            raise ValueError("Mantenha entre 1 e a quantidade de dados rolados.")

        kept = sorted(values, reverse=keep_mode == "h")[:keep]

    multiplier = -1 if sign == "-" else 1
    suffix = f"k{keep_mode}{keep_text}" if keep_mode else ""

    return {
        "term": f"{sign}{count}d{sides}{suffix}",
        "sides": sides,
        "values": values,
        # Dados que contam na soma (todos, se não houver kh/kl).
        "kept": kept,
        "subtotal": sum(kept) * multiplier
    }


def roll_expression(expression):
    """Rola uma expressão de dados e devolve o resultado detalhado.

    Lança ValueError com uma mensagem amigável se a expressão for inválida.
    """
    if not isinstance(expression, str):
        raise ValueError("Informe uma expressão de dados.")

    normalized = expression.replace(" ", "").lower()

    if not normalized or len(normalized) > 80:
        raise ValueError("Informe uma expressão como 1d20+5.")

    if not EXPRESSION_PATTERN.match(normalized):
        raise ValueError("Expressão inválida. Use algo como 1d20+5 ou 2d6.")

    terms = TERM_PATTERN.findall(normalized)

    if len(terms) > MAX_TERMS:
        raise ValueError(f"Use no máximo {MAX_TERMS} termos por rolagem.")

    results = []
    total = 0

    for sign, term in terms:
        if "d" in term:
            result = roll_dice_term(sign, term)
        else:
            subtotal = int(term) * (-1 if sign == "-" else 1)
            result = {
                "term": f"{sign}{term}",
                "sides": None,
                "values": [],
                "kept": [],
                "subtotal": subtotal
            }

        results.append(result)
        total += result["subtotal"]

    return {
        "expression": normalized,
        "terms": results,
        "total": total
    }
