import React from "react";
import { apiRequest } from "../api.js";
import {
  ABILITIES,
  ABILITY_LABELS,
  COINS,
  CONDITIONS,
  PROFICIENCY_LABELS,
  SKILLS,
  SPELL_LEVELS,
  abilityModifier,
  attackBonus,
  carryingCapacity,
  d20,
  doubleDice,
  downloadText,
  formatBonus,
  initiativeBonus,
  joinExpression,
  modifierOf,
  naturalD20,
  newId,
  passivePerception,
  proficiencyBonus,
  saveBonus,
  sheetToText,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
  totalWeight,
} from "../ficha5e.js";

const SAVE_DELAY = 800;
const TABS = [
  ["main", "Principal"],
  ["bio", "Biografia"],
  ["spells", "Magias"],
  ["settings", "Configurações"],
];
const ROLL_MODES = [
  ["normal", "Normal"],
  ["advantage", "Vantagem"],
  ["disadvantage", "Desvantagem"],
  ["ask", "Perguntar"],
];
const MODE_SUFFIX = {
  advantage: " (vantagem)",
  disadvantage: " (desvantagem)",
  normal: "",
};
const PROFICIENCY_MARKS = ["○", "●", "◆"];

// Copia o objeto mudando só o valor no caminho: ["abilities", "str"].
function setIn(object, path, value) {
  if (path.length === 0) {
    return value;
  }

  const [key, ...rest] = path;
  const copy = Array.isArray(object) ? [...object] : { ...object };
  copy[key] = setIn(object[key], rest, value);
  return copy;
}

function toNumber(value) {
  return value === "" ? 0 : Number(value);
}

function Field({ label, className = "", children }) {
  return (
    <label className={`sheet-field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }) {
  return (
    <Field label={label} className="sheet-textarea">
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function RollButton({ label, onRoll, children, disabled }) {
  return (
    <button
      type="button"
      className="sheet-roll-button"
      aria-label={label}
      title={label}
      onClick={onRoll}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function CharacterSheet({ characterId, onClose, onDeleted }) {
  const [character, setCharacter] = React.useState(null);
  const [name, setName] = React.useState("");
  const [sheet, setSheet] = React.useState(null);
  const [tab, setTab] = React.useState("main");
  const [saveState, setSaveState] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [lastRolls, setLastRolls] = React.useState([]);
  const [pendingRoll, setPendingRoll] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
  const [hpChange, setHpChange] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const isDirty = React.useRef(false);

  React.useEffect(() => {
    let active = true;

    apiRequest(`/api/characters/${characterId}`)
      .then((data) => {
        if (active) {
          setCharacter(data.character);
          setName(data.character.name);
          setSheet(data.character.data);
        }
      })
      .catch((error) => active && setMessage(error.message));

    return () => {
      active = false;
    };
  }, [characterId]);

  // Salva sozinho um pouco depois da última alteração.
  React.useEffect(() => {
    if (!isDirty.current || !sheet || !name.trim()) {
      return undefined;
    }

    setSaveState("Salvando...");

    const timer = setTimeout(async () => {
      try {
        await apiRequest(`/api/characters/${characterId}`, {
          method: "PUT",
          body: { name, data: sheet },
        });
        isDirty.current = false;
        setSaveState("Salvo");
      } catch (error) {
        setSaveState("");
        setMessage(error.message);
      }
    }, SAVE_DELAY);

    return () => clearTimeout(timer);
  }, [characterId, name, sheet]);

  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!sheet) {
    return (
      <div className="sheet">
        <p className={message ? "form-message" : "muted"} role="status">
          {message || "Carregando ficha..."}
        </p>
        <button className="text-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    );
  }

  function update(path, value) {
    isDirty.current = true;
    setSheet((current) => setIn(current, path, value));
  }

  function updateName(value) {
    isDirty.current = true;
    setName(value);
  }

  function updateListItem(list, id, field, value) {
    update(
      [list],
      sheet[list].map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function addListItem(list, item) {
    const entry = { id: newId(), ...item };
    update([list], [...sheet[list], entry]);
    setExpanded(entry.id);
  }

  function removeListItem(list, id) {
    update([list], sheet[list].filter((item) => item.id !== id));
  }

  // ===== Rolagens =====

  async function sendRoll(label, expression) {
    setMessage("");

    try {
      const data = await apiRequest(`/api/campaigns/${character.campaign_id}/rolls`, {
        method: "POST",
        body: {
          expression,
          label: `${name}: ${label}`,
          private: sheet.settings.private_rolls,
        },
      });

      setLastRolls((current) => [data.message, ...current].slice(0, 3));
      return data.message;
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  }

  // Com o modo "perguntar", guarda a rolagem até escolher o tipo.
  function requestRoll(perform) {
    if (sheet.settings.roll_mode === "ask") {
      setPendingRoll(() => perform);
    } else {
      perform(sheet.settings.roll_mode);
    }
  }

  function rollD20(label, bonuses, globalKey) {
    requestRoll((mode) =>
      sendRoll(
        `${label}${MODE_SUFFIX[mode]}`,
        joinExpression([d20(mode), ...bonuses, sheet.settings[globalKey]])
      )
    );
  }

  async function rollDamage(label, dice, extra, crit) {
    if (!dice) {
      return;
    }

    const globalDamage = sheet.settings.global_damage;

    await sendRoll(
      `${label}${crit ? " (CRÍTICO!)" : ""}`,
      joinExpression([
        crit ? doubleDice(dice) : dice,
        extra,
        crit && globalDamage ? doubleDice(globalDamage) : globalDamage,
      ])
    );
  }

  function rollAttack(attack) {
    requestRoll(async (mode) => {
      const result = await sendRoll(
        `${attack.name || "Ataque"}${MODE_SUFFIX[mode]}`,
        joinExpression([d20(mode), attackBonus(sheet, attack), sheet.settings.global_attack])
      );

      if (!result) {
        return;
      }

      const crit = naturalD20(result.roll) >= attack.crit_range;
      const abilityDamage = attack.damage_add_ability ? modifierOf(sheet, attack.ability) : 0;

      await rollDamage(
        `${attack.name} - dano ${attack.damage_type}`.trim(),
        attack.damage,
        abilityDamage,
        crit
      );
      await rollDamage(
        `${attack.name} - dano extra ${attack.damage2_type}`.trim(),
        attack.damage2,
        0,
        crit
      );
    });
  }

  function rollSpell(spell) {
    const label = spell.name || "Magia";

    if (spell.roll === "attack") {
      requestRoll(async (mode) => {
        const result = await sendRoll(
          `${label} - ataque mágico${MODE_SUFFIX[mode]}`,
          joinExpression([d20(mode), spellAttackBonus(sheet), sheet.settings.global_attack])
        );

        if (result) {
          await rollDamage(
            `${label} - dano ${spell.damage_type}`.trim(),
            spell.damage,
            0,
            naturalD20(result.roll) === 20
          );
        }
      });
      return;
    }

    const saveText =
      spell.roll === "save"
        ? ` (CD ${spellSaveDc(sheet)} ${ABILITY_LABELS[spell.save_ability]})`
        : "";

    rollDamage(`${label} - dano ${spell.damage_type}${saveText}`.trim(), spell.damage, 0, false);
  }

  function rollHitDie() {
    const sides = sheet.hit_dice.match(/d(\d+)/)?.[1];

    if (sides) {
      sendRoll("dado de vida", joinExpression([`1d${sides}`, modifierOf(sheet, "con")]));
    }
  }

  function applyHpChange(kind) {
    const amount = Math.abs(Number(hpChange));

    if (!amount) {
      return;
    }

    isDirty.current = true;
    setSheet((current) => {
      if (kind === "heal") {
        return {
          ...current,
          hp_current: Math.min(current.hp_max, current.hp_current + amount),
        };
      }

      // O dano tira primeiro dos PV temporários.
      const fromTemp = Math.min(current.hp_temp, amount);
      return {
        ...current,
        hp_temp: current.hp_temp - fromTemp,
        hp_current: Math.max(0, current.hp_current - (amount - fromTemp)),
      };
    });
    setHpChange("");
  }

  async function handleImage(event) {
    const file = event.target.files[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const data = await apiRequest(`/api/characters/${characterId}/image`, {
        method: "POST",
        formData,
      });
      setCharacter((current) => ({ ...current, image_url: data.character.image_url }));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDelete() {
    try {
      await apiRequest(`/api/characters/${characterId}`, { method: "DELETE" });
      onDeleted?.(characterId);
      onClose();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const proficiency = proficiencyBonus(sheet.level);
  const weight = totalWeight(sheet);
  const capacity = carryingCapacity(sheet);

  // ===== Abas =====

  const mainTab = (
    <div className="sheet-main">
      <section className="sheet-column">
        <div className="sheet-abilities">
          {ABILITIES.map((ability) => (
            <div key={ability.key} className="sheet-ability">
              <span className="sheet-ability-name">{ability.label}</span>
              <RollButton
                label={`Rolar teste de ${ability.label}`}
                onRoll={() =>
                  rollD20(`teste de ${ability.label}`, [modifierOf(sheet, ability.key)], "global_check")
                }
              >
                {formatBonus(abilityModifier(sheet.abilities[ability.key]))}
              </RollButton>
              <input
                type="number"
                min={1}
                max={30}
                aria-label={`Valor de ${ability.label}`}
                value={sheet.abilities[ability.key]}
                onChange={(event) =>
                  update(["abilities", ability.key], toNumber(event.target.value))
                }
              />
            </div>
          ))}
        </div>

        <div className="sheet-box sheet-inline">
          <label className="sheet-check">
            <input
              type="checkbox"
              checked={sheet.inspiration}
              onChange={(event) => update(["inspiration"], event.target.checked)}
            />
            Inspiração
          </label>
          <span className="sheet-stat">
            Bônus de proficiência <strong>{formatBonus(proficiency)}</strong>
          </span>
        </div>

        <div className="sheet-box">
          <h3>Testes de resistência</h3>
          {ABILITIES.map((ability) => (
            <div key={ability.key} className="sheet-row">
              <input
                type="checkbox"
                aria-label={`Proficiente em resistência de ${ability.label}`}
                checked={sheet.saves[ability.key]}
                onChange={(event) => update(["saves", ability.key], event.target.checked)}
              />
              <RollButton
                label={`Rolar resistência de ${ability.label}`}
                onRoll={() =>
                  rollD20(`resistência de ${ability.label}`, [saveBonus(sheet, ability.key)], "global_save")
                }
              >
                {formatBonus(saveBonus(sheet, ability.key))}
              </RollButton>
              <span>{ability.label}</span>
            </div>
          ))}
        </div>

        <div className="sheet-box">
          <h3>Perícias</h3>
          {SKILLS.map((skill) => {
            const rank = sheet.skills[skill.key];
            const short = ABILITIES.find((ability) => ability.key === skill.ability).short;

            return (
              <div key={skill.key} className="sheet-row">
                <button
                  type="button"
                  className={`sheet-proficiency rank-${rank}`}
                  aria-label={`${skill.label}: ${PROFICIENCY_LABELS[rank]}. Clique para mudar.`}
                  title={PROFICIENCY_LABELS[rank]}
                  onClick={() => update(["skills", skill.key], (rank + 1) % 3)}
                >
                  {PROFICIENCY_MARKS[rank]}
                </button>
                <RollButton
                  label={`Rolar ${skill.label}`}
                  onRoll={() => rollD20(skill.label, [skillBonus(sheet, skill)], "global_check")}
                >
                  {formatBonus(skillBonus(sheet, skill))}
                </RollButton>
                <span>
                  {skill.label} <small className="muted">({short})</small>
                </span>
              </div>
            );
          })}
          <p className="muted sheet-hint">○ sem proficiência · ● proficiente · ◆ especialização</p>
          <label className="sheet-check">
            <input
              type="checkbox"
              checked={sheet.jack_of_all_trades}
              onChange={(event) => update(["jack_of_all_trades"], event.target.checked)}
            />
            Pau para toda obra (metade da proficiência nos testes sem proficiência)
          </label>
        </div>

        <div className="sheet-box sheet-inline">
          <span className="sheet-stat">
            Sabedoria passiva (Percepção) <strong>{passivePerception(sheet)}</strong>
          </span>
        </div>

        <TextArea
          label="Idiomas e outras proficiências"
          value={sheet.proficiencies}
          onChange={(value) => update(["proficiencies"], value)}
        />
      </section>

      <section className="sheet-column">
        <div className="sheet-combat">
          <Field label="Classe de armadura">
            <input
              type="number"
              value={sheet.armor_class}
              onChange={(event) => update(["armor_class"], toNumber(event.target.value))}
            />
          </Field>
          <div className="sheet-field">
            <span>Iniciativa</span>
            <RollButton
              label="Rolar iniciativa"
              onRoll={() => rollD20("iniciativa", [initiativeBonus(sheet)], "global_check")}
            >
              {formatBonus(initiativeBonus(sheet))}
            </RollButton>
          </div>
          <Field label="Deslocamento">
            <input
              type="text"
              maxLength={20}
              value={sheet.speed}
              onChange={(event) => update(["speed"], event.target.value)}
            />
          </Field>
        </div>

        <Field label="Bônus extra de iniciativa">
          <input
            type="number"
            value={sheet.initiative_bonus}
            onChange={(event) => update(["initiative_bonus"], toNumber(event.target.value))}
          />
        </Field>

        <div className="sheet-box">
          <h3>Pontos de vida</h3>
          <div className="sheet-hp">
            <Field label="Atuais">
              <input
                type="number"
                min={0}
                value={sheet.hp_current}
                onChange={(event) => update(["hp_current"], toNumber(event.target.value))}
              />
            </Field>
            <Field label="Máximo">
              <input
                type="number"
                min={0}
                value={sheet.hp_max}
                onChange={(event) => update(["hp_max"], toNumber(event.target.value))}
              />
            </Field>
            <Field label="Temporários">
              <input
                type="number"
                min={0}
                value={sheet.hp_temp}
                onChange={(event) => update(["hp_temp"], toNumber(event.target.value))}
              />
            </Field>
          </div>
          <div className="sheet-hp-change">
            <input
              type="number"
              min={0}
              placeholder="Valor"
              aria-label="Valor de dano ou cura"
              value={hpChange}
              onChange={(event) => setHpChange(event.target.value)}
            />
            <button className="text-button danger" type="button" onClick={() => applyHpChange("damage")}>
              Dano
            </button>
            <button className="text-button" type="button" onClick={() => applyHpChange("heal")}>
              Cura
            </button>
          </div>
        </div>

        <div className="sheet-box sheet-split">
          <div>
            <h3>Dados de vida</h3>
            <div className="sheet-inline">
              <Field label="Total">
                <input
                  type="text"
                  maxLength={40}
                  value={sheet.hit_dice}
                  onChange={(event) => update(["hit_dice"], event.target.value)}
                />
              </Field>
              <Field label="Usados">
                <input
                  type="number"
                  min={0}
                  value={sheet.hit_dice_used}
                  onChange={(event) => update(["hit_dice_used"], toNumber(event.target.value))}
                />
              </Field>
            </div>
            <button className="text-button" type="button" onClick={rollHitDie}>
              Rolar dado de vida
            </button>
          </div>

          <div>
            <h3>Testes contra a morte</h3>
            {[
              ["death_successes", "Sucessos"],
              ["death_failures", "Fracassos"],
            ].map(([field, label]) => (
              <div key={field} className="sheet-death" role="group" aria-label={label}>
                <span>{label}</span>
                {[1, 2, 3].map((count) => (
                  <input
                    key={count}
                    type="checkbox"
                    aria-label={`${label}: ${count}`}
                    checked={sheet[field] >= count}
                    onChange={() =>
                      update([field], sheet[field] >= count ? count - 1 : count)
                    }
                  />
                ))}
              </div>
            ))}
            <button
              className="text-button"
              type="button"
              onClick={() => sendRoll("teste contra a morte", "1d20")}
            >
              Rolar teste contra a morte
            </button>
          </div>
        </div>

        <div className="sheet-box">
          <h3>Condições</h3>
          <div className="sheet-conditions">
            {CONDITIONS.map((condition) => {
              const active = sheet.conditions.includes(condition.key);

              return (
                <button
                  key={condition.key}
                  type="button"
                  className={active ? "active" : ""}
                  aria-pressed={active}
                  onClick={() =>
                    update(
                      ["conditions"],
                      active
                        ? sheet.conditions.filter((key) => key !== condition.key)
                        : [...sheet.conditions, condition.key]
                    )
                  }
                >
                  {condition.label}
                </button>
              );
            })}
          </div>
          <Field label="Exaustão (0 a 6)" className="sheet-small">
            <input
              type="number"
              min={0}
              max={6}
              value={sheet.exhaustion}
              onChange={(event) => update(["exhaustion"], toNumber(event.target.value))}
            />
          </Field>
        </div>

        <div className="sheet-box">
          <div className="sheet-box-header">
            <h3>Ataques</h3>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                addListItem("attacks", {
                  name: "Novo ataque",
                  ability: "str",
                  proficient: true,
                  bonus: 0,
                  damage: "1d6",
                  damage_add_ability: true,
                  damage_type: "",
                  damage2: "",
                  damage2_type: "",
                  crit_range: 20,
                  notes: "",
                })
              }
            >
              + Ataque
            </button>
          </div>

          {sheet.attacks.length === 0 && <p className="muted">Nenhum ataque.</p>}

          {sheet.attacks.map((attack) => (
            <div key={attack.id} className="sheet-list-item">
              <div className="sheet-row">
                <RollButton label={`Atacar com ${attack.name}`} onRoll={() => rollAttack(attack)}>
                  {formatBonus(attackBonus(sheet, attack))}
                </RollButton>
                <button
                  type="button"
                  className="sheet-item-name"
                  aria-expanded={expanded === attack.id}
                  onClick={() => setExpanded(expanded === attack.id ? null : attack.id)}
                >
                  {attack.name || "Sem nome"}
                  <small className="muted">
                    {" "}
                    {joinExpression([
                      attack.damage,
                      attack.damage_add_ability ? modifierOf(sheet, attack.ability) : 0,
                    ])}{" "}
                    {attack.damage_type}
                  </small>
                </button>
              </div>

              {expanded === attack.id && (
                <div className="sheet-editor">
                  <Field label="Nome">
                    <input
                      type="text"
                      maxLength={60}
                      value={attack.name}
                      onChange={(event) => updateListItem("attacks", attack.id, "name", event.target.value)}
                    />
                  </Field>
                  <Field label="Atributo">
                    <select
                      value={attack.ability}
                      onChange={(event) => updateListItem("attacks", attack.id, "ability", event.target.value)}
                    >
                      <option value="none">Nenhum</option>
                      {ABILITIES.map((ability) => (
                        <option key={ability.key} value={ability.key}>
                          {ability.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bônus extra">
                    <input
                      type="number"
                      value={attack.bonus}
                      onChange={(event) => updateListItem("attacks", attack.id, "bonus", toNumber(event.target.value))}
                    />
                  </Field>
                  <Field label="Crítico a partir de">
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={attack.crit_range}
                      onChange={(event) => updateListItem("attacks", attack.id, "crit_range", toNumber(event.target.value))}
                    />
                  </Field>
                  <Field label="Dano (ex.: 1d8)">
                    <input
                      type="text"
                      maxLength={40}
                      value={attack.damage}
                      onChange={(event) => updateListItem("attacks", attack.id, "damage", event.target.value)}
                    />
                  </Field>
                  <Field label="Tipo de dano">
                    <input
                      type="text"
                      maxLength={30}
                      value={attack.damage_type}
                      onChange={(event) => updateListItem("attacks", attack.id, "damage_type", event.target.value)}
                    />
                  </Field>
                  <Field label="Dano extra (ex.: 1d6)">
                    <input
                      type="text"
                      maxLength={40}
                      value={attack.damage2}
                      onChange={(event) => updateListItem("attacks", attack.id, "damage2", event.target.value)}
                    />
                  </Field>
                  <Field label="Tipo do dano extra">
                    <input
                      type="text"
                      maxLength={30}
                      value={attack.damage2_type}
                      onChange={(event) => updateListItem("attacks", attack.id, "damage2_type", event.target.value)}
                    />
                  </Field>
                  <label className="sheet-check">
                    <input
                      type="checkbox"
                      checked={attack.proficient}
                      onChange={(event) => updateListItem("attacks", attack.id, "proficient", event.target.checked)}
                    />
                    Proficiente
                  </label>
                  <label className="sheet-check">
                    <input
                      type="checkbox"
                      checked={attack.damage_add_ability}
                      onChange={(event) =>
                        updateListItem("attacks", attack.id, "damage_add_ability", event.target.checked)
                      }
                    />
                    Somar atributo ao dano
                  </label>
                  <TextArea
                    label="Observações"
                    rows={2}
                    value={attack.notes}
                    onChange={(value) => updateListItem("attacks", attack.id, "notes", value)}
                  />
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => removeListItem("attacks", attack.id)}
                  >
                    Remover ataque
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sheet-box">
          <div className="sheet-box-header">
            <h3>Recursos de classe</h3>
            <button
              className="text-button"
              type="button"
              onClick={() => addListItem("resources", { name: "Novo recurso", total: 1, used: 0 })}
            >
              + Recurso
            </button>
          </div>
          {sheet.resources.map((resource) => (
            <div key={resource.id} className="sheet-resource">
              <input
                type="text"
                maxLength={60}
                aria-label="Nome do recurso"
                value={resource.name}
                onChange={(event) => updateListItem("resources", resource.id, "name", event.target.value)}
              />
              <input
                type="number"
                min={0}
                aria-label="Usados"
                value={resource.used}
                onChange={(event) => updateListItem("resources", resource.id, "used", toNumber(event.target.value))}
              />
              <span>/</span>
              <input
                type="number"
                min={0}
                aria-label="Total"
                value={resource.total}
                onChange={(event) => updateListItem("resources", resource.id, "total", toNumber(event.target.value))}
              />
              <button
                type="button"
                className="sheet-remove"
                aria-label={`Remover ${resource.name}`}
                onClick={() => removeListItem("resources", resource.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sheet-box">
          <div className="sheet-box-header">
            <h3>Equipamento</h3>
            <button
              className="text-button"
              type="button"
              onClick={() => addListItem("items", { name: "", quantity: 1, weight: 0, equipped: false, notes: "" })}
            >
              + Item
            </button>
          </div>

          <div className="sheet-coins">
            {COINS.map((coin) => (
              <Field key={coin.key} label={coin.label}>
                <input
                  type="number"
                  min={0}
                  value={sheet.coins[coin.key]}
                  onChange={(event) => update(["coins", coin.key], toNumber(event.target.value))}
                />
              </Field>
            ))}
          </div>

          {sheet.items.length > 0 && (
            <div className="sheet-items">
              <span>Equip.</span>
              <span>Item</span>
              <span>Qtd.</span>
              <span>Peso (kg)</span>
              <span />
              {sheet.items.map((item) => (
                <React.Fragment key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`${item.name} equipado`}
                    checked={item.equipped}
                    onChange={(event) => updateListItem("items", item.id, "equipped", event.target.checked)}
                  />
                  <input
                    type="text"
                    maxLength={80}
                    aria-label="Nome do item"
                    value={item.name}
                    onChange={(event) => updateListItem("items", item.id, "name", event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    aria-label="Quantidade"
                    value={item.quantity}
                    onChange={(event) => updateListItem("items", item.id, "quantity", toNumber(event.target.value))}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    aria-label="Peso"
                    value={item.weight}
                    onChange={(event) => updateListItem("items", item.id, "weight", toNumber(event.target.value))}
                  />
                  <button
                    type="button"
                    className="sheet-remove"
                    aria-label={`Remover ${item.name}`}
                    onClick={() => removeListItem("items", item.id)}
                  >
                    ×
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {sheet.settings.track_encumbrance && (
            <p className={weight > capacity ? "form-message" : "muted"}>
              Carga: {weight.toLocaleString("pt-BR")} kg de{" "}
              {capacity.toLocaleString("pt-BR")} kg
              {weight > capacity && " - sobrecarregado!"}
            </p>
          )}
        </div>
      </section>

      <section className="sheet-column">
        <TextArea label="Traços de personalidade" value={sheet.personality} onChange={(value) => update(["personality"], value)} />
        <TextArea label="Ideais" value={sheet.ideals} onChange={(value) => update(["ideals"], value)} />
        <TextArea label="Ligações" value={sheet.bonds} onChange={(value) => update(["bonds"], value)} />
        <TextArea label="Defeitos" value={sheet.flaws} onChange={(value) => update(["flaws"], value)} />
        <TextArea
          label="Características e habilidades"
          rows={14}
          value={sheet.features}
          onChange={(value) => update(["features"], value)}
        />
      </section>
    </div>
  );

  const bioTab = (
    <div className="sheet-bio">
      <div className="sheet-bio-fields">
        {[
          ["age", "Idade"],
          ["height", "Altura"],
          ["weight", "Peso"],
          ["eyes", "Olhos"],
          ["skin", "Pele"],
          ["hair", "Cabelos"],
        ].map(([field, label]) => (
          <Field key={field} label={label}>
            <input
              type="text"
              maxLength={40}
              value={sheet.bio[field]}
              onChange={(event) => update(["bio", field], event.target.value)}
            />
          </Field>
        ))}
      </div>
      <div className="sheet-bio-texts">
        <TextArea label="Aparência do personagem" rows={8} value={sheet.bio.appearance} onChange={(value) => update(["bio", "appearance"], value)} />
        <TextArea label="História do personagem" rows={8} value={sheet.bio.backstory} onChange={(value) => update(["bio", "backstory"], value)} />
        <TextArea label="Aliados e organizações" rows={8} value={sheet.bio.allies} onChange={(value) => update(["bio", "allies"], value)} />
        <TextArea label="Outras características e habilidades" rows={8} value={sheet.bio.other_features} onChange={(value) => update(["bio", "other_features"], value)} />
        <TextArea label="Tesouro" rows={6} value={sheet.bio.treasure} onChange={(value) => update(["bio", "treasure"], value)} />
      </div>
    </div>
  );

  const spellsTab = (
    <div className="sheet-spells">
      <div className="sheet-box sheet-spellcasting">
        <Field label="Classe de conjurador">
          <input
            type="text"
            maxLength={60}
            value={sheet.spellcasting_class}
            onChange={(event) => update(["spellcasting_class"], event.target.value)}
          />
        </Field>
        <Field label="Habilidade-chave">
          <select
            value={sheet.spellcasting_ability}
            onChange={(event) => update(["spellcasting_ability"], event.target.value)}
          >
            <option value="none">Nenhuma</option>
            {ABILITIES.map((ability) => (
              <option key={ability.key} value={ability.key}>
                {ability.label}
              </option>
            ))}
          </select>
        </Field>
        <span className="sheet-stat">
          CD do TR <strong>{spellSaveDc(sheet)}</strong>
        </span>
        <span className="sheet-stat">
          Bônus de ataque <strong>{formatBonus(spellAttackBonus(sheet))}</strong>
        </span>
      </div>

      {SPELL_LEVELS.map((level) => {
        const spells = sheet.spells.filter((spell) => spell.level === level);
        const slots = sheet.spell_slots[String(level)];

        return (
          <div key={level} className="sheet-box sheet-spell-level">
            <div className="sheet-box-header">
              <h3>{level === 0 ? "Truques" : `${level}º nível`}</h3>

              {level > 0 && (
                <div className="sheet-slots">
                  <span>Espaços</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Espaços usados de ${level}º nível`}
                    value={slots.used}
                    onChange={(event) =>
                      update(["spell_slots", String(level), "used"], toNumber(event.target.value))
                    }
                  />
                  <span>/</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Total de espaços de ${level}º nível`}
                    value={slots.total}
                    onChange={(event) =>
                      update(["spell_slots", String(level), "total"], toNumber(event.target.value))
                    }
                  />
                </div>
              )}

              <button
                className="text-button"
                type="button"
                onClick={() =>
                  addListItem("spells", {
                    level,
                    name: "",
                    school: "",
                    casting_time: "1 ação",
                    range: "",
                    components: "V, S",
                    duration: "Instantânea",
                    concentration: false,
                    ritual: false,
                    prepared: false,
                    roll: "none",
                    save_ability: "dex",
                    damage: "",
                    damage_type: "",
                    higher_levels: "",
                    description: "",
                  })
                }
              >
                + Magia
              </button>
            </div>

            {spells.map((spell) => (
              <div key={spell.id} className="sheet-list-item">
                <div className="sheet-row">
                  {level > 0 && (
                    <input
                      type="checkbox"
                      aria-label={`${spell.name} preparada`}
                      title="Preparada"
                      checked={spell.prepared}
                      onChange={(event) => updateListItem("spells", spell.id, "prepared", event.target.checked)}
                    />
                  )}
                  <button
                    type="button"
                    className="sheet-item-name"
                    aria-expanded={expanded === spell.id}
                    onClick={() => setExpanded(expanded === spell.id ? null : spell.id)}
                  >
                    {spell.name || "Sem nome"}
                    {spell.concentration && <span className="sheet-tag">C</span>}
                    {spell.ritual && <span className="sheet-tag">R</span>}
                  </button>
                  {(spell.roll !== "none" || spell.damage) && (
                    <RollButton label={`Lançar ${spell.name}`} onRoll={() => rollSpell(spell)}>
                      🎲
                    </RollButton>
                  )}
                </div>

                {expanded === spell.id && (
                  <div className="sheet-editor">
                    <Field label="Nome">
                      <input
                        type="text"
                        maxLength={80}
                        value={spell.name}
                        onChange={(event) => updateListItem("spells", spell.id, "name", event.target.value)}
                      />
                    </Field>
                    {[
                      ["school", "Escola", 40],
                      ["casting_time", "Tempo de conjuração", 40],
                      ["range", "Alcance", 40],
                      ["components", "Componentes", 80],
                      ["duration", "Duração", 60],
                    ].map(([field, label, max]) => (
                      <Field key={field} label={label}>
                        <input
                          type="text"
                          maxLength={max}
                          value={spell[field]}
                          onChange={(event) => updateListItem("spells", spell.id, field, event.target.value)}
                        />
                      </Field>
                    ))}
                    <Field label="Rolagem">
                      <select
                        value={spell.roll}
                        onChange={(event) => updateListItem("spells", spell.id, "roll", event.target.value)}
                      >
                        <option value="none">Nenhuma</option>
                        <option value="attack">Ataque mágico</option>
                        <option value="save">Teste de resistência</option>
                      </select>
                    </Field>
                    {spell.roll === "save" && (
                      <Field label="Resistência de">
                        <select
                          value={spell.save_ability}
                          onChange={(event) => updateListItem("spells", spell.id, "save_ability", event.target.value)}
                        >
                          {ABILITIES.map((ability) => (
                            <option key={ability.key} value={ability.key}>
                              {ability.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Dano/cura (ex.: 8d6)">
                      <input
                        type="text"
                        maxLength={40}
                        value={spell.damage}
                        onChange={(event) => updateListItem("spells", spell.id, "damage", event.target.value)}
                      />
                    </Field>
                    <Field label="Tipo de dano">
                      <input
                        type="text"
                        maxLength={30}
                        value={spell.damage_type}
                        onChange={(event) => updateListItem("spells", spell.id, "damage_type", event.target.value)}
                      />
                    </Field>
                    <label className="sheet-check">
                      <input
                        type="checkbox"
                        checked={spell.concentration}
                        onChange={(event) => updateListItem("spells", spell.id, "concentration", event.target.checked)}
                      />
                      Concentração
                    </label>
                    <label className="sheet-check">
                      <input
                        type="checkbox"
                        checked={spell.ritual}
                        onChange={(event) => updateListItem("spells", spell.id, "ritual", event.target.checked)}
                      />
                      Ritual
                    </label>
                    <TextArea
                      label="Descrição"
                      rows={4}
                      value={spell.description}
                      onChange={(value) => updateListItem("spells", spell.id, "description", value)}
                    />
                    <TextArea
                      label="Em níveis superiores"
                      rows={2}
                      value={spell.higher_levels}
                      onChange={(value) => updateListItem("spells", spell.id, "higher_levels", value)}
                    />
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={() => removeListItem("spells", spell.id)}
                    >
                      Remover magia
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  const settingsTab = (
    <div className="sheet-settings">
      <div className="sheet-box">
        <h3>Rolagens</h3>
        <label className="sheet-check">
          <input
            type="checkbox"
            checked={sheet.settings.private_rolls}
            onChange={(event) => update(["settings", "private_rolls"], event.target.checked)}
          />
          Rolar só para o mestre (só você e o mestre veem no chat)
        </label>
        <p className="muted sheet-hint">
          Modificadores globais somam em todas as rolagens do tipo, como +1d4 de
          Bênção. Use expressões de dados, por exemplo 1d4 ou 2.
        </p>
        <div className="sheet-globals">
          {[
            ["global_attack", "Ataques"],
            ["global_damage", "Dano"],
            ["global_save", "Testes de resistência"],
            ["global_check", "Testes de atributo e perícias"],
          ].map(([field, label]) => (
            <Field key={field} label={label}>
              <input
                type="text"
                maxLength={40}
                placeholder="ex.: 1d4"
                value={sheet.settings[field]}
                onChange={(event) => update(["settings", field], event.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="sheet-box">
        <h3>Equipamento</h3>
        <label className="sheet-check">
          <input
            type="checkbox"
            checked={sheet.settings.track_encumbrance}
            onChange={(event) => update(["settings", "track_encumbrance"], event.target.checked)}
          />
          Calcular carga (Força × 7,5 kg)
        </label>
      </div>

      <div className="sheet-box">
        <h3>Ficha</h3>
        <div className="form-actions">
          <button
            className="text-button"
            type="button"
            onClick={() =>
              downloadText(
                `ficha-${name || "personagem"}.txt`,
                sheetToText({ ...character, name, data: sheet })
              )
            }
          >
            Baixar ficha (.txt)
          </button>

          {confirmDelete ? (
            <>
              <button className="text-button danger" type="button" onClick={handleDelete}>
                Sim, excluir a ficha
              </button>
              <button className="text-button" type="button" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button className="text-button danger" type="button" onClick={() => setConfirmDelete(true)}>
              Excluir ficha
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="sheet">
      <header className="sheet-header">
        <div className="sheet-portrait">
          {character.image_url ? (
            <img src={character.image_url} alt={`Retrato de ${name}`} />
          ) : (
            <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
          )}
          <label className="sheet-portrait-upload">
            Trocar imagem
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImage} />
          </label>
        </div>

        <div className="sheet-identity">
          <Field label="Nome do personagem" className="sheet-name">
            <input
              type="text"
              maxLength={60}
              value={name}
              onChange={(event) => updateName(event.target.value)}
              required
            />
          </Field>
          <div className="sheet-identity-grid">
            <Field label="Classe e nível">
              <input type="text" maxLength={80} value={sheet.class_level} onChange={(event) => update(["class_level"], event.target.value)} />
            </Field>
            <Field label="Nível total">
              <input
                type="number"
                min={1}
                max={20}
                value={sheet.level}
                onChange={(event) => update(["level"], toNumber(event.target.value))}
              />
            </Field>
            <Field label="Antecedente">
              <input type="text" maxLength={80} value={sheet.background} onChange={(event) => update(["background"], event.target.value)} />
            </Field>
            <Field label="Nome do jogador">
              <input type="text" maxLength={80} value={sheet.player_name} onChange={(event) => update(["player_name"], event.target.value)} />
            </Field>
            <Field label="Raça">
              <input type="text" maxLength={80} value={sheet.race} onChange={(event) => update(["race"], event.target.value)} />
            </Field>
            <Field label="Tendência">
              <input type="text" maxLength={40} value={sheet.alignment} onChange={(event) => update(["alignment"], event.target.value)} />
            </Field>
            <Field label="Pontos de experiência">
              <input
                type="number"
                min={0}
                value={sheet.xp}
                onChange={(event) => update(["xp"], toNumber(event.target.value))}
              />
            </Field>
          </div>
        </div>

        <div className="sheet-header-actions">
          <span className="muted" aria-live="polite">{saveState}</span>
          <button className="text-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </header>

      <div className="sheet-toolbar">
        <div className="tab-switch" role="tablist" aria-label="Seções da ficha">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="sheet-roll-mode" role="group" aria-label="Modo de rolagem">
          {ROLL_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={sheet.settings.roll_mode === mode ? "active" : ""}
              aria-pressed={sheet.settings.roll_mode === mode}
              onClick={() => update(["settings", "roll_mode"], mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {pendingRoll && (
        <div className="sheet-roll-prompt" role="dialog" aria-label="Tipo de rolagem">
          <span>Como rolar?</span>
          {ROLL_MODES.slice(0, 3).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="text-button"
              onClick={() => {
                const perform = pendingRoll;
                setPendingRoll(null);
                perform(mode);
              }}
            >
              {label}
            </button>
          ))}
          <button className="text-button danger" type="button" onClick={() => setPendingRoll(null)}>
            Cancelar
          </button>
        </div>
      )}

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      {lastRolls.length > 0 && (
        <ol className="sheet-last-rolls" aria-live="polite" aria-label="Últimas rolagens">
          {lastRolls.map((roll) => (
            <li key={roll.id}>
              <strong>{roll.roll.total}</strong> {roll.content.replace(`${name}: `, "")}
              <small className="muted"> {roll.roll.expression}{roll.private ? " · só para o mestre" : ""}</small>
            </li>
          ))}
        </ol>
      )}

      {tab === "main" && mainTab}
      {tab === "bio" && bioTab}
      {tab === "spells" && spellsTab}
      {tab === "settings" && settingsTab}
    </div>
  );
}

// Ficha aberta por cima da página (campanha, "Suas Fichas" ou mesa).
export function CharacterSheetModal({ characterId, onClose, onDeleted }) {
  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Ficha de personagem">
      <CharacterSheet characterId={characterId} onClose={onClose} onDeleted={onDeleted} />
    </div>
  );
}

export default CharacterSheet;
