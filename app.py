import json
import math
import re
from pathlib import Path
from types import SimpleNamespace
from typing import Dict, Optional, Set

from flask import Flask, request, render_template

app = Flask(__name__)
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(filename: str):
    with (DATA_DIR / filename).open("r", encoding="utf-8") as f:
        return json.load(f)


TRANSLATIONS = load_json("app_translations.json")
INGREDIENT_NAME_TRANSLATIONS = load_json("ingredient_translations.json")
BEER_STYLE_NAME_TRANSLATIONS = load_json("beer_styles_translations.json")
LANGUAGE_NAMES = {code: data.get("language_name", code) for code, data in TRANSLATIONS.items()}
DEFAULT_LANG = "en" if "en" in TRANSLATIONS else next(iter(TRANSLATIONS))

ATTRS = ["taste", "color", "strength", "foam"]

RAW_INGREDIENT_DATA = load_json("ingredients_official.json")


def enrich_with_ingredient_translations(ingredients, translations):
    if not isinstance(translations, dict):
        return

    for lang, mapping in translations.items():
        if not isinstance(mapping, dict):
            continue
        for ingredient in ingredients:
            ing_id = ingredient.get("id")
            if not ing_id:
                continue
            localized_name = mapping.get(ing_id)
            if not isinstance(localized_name, str):
                continue
            localized_name = localized_name.strip()
            if not localized_name:
                continue
            names = ingredient.setdefault("names", {})
            names[lang] = localized_name


def enrich_with_style_translations(styles, translations):
    if not isinstance(styles, dict) or not isinstance(translations, dict):
        return

    for lang, mapping in translations.items():
        if not isinstance(mapping, dict):
            continue

        for style_id, localized_name in mapping.items():
            if not isinstance(localized_name, str):
                continue

            localized_name = localized_name.strip()
            if not localized_name:
                continue

            style_entry = styles.get(style_id)
            if not isinstance(style_entry, dict):
                continue

            names = style_entry.get("names")
            if not isinstance(names, dict):
                names = {}
                style_entry["names"] = names

            names[lang] = localized_name


def slugify(value: str, fallback: str = "") -> str:
    if not isinstance(value, str):
        value = str(value or "")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_")
    cleaned = cleaned.lower()
    if cleaned:
        return cleaned
    cleaned = re.sub(r"[^a-z0-9]+", "_", fallback.lower()).strip("_")
    return cleaned or "ingredient"


def convert_official_payload(payload, attrs):
    if not isinstance(payload, list):
        return payload

    attr_field_map = {
        "taste": "flavor",
        "color": "color",
        "strength": "strength",
        "foam": "foam",
    }

    categories = {}
    seen_ids = set()

    for item in payload:
        if not isinstance(item, dict):
            continue

        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        name = name.strip()

        preferred_id_source = item.get("id") or name
        candidate_id = slugify(str(preferred_id_source), fallback=name)
        ingredient_id = candidate_id
        suffix = 2
        while ingredient_id in seen_ids:
            ingredient_id = f"{candidate_id}_{suffix}"
            suffix += 1
        seen_ids.add(ingredient_id)

        category_label = item.get("sub_category") or item.get("category") or "Misc"
        category_label = str(category_label)
        category_id = slugify(category_label, fallback="category")

        vec = []
        for attr in attrs:
            field = attr_field_map.get(attr, attr)
            try:
                value = float(item.get(field, 0) or 0)
            except (TypeError, ValueError):
                value = 0.0
            # Official payload encodes the attributes on a 0-20 scale while the
            # solver expects the handcrafted data's 0-2 range. Scale the
            # imported values down so the existing style thresholds remain
            # meaningful.
            vec.append(value * 0.1)

        try:
            base_cost = float(item.get("cost", 0) or 0)
        except (TypeError, ValueError):
            base_cost = 0.0

        seasonal_source = str(item.get("sub_category") or item.get("category") or "")
        seasonal_type = seasonal_source.lower()
        if "malt" in seasonal_type:
            seasonal_type = "malt"
        elif "hop" in seasonal_type:
            seasonal_type = "hops"
        elif "fruit" in seasonal_type:
            seasonal_type = "fruit"
        else:
            seasonal_type = seasonal_type.strip().replace(" ", "_")

        category_entry = categories.setdefault(
            category_id,
            {
                "id": category_id,
                "names": {"en": category_label},
                "ingredients": [],
            },
        )

        category_entry["ingredients"].append(
            {
                "id": ingredient_id,
                "names": {"en": name},
                "vec": vec,
                "cost": base_cost,
                "seasonal_type": seasonal_type,
                "category_label": category_label,
            }
        )

    return {"categories": list(categories.values())}


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

            for extra_key in ("cost", "seasonal_type", "category_label"):
                if extra_key in ingredient:
                    canonical_entry[extra_key] = ingredient[extra_key]

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


RAW_INGREDIENT_DATA = convert_official_payload(RAW_INGREDIENT_DATA, ATTRS)

INGREDIENT_CATEGORIES, INGREDIENTS = normalize_ingredients(RAW_INGREDIENT_DATA, ATTRS)
enrich_with_ingredient_translations(INGREDIENTS, INGREDIENT_NAME_TRANSLATIONS)
INGREDIENT_MAP = {ing["id"]: ing for ing in INGREDIENTS}
BEER_STYLES = load_json("beer_styles.json")
enrich_with_style_translations(BEER_STYLES, BEER_STYLE_NAME_TRANSLATIONS)
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
    selected_required: Set[str] = set()
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
        selected_required = {
            name for name in request.form.getlist("selected_ingredients") if name in ingredient_ids
        }
        selected_optional = {
            name for name in request.form.getlist("optional_ingredients") if name in ingredient_ids
        }

        for a in ATTRS:
            band_choice = request.form.get(f"band_{a}", "any")
            mode = request.form.get(f"mode_{a}", "any")
            if mode not in {"any", "eq", "ge", "le", "between"}:
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
            elif mode == "between":
                if min_val is not None:
                    slider_value = min_val
                    display_min = f"{min_val:.1f}"
                else:
                    display_min = ""
                if max_val is not None:
                    display_max = f"{max_val:.1f}"
                else:
                    display_max = ""
                if min_val is None and max_val is not None:
                    slider_value = max_val
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
        default_value = f"{5.5:.1f}"
        constraints = {
            a: SimpleNamespace(
                band="any",
                mode="eq",
                min=default_value,
                max=default_value,
                value=default_value,
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
                        "cost": float(ing_entry.get("cost") or 0),
                        "seasonal_type": ing_entry.get("seasonal_type"),
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
                        "cost": float(ing.get("cost") or 0),
                        "seasonal_type": ing.get("seasonal_type"),
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
        selected_required=selected_required,
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
