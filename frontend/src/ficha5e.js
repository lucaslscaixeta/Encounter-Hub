// Regras e cálculos da ficha de D&D 5e. A tela só desenha; as contas ficam aqui.

export const ABILITIES = [
  { key: "str", label: "Força", short: "For" },
  { key: "dex", label: "Destreza", short: "Des" },
  { key: "con", label: "Constituição", short: "Con" },
  { key: "int", label: "Inteligência", short: "Int" },
  { key: "wis", label: "Sabedoria", short: "Sab" },
  { key: "cha", label: "Carisma", short: "Car" },
];

export const ABILITY_LABELS = Object.fromEntries(
  ABILITIES.map((ability) => [ability.key, ability.label])
);

export const SKILLS = [
  { key: "acrobatics", label: "Acrobacia", ability: "dex" },
  { key: "arcana", label: "Arcanismo", ability: "int" },
  { key: "athletics", label: "Atletismo", ability: "str" },
  { key: "performance", label: "Atuação", ability: "cha" },
  { key: "deception", label: "Blefar", ability: "cha" },
  { key: "stealth", label: "Furtividade", ability: "dex" },
  { key: "history", label: "História", ability: "int" },
  { key: "intimidation", label: "Intimidação", ability: "cha" },
  { key: "insight", label: "Intuição", ability: "wis" },
  { key: "investigation", label: "Investigação", ability: "int" },
  { key: "animal_handling", label: "Lidar com Animais", ability: "wis" },
  { key: "medicine", label: "Medicina", ability: "wis" },
  { key: "nature", label: "Natureza", ability: "int" },
  { key: "perception", label: "Percepção", ability: "wis" },
  { key: "persuasion", label: "Persuasão", ability: "cha" },
  { key: "sleight_of_hand", label: "Prestidigitação", ability: "dex" },
  { key: "religion", label: "Religião", ability: "int" },
  { key: "survival", label: "Sobrevivência", ability: "wis" },
];

export const CONDITIONS = [
  { key: "blinded", label: "Cego" },
  { key: "charmed", label: "Enfeitiçado" },
  { key: "deafened", label: "Surdo" },
  { key: "frightened", label: "Amedrontado" },
  { key: "grappled", label: "Agarrado" },
  { key: "incapacitated", label: "Incapacitado" },
  { key: "invisible", label: "Invisível" },
  { key: "paralyzed", label: "Paralisado" },
  { key: "petrified", label: "Petrificado" },
  { key: "poisoned", label: "Envenenado" },
  { key: "prone", label: "Caído" },
  { key: "restrained", label: "Impedido" },
  { key: "stunned", label: "Atordoado" },
  { key: "unconscious", label: "Inconsciente" },
];

export const COINS = [
  { key: "cp", label: "PC" },
  { key: "sp", label: "PP" },
  { key: "ep", label: "PE" },
  { key: "gp", label: "PO" },
  { key: "pp", label: "PL" },
];

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// 0 = sem proficiência, 1 = proficiente, 2 = especialização.
export const PROFICIENCY_LABELS = ["Sem proficiência", "Proficiente", "Especialização"];

export function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

export function proficiencyBonus(level) {
  return 2 + Math.floor((Math.max(1, Number(level)) - 1) / 4);
}

export function formatBonus(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function modifierOf(sheet, ability) {
  return ability && ability !== "none"
    ? abilityModifier(sheet.abilities[ability])
    : 0;
}

export function saveBonus(sheet, ability) {
  return (
    modifierOf(sheet, ability) +
    (sheet.saves[ability] ? proficiencyBonus(sheet.level) : 0)
  );
}

// "Pau para toda obra" soma metade da proficiência em testes sem proficiência.
function skillProficiency(sheet, rank) {
  const bonus = proficiencyBonus(sheet.level);

  if (rank === 2) {
    return bonus * 2;
  }

  if (rank === 1) {
    return bonus;
  }

  return sheet.jack_of_all_trades ? Math.floor(bonus / 2) : 0;
}

export function skillBonus(sheet, skill) {
  return modifierOf(sheet, skill.ability) + skillProficiency(sheet, sheet.skills[skill.key]);
}

// A iniciativa é um teste de Destreza, então recebe "pau para toda obra".
export function initiativeBonus(sheet) {
  return (
    modifierOf(sheet, "dex") +
    skillProficiency(sheet, 0) +
    Number(sheet.initiative_bonus || 0)
  );
}

export function passivePerception(sheet) {
  const perception = SKILLS.find((skill) => skill.key === "perception");
  return 10 + skillBonus(sheet, perception);
}

export function spellSaveDc(sheet) {
  return 8 + proficiencyBonus(sheet.level) + modifierOf(sheet, sheet.spellcasting_ability);
}

export function spellAttackBonus(sheet) {
  return proficiencyBonus(sheet.level) + modifierOf(sheet, sheet.spellcasting_ability);
}

export function attackBonus(sheet, attack) {
  return (
    modifierOf(sheet, attack.ability) +
    (attack.proficient ? proficiencyBonus(sheet.level) : 0) +
    Number(attack.bonus || 0)
  );
}

// Carga em kg, como nos livros em português: Força × 7,5.
export function carryingCapacity(sheet) {
  return sheet.abilities.str * 7.5;
}

export function totalWeight(sheet) {
  return sheet.items.reduce(
    (total, item) => total + Number(item.weight || 0) * Number(item.quantity || 0),
    0
  );
}

export function d20(mode) {
  if (mode === "advantage") {
    return "2d20kh1";
  }

  if (mode === "disadvantage") {
    return "2d20kl1";
  }

  return "1d20";
}

// Junta partes de uma expressão: ["1d20", 5, "1d4"] -> "1d20+5+1d4".
export function joinExpression(parts) {
  return parts
    .filter((part) => part !== "" && part !== 0 && part !== null && part !== undefined)
    .map((part, index) => {
      const text = String(part);

      if (index === 0) {
        return text.replace(/^\+/, "");
      }

      return /^[+-]/.test(text) ? text : `+${text}`;
    })
    .join("");
}

// No crítico, os dados de dano rolam em dobro: "1d8+2" -> "2d8+2".
export function doubleDice(expression) {
  return expression.replace(/(\d*)d(\d+)/g, (_, count, sides) => {
    return `${(Number(count) || 1) * 2}d${sides}`;
  });
}

// Valor natural do primeiro d20 (o que contou, em vantagem/desvantagem).
export function naturalD20(roll) {
  const term = roll?.terms?.find((item) => item.sides === 20);
  return term?.kept?.[0] ?? term?.values?.[0] ?? null;
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function sheetToText(character) {
  const sheet = character.data;
  const lines = [
    "ENCOUNTER HUB - FICHA DE PERSONAGEM (D&D 5e)",
    "",
    `Personagem: ${character.name}`,
    `Classe e nível: ${sheet.class_level} (nível ${sheet.level})`,
    `Raça: ${sheet.race}    Antecedente: ${sheet.background}`,
    `Tendência: ${sheet.alignment}    XP: ${sheet.xp}`,
    `Jogador: ${sheet.player_name}`,
    "",
    `CA ${sheet.armor_class}   Iniciativa ${formatBonus(initiativeBonus(sheet))}   Deslocamento ${sheet.speed}`,
    `PV ${sheet.hp_current}/${sheet.hp_max} (+${sheet.hp_temp} temporários)   Dados de vida ${sheet.hit_dice}`,
    `Bônus de proficiência ${formatBonus(proficiencyBonus(sheet.level))}   Percepção passiva ${passivePerception(sheet)}`,
    "",
    "ATRIBUTOS",
    ...ABILITIES.map(
      (ability) =>
        `${ability.label}: ${sheet.abilities[ability.key]} (${formatBonus(
          modifierOf(sheet, ability.key)
        )})   resistência ${formatBonus(saveBonus(sheet, ability.key))}${
          sheet.saves[ability.key] ? " *" : ""
        }`
    ),
    "",
    "PERÍCIAS",
    ...SKILLS.map(
      (skill) =>
        `${skill.label}: ${formatBonus(skillBonus(sheet, skill))}${
          ["", " *", " **"][sheet.skills[skill.key]]
        }`
    ),
    "",
    "ATAQUES",
    ...sheet.attacks.map(
      (attack) =>
        `${attack.name}: ${formatBonus(attackBonus(sheet, attack))}, ${attack.damage} ${attack.damage_type}`
    ),
    "",
    "EQUIPAMENTO",
    ...sheet.items.map((item) => `${item.quantity}x ${item.name}`),
    COINS.map((coin) => `${coin.label} ${sheet.coins[coin.key]}`).join("  "),
    "",
    `MAGIAS (${sheet.spellcasting_class}) CD ${spellSaveDc(sheet)}, ataque ${formatBonus(spellAttackBonus(sheet))}`,
    ...sheet.spells.map(
      (spell) => `[${spell.level === 0 ? "Truque" : `${spell.level}º`}] ${spell.name}`
    ),
    "",
    "PROFICIÊNCIAS E IDIOMAS", sheet.proficiencies,
    "",
    "CARACTERÍSTICAS E HABILIDADES", sheet.features,
    "",
    "TRAÇOS DE PERSONALIDADE", sheet.personality,
    "IDEAIS", sheet.ideals,
    "LIGAÇÕES", sheet.bonds,
    "DEFEITOS", sheet.flaws,
    "",
    "HISTÓRIA", sheet.bio.backstory,
  ];

  return lines.join("\n");
}

export function downloadText(filename, text) {
  const file = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
