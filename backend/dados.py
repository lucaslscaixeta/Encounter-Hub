import re
import secrets


# Exemplos aceitos: "d20", "1d20+5", "2d6 + 1d4 - 1".
EXPRESSION_PATTERN = re.compile(r"^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$")
TERM_PATTERN = re.compile(r"([+-]?)(\d*d\d+|\d+)")

MAX_DICE = 100
MAX_SIDES = 1000
MAX_TERMS = 10


def roll_expression(expression):
    """Rola uma expressão de dados e devolve o resultado detalhado.

    Lança ValueError com uma mensagem amigável se a expressão for inválida.
    """
    if not isinstance(expression, str):
        raise ValueError("Informe uma expressão de dados.")

    normalized = expression.replace(" ", "").lower()

    if not normalized or len(normalized) > 60:
        raise ValueError("Informe uma expressão como 1d20+5.")

    if not EXPRESSION_PATTERN.match(normalized):
        raise ValueError("Expressão inválida. Use algo como 1d20+5 ou 2d6.")

    terms = TERM_PATTERN.findall(normalized)

    if len(terms) > MAX_TERMS:
        raise ValueError(f"Use no máximo {MAX_TERMS} termos por rolagem.")

    results = []
    total = 0

    for sign, term in terms:
        multiplier = -1 if sign == "-" else 1

        if "d" in term:
            count_text, sides_text = term.split("d")
            count = int(count_text) if count_text else 1
            sides = int(sides_text)

            if not 1 <= count <= MAX_DICE:
                raise ValueError(f"Role entre 1 e {MAX_DICE} dados por termo.")

            if not 2 <= sides <= MAX_SIDES:
                raise ValueError(
                    f"Os dados devem ter entre 2 e {MAX_SIDES} lados."
                )

            values = [secrets.randbelow(sides) + 1 for _ in range(count)]
            subtotal = sum(values) * multiplier

            results.append({
                "term": f"{sign}{count}d{sides}",
                "sides": sides,
                "values": values,
                "subtotal": subtotal
            })
        else:
            subtotal = int(term) * multiplier

            results.append({
                "term": f"{sign}{term}",
                "sides": None,
                "values": [],
                "subtotal": subtotal
            })

        total += subtotal

    return {
        "expression": normalized,
        "terms": results,
        "total": total
    }
