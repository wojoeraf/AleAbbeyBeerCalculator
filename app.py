import json
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
DEFAULT_LANG = "de" if "de" in TRANSLATIONS else next(iter(TRANSLATIONS))

INGREDIENTS = load_json("ingredients.json")
INGREDIENT_MAP = {ing["id"]: ing for ing in INGREDIENTS}
BEER_STYLES = load_json("beer_styles.json")
STYLE_ORDER = list(BEER_STYLES.keys())

ATTRS = ["taste", "color", "strength", "foam"]


def get_translation_data(lang: str):
    if lang in TRANSLATIONS:
        return TRANSLATIONS[lang]
    return TRANSLATIONS.get(DEFAULT_LANG, {})


def get_localized_name(names, lang: str) -> str:
    if isinstance(names, dict):
        if lang in names:
            return names[lang]
        if DEFAULT_LANG in names:
            return names[DEFAULT_LANG]
        if names:
            return next(iter(names.values()))
    return str(names)


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
            "name": get_localized_name(BEER_STYLES[style_id].get("names", {}), lang),
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
            min_raw = request.form.get(f"min_{a}", "").strip()
            max_raw = request.form.get(f"max_{a}", "").strip()
            min_val = parse_and_clamp(min_raw)
            max_val = parse_and_clamp(max_raw)

            if mode == "any":
                display_min = f"{0.0:.1f}"
                display_max = f"{11.0:.1f}"
            elif mode == "ge":
                display_min = f"{min_val:.1f}" if min_val is not None else ""
                display_max = ""
            elif mode == "le":
                display_min = ""
                display_max = f"{max_val:.1f}" if max_val is not None else ""
            else:
                display_min = f"{min_val:.1f}" if min_val is not None else ""
                display_max = f"{max_val:.1f}" if max_val is not None else ""

            constraints[a] = SimpleNamespace(
                band=band_choice,
                mode=mode,
                min=display_min,
                max=display_max,
            )
    else:
        constraints = {
            a: SimpleNamespace(band="any", mode="any", min="0.0", max="11.0")
            for a in ATTRS
        }

    has_active_constraints = any(
        (constraints[a].band != "any") or (constraints[a].mode != "any")
        for a in ATTRS
    )

    style_min_map = {s: BEER_STYLES[s].get("min_counts", {}) for s in styles_ids}
    style_mins = BEER_STYLES.get(style, {}).get("min_counts", {})

    ingredients_for_template = [
        {
            "id": ing["id"],
            "name": get_localized_name(ing.get("names", {}), lang),
            "vec": ing.get("vec", []),
        }
        for ing in INGREDIENTS
    ]

    ingredient_display_map = {
        ing["id"]: get_localized_name(ing.get("names", {}), lang) for ing in INGREDIENTS
    }
    style_display_map = {
        sid: get_localized_name(BEER_STYLES[sid].get("names", {}), lang) for sid in styles_ids
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
        ingredients=ingredients_for_template,
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
