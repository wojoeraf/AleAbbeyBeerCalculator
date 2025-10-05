
import json
from types import SimpleNamespace
from typing import Dict, Optional, Set
from flask import Flask, request, render_template

app = Flask(__name__)

BEER_STYLES = {
    "Leichtes Ale": {
        "base": [0.0, 0.0, 0.0, 0.0],
        "min_counts": {"Helles Malz":1,"Standardhefe":1},
        "bands": {
            "taste": [
                {"band": "red",    "min":0.0, "max":0.99},
                {"band": "green",  "min":1.0, "max":2.99},
                {"band": "yellow", "min":3.0, "max": 3.99},
                {"band": "red",    "min":4.0, "max":1000.0},
            ],
            "color": [
                {"band": "red", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 4.99},
                {"band": "red", "min": 5.0, "max": 1000.0},
            ],
            "strength": [
                {"band": "red", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 2.99},
                {"band": "yellow", "min": 3.0, "max": 3.99},
                {"band": "red", "min": 4.0, "max": 1000.0},
            ],
            "foam": [
                {"band": "yellow", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 1000.0},
            ],
        },
    },
    "Blonde Ale": {
        "base": [0.0, 0.0, 0.0, 0.0],
        "min_counts": {"Grut":1,"Helles Malz":1,"Standardhefe":1},
        "bands": {
            "taste": [
                {"band":"red",    "min":0.0, "max":0.99},
                {"band":"yellow", "min":1.0, "max":1.99},
                {"band":"green",  "min":2.0, "max":3.99},
                {"band":"yellow", "min":4.0, "max":4.99},
                {"band":"red",    "min":5.0, "max":1000.0},
            ],
            "color": [
                {"band": "red", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 4.99},
                {"band": "red", "min": 5.0, "max": 1000.0},
            ],
            "strength": [
                {"band": "red", "min": 0.0, "max": 0.99},
                {"band": "yellow", "min": 1.0, "max": 1.99},
                {"band": "green", "min": 2.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 4.99},
                {"band": "red", "min": 5.0, "max": 1000.0},
            ],
            "foam": [
                {"band": "yellow", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 1000.0},
            ],
        },
    },
    "Old Ale": {
        "base": [0.0, 0.0, 0.0, 0.0],
        "min_counts": {"Grut":1,"Braunes Malz":1,"Helles Malz":1,"Standardhefe":1},
        "bands": {
            "taste": [
                {"band": "red",    "min":0.0, "max":1.99},
                {"band": "yellow", "min":2.0, "max": 2.99},
                {"band": "green",  "min":3.0, "max":5.99},
                {"band": "yellow", "min":6.0, "max": 7.99},
                {"band": "red",    "min":8.0, "max":1000.0},
            ],
            "color": [
                {"band": "red", "min": 0.0, "max": 2.99},
                {"band": "yellow", "min": 3.0, "max": 3.99},
                {"band": "green", "min": 4.0, "max": 5.99},
                {"band": "yellow", "min": 6.0, "max": 6.99},
                {"band": "red", "min": 7.0, "max": 1000.0},
            ],
            "strength": [
                {"band": "red", "min": 0.0, "max": 0.99},
                {"band": "yellow", "min": 1.0, "max": 1.99},
                {"band": "green", "min": 2.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 4.99},
                {"band": "red", "min": 5.0, "max": 1000.0},
            ],
            "foam": [
                {"band": "yellow", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 1000.0},
            ],
        },
    },
    "Kräuterbier": {
        "base": [0.0, 0.0, 0.0, 0.0],
        "min_counts": {"Eukalyptus":1,"Grut":1,"Honig":1,"Bernsteinfarbenes Malz":1,"Helles Malz":1,"Standardhefe":1},
        "bands": {
            "taste": [
                {"band": "red",    "min":0.0, "max":3.99},
                {"band": "yellow", "min":4.0, "max": 4.99},
                {"band": "green",  "min":5.0, "max":8.99},
                {"band": "yellow", "min":9.0, "max": 9.99},
                {"band": "red",    "min":10.0, "max":1000.0},
            ],
            "color": [
                {"band": "red", "min": 0.0, "max": 2.99},
                {"band": "yellow", "min": 3.0, "max": 3.99},
                {"band": "green", "min": 4.0, "max": 5.99},
                {"band": "yellow", "min": 6.0, "max": 6.99},
                {"band": "red", "min": 7.0, "max": 1000.0},
            ],
            "strength": [
                {"band": "red", "min": 0.0, "max": 1.99},
                {"band": "yellow", "min": 2.0, "max": 2.99},
                {"band": "green", "min": 3.0, "max": 6.99},
                {"band": "yellow", "min": 7.0, "max": 7.99},
                {"band": "red", "min": 8.0, "max": 1000.0},
            ],
            "foam": [
                {"band": "yellow", "min": 0.0, "max": 0.99},
                {"band": "green", "min": 1.0, "max": 3.99},
                {"band": "yellow", "min": 4.0, "max": 1000.0},
            ],
        },
    },
}
# ================= DATA =================
INGREDIENTS = [
    # name, (taste, color, strength, foam)
    {"name": "Standardhefe", "vec": [0.5, 0.0, -1.0, -0.5]},
    {"name": "Helles Malz", "vec": [0.4, 0.3, 1.0, 0.5]},
    {"name": "Grut", "vec": [0.5, -0.3, 0.0, 0.0]},
    {"name": "Braunes Malz", "vec": [1.6, 2.0, 0.0, 0.0]},
    {"name": "Eukalyptus", "vec": [1.0, 0.0, -0.2, -0.5]},
    {"name": "Bernsteinfarbenes Malz", "vec": [0.8, 1.2, 0.5, 0.8]},
    {"name": "Honig", "vec": [1, 0.3, 1.0, 0.0]},
    # Add more here...
]


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
