
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


BEER_STYLES = load_json("beer_styles.json")
INGREDIENTS = load_json("ingredients.json")


ATTRS = ["taste","color","strength","foam"]
ATTR_LABELS = {
    "taste": "Geschmack",
    "color": "Farbe",
    "strength": "Stärke",
    "foam": "Schaum",
}

BAND_LABELS = {
    "any": "Egal",
    "green": "Grün",
    "yellow": "Gelb",
    "red": "Rot",
    "n/a": "Keine Angabe",
}

# (Solver-Logik wird nun clientseitig ausgeführt)
# ================= Web UI =================


@app.route("/", methods=["GET", "POST"])
def index():
    styles = list(BEER_STYLES.keys())
    default_style = styles[0]
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
        ingredient_names = {ing["name"] for ing in INGREDIENTS}
        selected_optional = {
            name for name in request.form.getlist("optional_ingredients")
            if name in ingredient_names
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

    return render_template(
        "index.html",
        styles=styles,
        style=style,
        attrs=ATTRS,
        attr_labels=ATTR_LABELS,
        band_labels=BAND_LABELS,
        ingredients=INGREDIENTS,
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        constraints=constraints,
        total_cap=total_cap,
        per_cap=per_cap,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        style_min_map={s: BEER_STYLES[s].get("min_counts", {}) for s in styles},
        has_active_constraints=has_active_constraints,
        selected_optional=selected_optional,
        ingredients_data=INGREDIENTS,
        styles_data=BEER_STYLES,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
