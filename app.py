
import itertools
import json
from types import SimpleNamespace
from typing import List, Dict, Tuple, Optional, Set
import numpy as np
from flask import Flask, request, render_template_string

app = Flask(__name__)

BEER_STYLES = {
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
    {"name": "Grut", "vec": [0.5, -0.3, 0.0, 0.0]},
    {"name": "Honig", "vec": [1, 0.3, 1.0, 0.0]},
    {"name": "Helles Malz", "vec": [0.4, 0.3, 1.0, 0.5]},
    {"name": "Standardhefe", "vec": [0.5, 0.0, -1.0, -0.5]},
    {"name": "Eukalyptus", "vec": [1.0, 0.0, -0.2, -0.5]},
    {"name": "Braunes Malz", "vec": [1.6, 2.0, 0.0, 0.0]},
    {"name": "Bernsteinfarbenes Malz", "vec": [0.8, 1.2, 0.5, 0.8]},
    # Add more here...
]


ATTRS = ["taste","color","strength","foam"]
ATTR_LABELS = {
    "taste": "Geschmack",
    "color": "Farbe",
    "strength": "Stärke",
    "foam": "Schaum",
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
                 total_cap, per_cap, topk=10):
    A = np.array([ing["vec"] for ing in ingredients], dtype=float).T  # 4 x n
    base = np.array(BEER_STYLES[style_name]["base"], dtype=float)
    n = A.shape[1]

    name_to_idx = {ing["name"]: i for i, ing in enumerate(ingredients)}
    min_x = np.zeros(n, dtype=int)
    for nm, cnt in BEER_STYLES[style_name].get("min_counts", {}).items():
        if nm in name_to_idx: min_x[name_to_idx[nm]] = int(cnt)
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
INDEX_HTML = r"""
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Ale Abbey Rezept-Solver</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg-gradient: linear-gradient(135deg, #f7f4ff 0%, #eef9ff 100%);
      --card-bg: rgba(255, 255, 255, 0.92);
      --border: rgba(255, 255, 255, 0.6);
      --shadow: 0 20px 45px -24px rgba(16, 24, 40, 0.3);
      --primary: #f97316;
      --primary-dark: #ea580c;
      --text-muted: #5f6b7d;
      --pill-green-bg: #dcfce7;
      --pill-green-text: #166534;
      --pill-yellow-bg: #fef3c7;
      --pill-yellow-text: #a16207;
      --pill-red-bg: #fee2e2;
      --pill-red-text: #b91c1c;
      font-family: "Inter", "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg-gradient);
      color: #0f172a;
    }
    .page {
      max-width: 1140px;
      margin: 0 auto;
      padding: 40px 20px 64px;
    }
    header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 28px;
    }
    header h1 {
      font-size: clamp(2rem, 3vw, 2.6rem);
      margin: 0;
      font-weight: 700;
    }
    header p {
      margin: 0;
      color: var(--text-muted);
      max-width: 640px;
      line-height: 1.55;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
      padding: clamp(18px, 2vw, 24px);
    }
    .form-card {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .section-title {
      margin: 0 0 12px;
      font-size: 1.1rem;
      font-weight: 600;
    }
    .grid-two {
      display: grid;
      gap: 20px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    label span.label {
      display: block;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
      color: var(--text-muted);
      font-weight: 600;
    }
    select, input[type="number"] {
      width: 100%;
      border-radius: 12px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      padding: 10px 12px;
      font-size: 0.95rem;
      background: white;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    select:focus, input[type="number"]:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
    }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9rem;
      color: #1f2937;
      background: rgba(15, 23, 42, 0.06);
      cursor: pointer;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    .chip input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .chip[data-color="green"] { color: var(--pill-green-text); }
    .chip[data-color="yellow"] { color: var(--pill-yellow-text); }
    .chip[data-color="red"] { color: var(--pill-red-text); }
    .chip input:checked + span {
      background: rgba(15, 23, 42, 0.9);
      color: #fff;
    }
    .chip span {
      padding: 6px 12px;
      border-radius: inherit;
      transition: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .chip:hover span {
      transform: translateY(-1px);
    }
    .attr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 18px;
    }
    .attr-card {
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 16px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: rgba(255,255,255,0.85);
    }
    .attr-card h4 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
    }
    .range-inputs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 10px;
    }
    .range-inputs label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .hint {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin: 4px 0 0;
    }
    .btn-primary {
      align-self: flex-start;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 12px 20px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      background: var(--primary-dark);
      box-shadow: 0 14px 30px -20px rgba(234, 88, 12, 0.65);
    }
    .ingredients-table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 12px;
    }
    .ingredients-table th,
    .ingredients-table td {
      padding: 10px 12px;
      text-align: left;
      font-size: 0.92rem;
    }
    .ingredients-table thead {
      background: rgba(15, 23, 42, 0.85);
      color: #fff;
    }
    .ingredients-table tbody tr:nth-child(even) {
      background: rgba(15, 23, 42, 0.03);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.85rem;
    }
    .pill.green { background: var(--pill-green-bg); color: var(--pill-green-text); }
    .pill.yellow { background: var(--pill-yellow-bg); color: var(--pill-yellow-text); }
    .pill.red { background: var(--pill-red-bg); color: var(--pill-red-text); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    details summary {
      cursor: pointer;
      font-weight: 600;
      margin-bottom: 8px;
    }
    @media (max-width: 640px) {
      .range-inputs { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <h1>🍺 Ale Abbey – Rezept-Solver</h1>
      <p>Wähle für jede Eigenschaft die gewünschte Farbzone und lege exakte Wertebereiche fest. Der Solver berücksichtigt Pflichtzutaten, Mengenlimits und filtert passende Kombinationen für dich.</p>
    </header>

    <form method="post" action="{{ url_for('solve') }}" class="card form-card">
      <section>
        <h3 class="section-title">Grunddaten</h3>
        <div class="grid-two">
          <label>
            <span class="label">Bierstil</span>
            <select name="style">
              {% for s in styles %}
                <option value="{{ s }}" {% if s == style %}selected{% endif %}>{{ s }}</option>
              {% endfor %}
            </select>
          </label>
          <label>
            <span class="label">Maximale Gesamtmenge</span>
            <input type="number" name="total_cap" value="{{ total_cap }}" min="1" max="99">
          </label>
          <label>
            <span class="label">Maximal pro Zutat</span>
            <input type="number" name="per_cap" value="{{ per_cap }}" min="1" max="99">
          </label>
          <div>
            <span class="label">Pflichtzutaten</span>
            <div class="chips">
              {% if style_mins %}
                {% for ing, cnt in style_mins.items() %}
                  <span class="chip"><span>{{ ing }} × {{ cnt }}</span></span>
                {% endfor %}
              {% else %}
                <span class="chip"><span>Keine</span></span>
              {% endif %}
            </div>
            <p class="hint">Basiswerte: Geschmack {{ base[0] }}, Farbe {{ base[1] }}, Stärke {{ base[2] }}, Schaum {{ base[3] }}</p>
          </div>
        </div>
      </section>

      <section>
        <h3 class="section-title">Eigenschaften & Zielbereiche</h3>
        <div class="attr-grid">
          {% for a in attrs %}
            <div class="attr-card" data-attr-card>
              <h4>{{ attr_labels[a] }}</h4>
              <div>
                <span class="label">Band</span>
                <div class="chips">
                  <label class="chip">
                    <input type="radio" name="band_{{ a }}" value="any" {% if constraints[a].band == 'any' %}checked{% endif %}>
                    <span>Egal</span>
                  </label>
                  <label class="chip" data-color="green">
                    <input type="radio" name="band_{{ a }}" value="green" {% if constraints[a].band == 'green' %}checked{% endif %}>
                    <span>Grün</span>
                  </label>
                  <label class="chip" data-color="yellow">
                    <input type="radio" name="band_{{ a }}" value="yellow" {% if constraints[a].band == 'yellow' %}checked{% endif %}>
                    <span>Gelb</span>
                  </label>
                  <label class="chip" data-color="red">
                    <input type="radio" name="band_{{ a }}" value="red" {% if constraints[a].band == 'red' %}checked{% endif %}>
                    <span>Rot</span>
                  </label>
                </div>
              </div>
              <div>
                <span class="label">Numerische Vorgabe</span>
                <select name="mode_{{ a }}" class="mode-select">
                  <option value="any" {% if constraints[a].mode == 'any' %}selected{% endif %}>Kein Limit</option>
                  <option value="ge" {% if constraints[a].mode == 'ge' %}selected{% endif %}>Mindestens …</option>
                  <option value="le" {% if constraints[a].mode == 'le' %}selected{% endif %}>Höchstens …</option>
                  <option value="between" {% if constraints[a].mode == 'between' %}selected{% endif %}>Zwischen … und …</option>
                </select>
                <div class="range-inputs">
                  <label>Untergrenze
                    <input type="number" class="min-input" name="min_{{ a }}" step="0.1" min="0" max="11" value="{{ constraints[a].min }}">
                  </label>
                  <label>Obergrenze
                    <input type="number" class="max-input" name="max_{{ a }}" step="0.1" min="0" max="11" value="{{ constraints[a].max }}">
                  </label>
                </div>
                <p class="hint">Wertebereich 0.0 – 11.0, eine Nachkommastelle.</p>
              </div>
            </div>
          {% endfor %}
        </div>
      </section>

      <section>
        <h3 class="section-title">Zutatenübersicht</h3>
        <div class="table-wrapper">
          <table class="ingredients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Geschmack</th>
                <th>Farbe</th>
                <th>Stärke</th>
                <th>Schaum</th>
              </tr>
            </thead>
            <tbody>
              {% for ing in ingredients %}
                <tr>
                  <td>{{ ing.name }}</td>
                  <td>{{ '%.1f'|format(ing.vec[0]) }}</td>
                  <td>{{ '%.1f'|format(ing.vec[1]) }}</td>
                  <td>{{ '%.1f'|format(ing.vec[2]) }}</td>
                  <td>{{ '%.1f'|format(ing.vec[3]) }}</td>
                </tr>
              {% endfor %}
            </tbody>
          </table>
        </div>
      </section>

      <button class="btn-primary" type="submit">Rezept berechnen</button>
    </form>

    {% if solutions is defined %}
      <section style="margin-top: 32px;">
        <h2 class="section-title">Ergebnisse</h2>
        {% if solutions|length == 0 %}
          <p><strong>Keine Lösung</strong> unter den gegebenen Regeln gefunden.</p>
        {% else %}
          <div class="grid-two">
            {% for s in solutions %}
              <div class="card">
                <h3 style="margin-top:0;">Gesamtzutaten: {{ s.sum }}</h3>
                <p style="margin-bottom:8px; font-weight:600;">Zutatenmix</p>
                <div class="chips" style="margin-bottom:12px;">
                  {% for name, cnt in s.counts_by_name.items() %}
                    <span class="chip"><span>{{ name }} × {{ cnt }}</span></span>
                  {% endfor %}
                </div>
                <p style="margin:0 0 10px;">Geschmack {{ s.totals[0] }}, Farbe {{ s.totals[1] }}, Stärke {{ s.totals[2] }}, Schaum {{ s.totals[3] }}</p>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                  {% for a in attrs %}
                    {% set b = s.bands[a] %}
                    <span class="pill {{ b }}">{{ attr_labels[a] }}: {{ b|capitalize }}</span>
                  {% endfor %}
                </div>
                <details>
                  <summary>Roh-Vektor</summary>
                  <pre class="mono">{{ s.x }}</pre>
                </details>
              </div>
            {% endfor %}
          </div>
        {% endif %}
      </section>
    {% endif %}

    <section style="margin-top: 36px;" class="card">
      <details>
        <summary>JSON ansehen</summary>
        <h3 style="margin-top:16px;">Zutaten</h3>
        <pre class="mono">{{ ingredients_json }}</pre>
        <h3>Bierstile</h3>
        <pre class="mono">{{ styles_json }}</pre>
      </details>
      {% if debug_info %}
        <hr>
        <details open>
          <summary>Debug</summary>
          <pre class="mono">{{ debug_info | join('
') }}</pre>
        </details>
      {% endif %}
    </section>
  </div>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-attr-card]').forEach(card => {
        const modeSelect = card.querySelector('.mode-select');
        const minInput = card.querySelector('.min-input');
        const maxInput = card.querySelector('.max-input');

        const toggle = () => {
          const mode = modeSelect.value;
          if (mode === 'any') {
            minInput.disabled = true;
            maxInput.disabled = true;
          } else if (mode === 'ge') {
            minInput.disabled = false;
            maxInput.disabled = true;
          } else if (mode === 'le') {
            minInput.disabled = true;
            maxInput.disabled = false;
          } else {
            minInput.disabled = false;
            maxInput.disabled = false;
          }
        };

        toggle();
        modeSelect.addEventListener('change', toggle);
      });
    });
  </script>
</body>
</html>
"""

@app.route("/", methods=["GET"])
def index():
    style = list(BEER_STYLES.keys())[0]
    base = BEER_STYLES[style]["base"]
    constraints = {
        a: SimpleNamespace(band="any", mode="any", min="0.0", max="11.0")
        for a in ATTRS
    }
    return render_template_string(
        INDEX_HTML,
        styles=list(BEER_STYLES.keys()),
        style=style,
        base=base,
        attrs=ATTRS,
        attr_labels=ATTR_LABELS,
        ingredients=[type("I",(object,),ing) for ing in INGREDIENTS],
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        constraints=constraints,
        total_cap=25,
        per_cap=25,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        debug_info=[]
    )

@app.route("/", methods=["POST"])
def solve():
    style = request.form.get("style")
    base = BEER_STYLES[style]["base"]
    total_cap = int(request.form.get("total_cap", "25"))
    per_cap = int(request.form.get("per_cap", "25"))
    band_preferences: Dict[str, Optional[Set[str]]] = {}
    numeric_intervals: Dict[str, Tuple[float, float]] = {}
    constraints: Dict[str, SimpleNamespace] = {}

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

    sols = solve_recipe(
        INGREDIENTS,
        style,
        numeric_intervals,
        band_preferences,
        total_cap=total_cap,
        per_cap=per_cap,
        topk=10,
    )

    debug_info = []

    name_to_idx = {ing["name"]: i for i, ing in enumerate(INGREDIENTS)}
    min_x = np.zeros(len(INGREDIENTS), dtype=int)
    for nm, cnt in BEER_STYLES[style].get("min_counts", {}).items():
        if nm in name_to_idx:
            min_x[name_to_idx[nm]] = int(cnt)
    debug_info.append(f"min_x (Pflichtzutaten): {min_x.tolist()}")
    debug_info.append(f"Gesamt-Cap: {total_cap}, Pro-Zutat-Cap: {per_cap}")

    debug_info.append("Einstellungen je Attribut:")
    for a in ATTRS:
        lo, hi = numeric_intervals[a]
        lo_txt = "-∞" if lo <= -1e8 else f"{lo:.2f}"
        hi_txt = "∞" if hi >= 1e8 else f"{hi:.2f}"
        band_choice = constraints[a].band
        band_txt = "egal" if band_choice == "any" else band_choice
        debug_info.append(
            f"  {ATTR_LABELS[a]} → Band: {band_txt}, Intervall: [{lo_txt}, {hi_txt}]"
        )

    if not sols:
        debug_info.append(
            "Keine Kombination gefunden – prüfe Band- oder Wertebereiche.")

    return render_template_string(
        INDEX_HTML,
        styles=list(BEER_STYLES.keys()),
        style=style,
        base=base,
        attrs=ATTRS,
        attr_labels=ATTR_LABELS,
        ingredients=[type("I",(object,),ing) for ing in INGREDIENTS],
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        constraints=constraints,
        total_cap=total_cap,
        per_cap=per_cap,
        solutions=sols,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        debug_info=debug_info
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
