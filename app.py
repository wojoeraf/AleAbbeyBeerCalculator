import json
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Dict, Optional, Set

from flask import Flask, request, render_template

app = Flask(__name__)
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(filename: str):
    with (DATA_DIR / filename).open("r", encoding="utf-8") as f:
        return json.load(f)


TRANSLATIONS = load_json("translations.json")
LANGUAGE_NAMES = {code: data.get("language_name", code) for code, data in TRANSLATIONS.items()}
DEFAULT_LANG = "en" if "en" in TRANSLATIONS else next(iter(TRANSLATIONS))

ATTRS = ["taste", "color", "strength", "foam"]

RAW_INGREDIENT_DATA = load_json("ingredients.json")


def get_localized_name(names, lang: str) -> str:
    if isinstance(names, dict):
        if isinstance(names.get(lang), str) and names[lang].strip():
            return names[lang]
        if isinstance(names.get(DEFAULT_LANG), str) and names[DEFAULT_LANG].strip():
            return names[DEFAULT_LANG]
        for value in names.values():
            if isinstance(value, str) and value.strip():
                return value
        return ""
    if isinstance(names, str):
        stripped = names.strip()
        return stripped if stripped else ""
    if names is None:
        return ""
    return str(names).strip()


def normalize_ingredients(payload, attrs):
    attr_len = len(attrs)

    if isinstance(payload, dict) and "categories" in payload:
        raw_categories = payload.get("categories", [])
    elif isinstance(payload, list):
        raw_categories = [
            {
                "id": "uncategorized",
                "names": {},
                "ingredients": payload,
            }
        ]
    else:
        raw_categories = []

    def sanitize_name_map(raw_names):
        sanitized = {}
        if isinstance(raw_names, dict):
            for key, value in raw_names.items():
                if isinstance(value, str):
                    candidate = value.strip()
                elif value is None:
                    continue
                else:
                    candidate = str(value).strip()
                if not candidate:
                    continue
                normalized_key = key if isinstance(key, str) else str(key)
                sanitized[normalized_key] = candidate
        return sanitized

    def parse_vector(raw_vec):
        if not isinstance(raw_vec, (list, tuple)):
            return None
        if attr_len and len(raw_vec) != attr_len:
            return None
        numeric = []
        for value in raw_vec:
            try:
                number = float(value)
            except (TypeError, ValueError):
                return None
            if not math.isfinite(number):
                return None
            numeric.append(number)
        return numeric

    normalized_categories = []
    canonical_list = []
    seen_ids = set()

    for category in raw_categories:
        if not isinstance(category, dict):
            continue
        raw_category_id = category.get("id", "")
        category_id = str(raw_category_id).strip() if raw_category_id is not None else ""
        if not category_id:
            category_id = "uncategorized"
        category_names = sanitize_name_map(category.get("names", {}))

        category_entry = {
            "id": category_id,
            "names": category_names,
            "ingredients": [],
        }

        raw_ingredients = category.get("ingredients", [])
        if not isinstance(raw_ingredients, list):
            raw_ingredients = []

        for ingredient in raw_ingredients:
            if not isinstance(ingredient, dict):
                continue
            raw_id = ingredient.get("id")
            if isinstance(raw_id, str):
                ing_id = raw_id.strip()
            elif raw_id is None:
                ing_id = ""
            else:
                ing_id = str(raw_id).strip()
            if not ing_id or ing_id in seen_ids:
                continue

            names = sanitize_name_map(ingredient.get("names", {}))
            vec = parse_vector(ingredient.get("vec", []))
            if vec is None:
                continue

            default_name = get_localized_name(names, DEFAULT_LANG)
            if not default_name:
                fallback_name = ingredient.get("name")
                if isinstance(fallback_name, str) and fallback_name.strip():
                    default_name = fallback_name.strip()
                else:
                    default_name = ing_id

            canonical_entry = {
                "id": ing_id,
                "name": default_name,
                "names": names,
                "vec": vec,
                "category": category_id,
            }

            category_entry["ingredients"].append(canonical_entry)
            canonical_list.append(canonical_entry)
            seen_ids.add(ing_id)

        if category_entry["ingredients"]:
            normalized_categories.append(category_entry)

    if not normalized_categories and canonical_list:
        normalized_categories.append(
            {
                "id": "uncategorized",
                "names": {},
                "ingredients": canonical_list,
            }
        )

    return normalized_categories, canonical_list


INGREDIENT_CATEGORIES, INGREDIENTS = normalize_ingredients(RAW_INGREDIENT_DATA, ATTRS)
INGREDIENT_MAP = {ing["id"]: ing for ing in INGREDIENTS}
BEER_STYLES = load_json("beer_styles.json")
STYLE_ORDER = list(BEER_STYLES.keys())


def get_translation_data(lang: str):
    if lang in TRANSLATIONS:
        return TRANSLATIONS[lang]
    return TRANSLATIONS.get(DEFAULT_LANG, {})


@app.route("/", methods=["GET", "POST"])
def index():
    lang_source = request.form if request.method == "POST" else request.args
    lang = lang_source.get("lang", DEFAULT_LANG)
    if lang not in TRANSLATIONS:
        lang = DEFAULT_LANG

    translation = get_translation_data(lang)
    ui_strings = translation.get("ui", {})
    attr_labels = translation.get("attr_labels", {})
    band_labels = translation.get("band_labels", {})
    mode_labels = translation.get("modes", {})

    styles_ids = STYLE_ORDER or list(BEER_STYLES.keys())
    if not styles_ids:
        styles_ids = []
    styles_for_template = [
        {
            "id": style_id,
            "name": get_localized_name(BEER_STYLES[style_id].get("names", {}), lang) or style_id,
        }
        for style_id in styles_ids
    ]

    default_style = styles_ids[0] if styles_ids else ""
    style_source = request.form if request.method == "POST" else request.args
    style = style_source.get("style", default_style)
    if style not in BEER_STYLES:
        style = default_style

    if request.method == "POST":
        total_cap = int(request.form.get("total_cap", "25") or 25)
        per_cap = int(request.form.get("per_cap", "25") or 25)
    else:
        total_cap = 25
        per_cap = 25

    constraints: Dict[str, SimpleNamespace] = {}
    selected_optional: Set[str] = set()

    def parse_and_clamp(raw: str) -> Optional[float]:
        if not raw:
            return None
        try:
            value = float(raw)
        except ValueError:
            return None
        return max(0.0, min(11.0, value))

    if request.method == "POST":
        ingredient_ids = set(INGREDIENT_MAP.keys())
        selected_optional = {
            name for name in request.form.getlist("optional_ingredients") if name in ingredient_ids
        }

        for a in ATTRS:
            band_choice = request.form.get(f"band_{a}", "any")
            mode = request.form.get(f"mode_{a}", "any")
            if mode not in {"any", "eq", "ge", "le"}:
                mode = "any"
            min_raw = request.form.get(f"min_{a}", "").strip()
            max_raw = request.form.get(f"max_{a}", "").strip()
            min_val = parse_and_clamp(min_raw)
            max_val = parse_and_clamp(max_raw)

            slider_value = 5.5
            if mode == "eq":
                base_value = min_val if min_val is not None else max_val
                if base_value is not None:
                    slider_value = base_value
                    display_min = f"{base_value:.1f}"
                    display_max = f"{base_value:.1f}"
                else:
                    display_min = ""
                    display_max = ""
            elif mode == "ge":
                if min_val is not None:
                    slider_value = min_val
                    display_min = f"{min_val:.1f}"
                else:
                    display_min = ""
                display_max = ""
            elif mode == "le":
                display_min = ""
                if max_val is not None:
                    slider_value = max_val
                    display_max = f"{max_val:.1f}"
                else:
                    display_max = ""
            else:
                display_min = ""
                display_max = ""

            constraints[a] = SimpleNamespace(
                band=band_choice,
                mode=mode,
                min=display_min,
                max=display_max,
                value=f"{slider_value:.1f}",
            )
    else:
        constraints = {
            a: SimpleNamespace(
                band="any", mode="any", min="", max="", value=f"{5.5:.1f}"
            )
            for a in ATTRS
        }

    has_active_constraints = any(
        (constraints[a].band != "any") or (constraints[a].mode != "any")
        for a in ATTRS
    )

    style_min_map = {s: BEER_STYLES[s].get("min_counts", {}) for s in styles_ids}
    style_mins = BEER_STYLES.get(style, {}).get("min_counts", {})

    ingredients_for_template = []
    if INGREDIENT_CATEGORIES:
        for category in INGREDIENT_CATEGORIES:
            cat_name = get_localized_name(category.get("names", {}), lang) or category.get("id", "")
            entries = []
            for ing in category.get("ingredients", []):
                ing_id = ing.get("id")
                ing_entry = INGREDIENT_MAP.get(ing_id)
                if not ing_entry:
                    continue
                entries.append(
                    {
                        "id": ing_entry["id"],
                        "name": get_localized_name(ing_entry.get("names", {}), lang)
                        or ing_entry.get("name")
                        or ing_entry["id"],
                        "vec": ing_entry.get("vec", []),
                    }
                )
            if entries:
                ingredients_for_template.append(
                    {
                        "id": category.get("id"),
                        "name": cat_name,
                        "ingredients": entries,
                    }
                )
    else:
        fallback_name = ui_strings.get("section_ingredients", "Ingredients")
        ingredients_for_template.append(
            {
                "id": "uncategorized",
                "name": fallback_name,
                "ingredients": [
                    {
                        "id": ing["id"],
                        "name": get_localized_name(ing.get("names", {}), lang),
                        "vec": ing.get("vec", []),
                    }
                    for ing in INGREDIENTS
                ],
            }
        )

    ingredient_display_map = {}
    for ing in INGREDIENTS:
        localized = get_localized_name(ing.get("names", {}), lang)
        ingredient_display_map[ing["id"]] = localized or ing.get("name") or ing["id"]
    style_display_map = {
        sid: get_localized_name(BEER_STYLES[sid].get("names", {}), lang) or sid for sid in styles_ids
    }

    languages = [
        {"code": code, "label": LANGUAGE_NAMES.get(code, code)} for code in TRANSLATIONS.keys()
    ]

    i18n_payload = {
        "lang": lang,
        "messages": translation.get("messages", {}),
        "ui": ui_strings,
        "ingredient_names": ingredient_display_map,
        "style_names": style_display_map,
    }

    meta_data = {
        "attrs": ATTRS,
        "attr_labels": attr_labels,
        "band_labels": band_labels,
    }

    return render_template(
        "index.html",
        lang=lang,
        languages=languages,
        styles=styles_for_template,
        style=style,
        attrs=ATTRS,
        attr_labels=attr_labels,
        band_labels=band_labels,
        mode_labels=mode_labels,
        ingredient_categories=ingredients_for_template,
        constraints=constraints,
        total_cap=total_cap,
        per_cap=per_cap,
        style_mins=style_mins,
        style_min_map=style_min_map,
        has_active_constraints=has_active_constraints,
        selected_optional=selected_optional,
        ingredients_data=INGREDIENTS,
        styles_data=BEER_STYLES,
        ui=ui_strings,
        i18n_payload=i18n_payload,
        meta_data=meta_data,
    )


@app.route("/impressum")
def impressum():
    return render_template("legal/impressum.html")


@app.route("/datenschutz")
def datenschutz():
    return render_template("legal/datenschutz.html")


@app.route("/kontakt")
def kontakt():
    return render_template("legal/kontakt.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
