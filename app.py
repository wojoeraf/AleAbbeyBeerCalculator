
import itertools
import json
from types import SimpleNamespace
from typing import List, Dict, Tuple, Optional, Set
import numpy as np
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

# ============== Helpers ==============
def intersect_interval(a: Tuple[float,float], b: Tuple[float,float]) -> Optional[Tuple[float,float]]:
    lo = max(a[0], b[0]); hi = min(a[1], b[1])
    if lo <= hi: return (lo, hi)
    return None

def detect_band(style: str, attr: str, value: float) -> Optional[str]:
    for seg in BEER_STYLES[style]["bands"][attr]:
        if seg["min"] - 1e-9 <= value <= seg["max"] + 1e-9:
            return seg["band"]
    return None

def segments_for_band(style: str, attr: str, band: str) -> List[Tuple[float,float]]:
    return [(seg["min"], seg["max"]) for seg in BEER_STYLES[style]["bands"][attr] if seg["band"] == band]

# ============== Solvers ==============
def solve_recipe(ingredients, style_name, numeric_intervals, band_preferences,
                 total_cap, per_cap, topk=10, extra_min_counts=None):
    A = np.array([ing["vec"] for ing in ingredients], dtype=float).T  # 4 x n
    base = np.array(BEER_STYLES[style_name]["base"], dtype=float)
    n = A.shape[1]

    name_to_idx = {ing["name"]: i for i, ing in enumerate(ingredients)}
    min_x = np.zeros(n, dtype=int)
    for nm, cnt in BEER_STYLES[style_name].get("min_counts", {}).items():
        if nm in name_to_idx: min_x[name_to_idx[nm]] = int(cnt)
    if extra_min_counts:
        for nm, cnt in extra_min_counts.items():
            if nm in name_to_idx:
                min_x[name_to_idx[nm]] = max(min_x[name_to_idx[nm]], int(cnt))
    min_sum = int(min_x.sum())
    if total_cap < min_sum: total_cap = min_sum

    # numeric constraints -> intervals
    num_intervals = [numeric_intervals[a] for a in ATTRS]

    def allowed_intervals_for_attr(attr: str, allowed_bands: Optional[List[str]]):
        start_iv = num_intervals[ATTRS.index(attr)]
        if not allowed_bands:
            return [start_iv]
        out: List[Tuple[float, float]] = []
        for band in allowed_bands:
            for seg in segments_for_band(style_name, attr, band):
                iv = intersect_interval(start_iv, seg)
                if iv and iv not in out:
                    out.append(iv)
        return out

    req_idx = list(np.where(min_x > 0)[0])
    solutions = []

    allowed_map: Dict[str, Optional[List[str]]] = {}
    for attr in ATTRS:
        pref = band_preferences.get(attr)
        if pref:
            allowed_map[attr] = sorted(pref)
        else:
            allowed_map[attr] = None

    per_attr_lists = []
    for a in ATTRS:
        ivs = allowed_intervals_for_attr(a, allowed_map[a])
        if not ivs:
            return []
        per_attr_lists.append(ivs)

    for iv_box in itertools.product(*per_attr_lists):
        Lb = np.array([iv[0] for iv in iv_box], dtype=float)
        Ub = np.array([iv[1] for iv in iv_box], dtype=float)

        if np.any(min_x > per_cap):
            continue

        suffix_min_counts = np.zeros(n + 1, dtype=int)
        for idx in range(n - 1, -1, -1):
            suffix_min_counts[idx] = int(min_x[idx]) + suffix_min_counts[idx + 1]
        if suffix_min_counts[0] > total_cap:
            continue

        suffix_lo = np.zeros((n + 1, 4), dtype=float)
        suffix_hi = np.zeros((n + 1, 4), dtype=float)
        for idx in range(n - 1, -1, -1):
            vec = A[:, idx]
            lo_cnt = int(min_x[idx])
            hi_cnt = int(per_cap)
            for k in range(4):
                coef = vec[k]
                if coef >= 0:
                    lo_val = coef * lo_cnt
                    hi_val = coef * hi_cnt
                else:
                    lo_val = coef * hi_cnt
                    hi_val = coef * lo_cnt
                suffix_lo[idx, k] = lo_val + suffix_lo[idx + 1, k]
                suffix_hi[idx, k] = hi_val + suffix_hi[idx + 1, k]

        counts = [0] * n
        seen_local = set()

        def dfs(idx: int, used: int, totals: np.ndarray):
            if used + suffix_min_counts[idx] > total_cap:
                return
            for k in range(4):
                min_possible = totals[k] + suffix_lo[idx, k]
                max_possible = totals[k] + suffix_hi[idx, k]
                if max_possible < Lb[k] - 1e-9 or min_possible > Ub[k] + 1e-9:
                    return

            if idx == n:
                if np.any(totals < Lb - 1e-9) or np.any(totals > Ub + 1e-9):
                    return
                key = tuple(counts)
                if key in seen_local:
                    return
                seen_local.add(key)
                bands = {a: (detect_band(style_name, a, float(totals[i])) or "n/a") for i, a in enumerate(ATTRS)}
                cand = np.array(counts, dtype=int)
                y = A @ cand + base
                solutions.append({
                    "x": counts.copy(),
                    "sum": int(cand.sum()),
                    "totals": y.round(3).tolist(),
                    "bands": bands,
                    "active": [ingredients[i]["name"] for i in np.where(cand > 0)[0]],
                    "counts_by_name": {ingredients[i]["name"]: int(cand[i]) for i in range(n) if cand[i] > 0},
                })
                return

            remaining_min_after = suffix_min_counts[idx + 1]
            max_c = min(per_cap, total_cap - used - remaining_min_after)
            min_c = int(min_x[idx])
            if max_c < min_c:
                return
            vec = A[:, idx]
            for c in range(min_c, max_c + 1):
                counts[idx] = c
                new_used = used + c
                new_totals = totals + vec * c
                for k in range(4):
                    min_possible = new_totals[k] + suffix_lo[idx + 1, k]
                    max_possible = new_totals[k] + suffix_hi[idx + 1, k]
                    if max_possible < Lb[k] - 1e-9 or min_possible > Ub[k] + 1e-9:
                        break
                else:
                    dfs(idx + 1, new_used, new_totals)
            counts[idx] = 0

        dfs(0, 0, base.copy())

    solutions.sort(key=lambda s: (s["sum"], s["totals"], s["x"]))
    seen = set(); uniq = []
    for s in solutions:
        key = tuple(s["x"])
        if key in seen: continue
        seen.add(key); uniq.append(s)
        if len(uniq) >= topk: break
    return uniq

# ================= Web UI =================


@app.route("/", methods=["GET", "POST"])
def index():
    styles = list(BEER_STYLES.keys())
    style = request.form.get("style", styles[0])
    if style not in BEER_STYLES:
        style = styles[0]

    total_cap = int(request.form.get("total_cap", "25"))
    per_cap = int(request.form.get("per_cap", "25"))
    base = BEER_STYLES[style]["base"]

    constraints: Dict[str, SimpleNamespace] = {}
    has_active_constraints = False
    solutions: Optional[List[Dict[str, object]]] = None
    debug_info: List[str] = []
    selected_optional: Set[str] = set()

    if request.method == "POST":
        band_preferences: Dict[str, Optional[Set[str]]] = {}
        numeric_intervals: Dict[str, Tuple[float, float]] = {}
        ingredient_names = {ing["name"] for ing in INGREDIENTS}
        selected_optional = {
            name for name in request.form.getlist("optional_ingredients")
            if name in ingredient_names
        }

        def parse_and_clamp(raw: str) -> Optional[float]:
            if not raw:
                return None
            try:
                value = float(raw)
            except ValueError:
                return None
            return max(0.0, min(11.0, value))

        for a in ATTRS:
            band_choice = request.form.get(f"band_{a}", "any")
            band_preferences[a] = None if band_choice == "any" else {band_choice}

            mode = request.form.get(f"mode_{a}", "any")
            min_raw = request.form.get(f"min_{a}", "").strip()
            max_raw = request.form.get(f"max_{a}", "").strip()
            min_val = parse_and_clamp(min_raw)
            max_val = parse_and_clamp(max_raw)

            lo, hi = -1e9, 1e9
            if mode == "ge":
                if min_val is None:
                    min_val = 0.0
                lo, hi = min_val, 1e9
            elif mode == "le":
                if max_val is None:
                    max_val = 11.0
                lo, hi = -1e9, max_val
            elif mode == "between":
                if min_val is None:
                    min_val = 0.0
                if max_val is None:
                    max_val = 11.0
                if min_val > max_val:
                    min_val, max_val = max_val, min_val
                lo, hi = min_val, max_val

            numeric_intervals[a] = (lo, hi)

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

        has_active_constraints = any(
            (constraints[a].band != "any") or (constraints[a].mode != "any")
            for a in ATTRS
        )

        extra_min_counts: Dict[str, int] = {}
        for nm in selected_optional:
            extra_min_counts[nm] = max(extra_min_counts.get(nm, 0), 1)

        solutions = solve_recipe(
            INGREDIENTS,
            style,
            numeric_intervals,
            band_preferences,
            total_cap=total_cap,
            per_cap=per_cap,
            topk=10,
            extra_min_counts=extra_min_counts,
        )

        name_to_idx = {ing["name"]: i for i, ing in enumerate(INGREDIENTS)}
        min_x = np.zeros(len(INGREDIENTS), dtype=int)
        for nm, cnt in BEER_STYLES[style].get("min_counts", {}).items():
            if nm in name_to_idx:
                min_x[name_to_idx[nm]] = int(cnt)
        for nm in selected_optional:
            if nm in name_to_idx:
                min_x[name_to_idx[nm]] = max(min_x[name_to_idx[nm]], 1)
        debug_info.append(f"min_x (Pflichtzutaten): {min_x.tolist()}")
        debug_info.append(f"Gesamt-Cap: {total_cap}, Pro-Zutat-Cap: {per_cap}")

        debug_info.append("Einstellungen je Attribut:")
        for a in ATTRS:
            lo, hi = numeric_intervals[a]
            lo_txt = "-∞" if lo <= -1e8 else f"{lo:.2f}"
            hi_txt = "∞" if hi >= 1e8 else f"{hi:.2f}"
            band_choice = constraints[a].band
            band_txt = BAND_LABELS.get(band_choice, band_choice)
            debug_info.append(
                f"  {ATTR_LABELS[a]} → Band: {band_txt}, Intervall: [{lo_txt}, {hi_txt}]"
            )

        if selected_optional:
            debug_info.append(
                "Zusätzliche gewünschte Zutaten: "
                + ", ".join(sorted(selected_optional))
            )

        if not solutions:
            debug_info.append(
                "Keine Kombination gefunden – prüfe Band- oder Wertebereiche."
            )
    else:
        constraints = {
            a: SimpleNamespace(band="any", mode="any", min="0.0", max="11.0")
            for a in ATTRS
        }

    return render_template(
        "index.html",
        styles=styles,
        style=style,
        base=base,
        attrs=ATTRS,
        attr_labels=ATTR_LABELS,
        band_labels=BAND_LABELS,
        ingredients=INGREDIENTS,
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        constraints=constraints,
        total_cap=total_cap,
        per_cap=per_cap,
        solutions=solutions,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        style_min_map={s: BEER_STYLES[s].get("min_counts", {}) for s in styles},
        debug_info=debug_info,
        has_active_constraints=has_active_constraints,
        selected_optional=selected_optional,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
