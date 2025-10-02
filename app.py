
import itertools
import json
from typing import List, Dict, Tuple, Optional
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

def parse_numeric_constraint(op: str, val: Optional[float]) -> Tuple[float,float]:
    if val is None or op == "none": return (-1e9, 1e9)
    v = float(val)
    if op == "eq": return (v, v)
    if op == "ge": return (v, 1e9)
    if op == "le": return (-1e9, v)
    return (-1e9, 1e9)

# ============== Solvers ==============
def nnls_clip(A: np.ndarray, b: np.ndarray) -> np.ndarray:
    m, n = A.shape
    active = np.ones(n, dtype=bool)
    x = np.zeros(n)
    for _ in range(20):
        if active.sum() == 0: return x
        A_sub = A[:, active]
        try:
            x_sub, *_ = np.linalg.lstsq(A_sub, b, rcond=None)
        except np.linalg.LinAlgError:
            return x
        x_sub = np.maximum(x_sub, 0.0)
        x[:] = 0.0; x[active] = x_sub
        if (x >= -1e-9).all(): return x
        active[np.argmin(x)] = False
    return np.maximum(x,0.0)

def local_search_integer(A: np.ndarray, base: np.ndarray, L: np.ndarray, U: np.ndarray,
                         start_x: np.ndarray, total_cap: int, per_cap: int, min_x: np.ndarray) -> Optional[np.ndarray]:
    """Hill-climbing with lower bounds min_x and upper per_cap/total_cap."""
    x = np.clip(np.round(start_x).astype(int), 0, per_cap)
    x = np.maximum(x, min_x)
    def score(xv):
        if np.any(xv < min_x) or xv.sum()>total_cap: return (True,10**9,10**9,())
        y = A @ xv + base
        below = np.maximum(L - y, 0); above = np.maximum(y - U, 0)
        viol = float(below.sum() + above.sum())
        return (viol > 1e-9, int(xv.sum()), viol, tuple(xv.tolist()))
    best = x.copy(); best_score = score(best)
    improved = True; iters = 0
    while improved and iters < 2000:
        improved = False; iters += 1
        for i in range(len(x)):
            for d in (-1, 1):
                cand = best.copy()
                cand[i] = int(np.clip(cand[i] + d, min_x[i], per_cap))
                sc = score(cand)
                if sc < best_score:
                    best, best_score = cand, sc; improved = True
    if best_score[0]: return None
    return best

def solve_recipe(ingredients, style_name, numeric_cons, exactly_one_yellow, others_green,
                 total_cap, per_cap, preferred_yellow_attr=None, topk=10,
                 band_count_requirements: Optional[Dict[str,int]] = None):
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
    num_intervals = []
    for a in ATTRS:
        lo, hi = parse_numeric_constraint(*numeric_cons.get(a, ("none", None)))
        num_intervals.append((lo, hi))

    def allowed_intervals_for_attr(attr: str, force_band: Optional[str]):
        start_iv = num_intervals[ATTRS.index(attr)]
        if force_band is None:
            return [start_iv]
        segs = segments_for_band(style_name, attr, force_band)
        out = []
        for seg in segs:
            iv = intersect_interval(start_iv, seg)
            if iv: out.append(iv)
        return out

    yellow_attrs = [None]
    if exactly_one_yellow:
        yellow_attrs = ATTRS if preferred_yellow_attr is None else [preferred_yellow_attr]

    req_idx = list(np.where(min_x > 0)[0])
    other_idx = [i for i in range(n) if i not in req_idx]

    band_counts_req = band_count_requirements or {}

    solutions = []
    for yellow_attr in yellow_attrs:
        per_attr_lists = []
        for a in ATTRS:
            force = None
            if others_green and a != yellow_attr: force = "green"
            if yellow_attr == a: force = "yellow"
            per_attr_lists.append(allowed_intervals_for_attr(a, force))
        if any(len(lst)==0 for lst in per_attr_lists): continue

        for iv_box in itertools.product(*per_attr_lists):
            Lb = np.array([iv[0] for iv in iv_box], dtype=float)
            Ub = np.array([iv[1] for iv in iv_box], dtype=float)
            Lx = Lb - base; Ux = Ub - base

            subset_sizes = [len(req_idx), len(req_idx)+1, len(req_idx)+2, len(req_idx)+3]
            subset_sizes = [r for r in subset_sizes if r <= n and r >= len(req_idx)]
            baseline = A @ min_x
            for r in subset_sizes:
                for add_combo in itertools.combinations(other_idx, r - len(req_idx)):
                    S = tuple(sorted(req_idx + list(add_combo)))
                    AS = A[:, S]
                    corners = list(itertools.product(*[(Lx[k], Ux[k]) for k in range(4)]))
                    for t in corners:
                        b = np.array(t, dtype=float) - baseline
                        x0 = nnls_clip(AS, b)
                        x_full = min_x.astype(float).copy()
                        x_full[list(S)] += x0
                        cand = local_search_integer(A, base, Lb, Ub, x_full, total_cap, per_cap, min_x=min_x)
                        if cand is None: continue
                        y = A @ cand + base
                        bands = {a: (detect_band(style_name, a, float(y[i])) or "n/a") for i,a in enumerate(ATTRS)}
                        if exactly_one_yellow:
                            yellow_count = sum(1 for a in ATTRS if bands[a]=="yellow")
                            green_count  = sum(1 for a in ATTRS if bands[a]=="green")
                            if yellow_count != 1: continue
                            if others_green and green_count != (4-1): continue
                        ok = True
                        for i,a in enumerate(ATTRS):
                            lo,hi = num_intervals[i]
                            if y[i] < lo - 1e-9 or y[i] > hi + 1e-9:
                                ok = False; break
                        if not ok: continue
                        if band_counts_req:
                            counts = {'green':0,'yellow':0,'red':0}
                            for a in ATTRS:
                                bname = bands[a]
                                if bname in counts: counts[bname] += 1
                            for k,v in band_counts_req.items():
                                if v is None: continue
                                if counts.get(k,0) != v:
                                    ok = False; break
                            if not ok: continue
                        solutions.append({
                            "x": cand.tolist(),
                            "sum": int(cand.sum()),
                            "totals": y.round(3).tolist(),
                            "bands": bands,
                            "active": [ingredients[i]["name"] for i in np.where(cand>0)[0]],
                            "counts_by_name": {ingredients[i]["name"]: int(cand[i]) for i in range(n) if cand[i]>0},
                            "yellow_attr": yellow_attr
                        })

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
  <title>Ale Abey Rezept-Solver (Multi-Band + Pflichtzutaten + Bandzähler)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
    h1 { font-size: 1.6rem; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
    code { background: #f6f8fa; padding: 2px 6px; border-radius: 6px; }
    .pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:.85rem; }
    .green { background:#e6f7e9; color:#176b2c; }
    .yellow { background:#fff6cc; color:#8a6d00; }
    .red { background:#ffe6e6; color:#8a0000; }
    .btn { background:#111827; color:#fff; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; }
    .btn:hover { opacity: .9; }
    .muted { color:#666; font-size:.9rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <h1>🍺 Ale Abey – Rezept-Solver (Multi-Band + Pflichtzutaten + Bandzähler)</h1>
  <p class="muted">Fix für dtype-Fehler. Zusätzlich kann festgelegt werden, wie viele Eigenschaften <span class="pill green">grün</span>,
  <span class="pill yellow">gelb</span> oder <span class="pill red">rot</span> sein sollen.</p>
  <form method="post" action="{{ url_for('solve') }}">
    <div class="grid">
      <div class="card">
        <h3>Bierstil</h3>
        <label>Stil:
          <select name="style">
            {% for s in styles %}
              <option value="{{s}}" {% if s==style %}selected{% endif %}>{{s}}</option>
            {% endfor %}
          </select>
        </label>
        <p class="muted">Basiswerte: <span class="mono">{{ base }}</span></p>
        <p class="muted">Pflichtzutaten: 
          {% set mins = style_mins %}
          {% if mins %}
            {% for nm,c in mins.items() %}<code>{{nm}} ≥ {{c}}</code>{% endfor %}
          {% else %}–{% endif %}
        </p>
        <p>
          Max. Gesamt-Zutaten: <input type="number" name="total_cap" value="{{ total_cap }}" min="1" max="99">
          &nbsp; Pro Zutat: <input type="number" name="per_cap" value="{{ per_cap }}" min="1" max="99">
        </p>
      </div>
      <div class="card">
        <h3>Numerische Vorgaben</h3>
        <table>
          <tr><th>Eigenschaft</th><th>Operator</th><th>Wert</th></tr>
          {% for a in attrs %}
          <tr>
            <td>{{ a }}</td>
            <td>
              <select name="op_{{ a }}">
                <option value="none">–</option>
                <option value="ge" {% if reqs[a]["op"]=="ge" %}selected{% endif %}>&ge;</option>
                <option value="le" {% if reqs[a]["op"]=="le" %}selected{% endif %}>&le;</option>
                <option value="eq" {% if reqs[a]["op"]=="eq" %}selected{% endif %}>=</option>
              </select>
            </td>
            <td><input type="number" step="0.1" name="val_{{ a }}" value="{{ reqs[a]['val'] if reqs[a]['val'] is not none else '' }}"></td>
          </tr>
          {% endfor %}
        </table>
      </div>
      <div class="card">
        <h3>Spektrum-Regeln</h3>
        <p class="muted">Band-Zähler (0–4, leer = egal)</p>
        <p>
          Grün: <select name="count_green">
            <option value="">egal</option>
            {% for i in range(0,5) %}<option value="{{i}}" {% if count_green is not none and count_green==i %}selected{% endif %}>{{i}}</option>{% endfor %}
          </select>
          &nbsp; Gelb: <select name="count_yellow">
            <option value="">egal</option>
            {% for i in range(0,5) %}<option value="{{i}}" {% if count_yellow is not none and count_yellow==i %}selected{% endif %}>{{i}}</option>{% endfor %}
          </select>
          &nbsp; Rot: <select name="count_red">
            <option value="">egal</option>
            {% for i in range(0,5) %}<option value="{{i}}" {% if count_red is not none and count_red==i %}selected{% endif %}>{{i}}</option>{% endfor %}
          </select>
        </p>
        <p><label><input type="checkbox" name="others_green" {% if others_green %}checked{% endif %}> Alles andere im <span class="pill green">grünen</span> Bereich</label></p>
        <p><label><input type="checkbox" name="one_yellow" {% if one_yellow %}checked{% endif %}> Exakt eine Eigenschaft im <span class="pill yellow">gelben</span> Bereich</label></p>
        <p class="muted">Optional: Attribut für Gelb festlegen</p>
        <p>
          <select name="yellow_attr">
            <option value="">(egal)</option>
            {% for a in attrs %}
              <option value="{{a}}" {% if yellow_attr==a %}selected{% endif %}>{{a}}</option>
            {% endfor %}
          </select>
        </p>
      </div>
      <div class="card">
        <h3>Zutaten</h3>
        <table>
          <tr><th>Name</th><th>T</th><th>Farbe</th><th>Stärke</th><th>Schaum</th></tr>
          {% for ing in ingredients %}
            <tr>
              <td>{{ ing.name }}</td>
              {% for v in ing.vec %}<td>{{ '%.2f'|format(v) }}</td>{% endfor %}
            </tr>
          {% endfor %}
        </table>
      </div>
    </div>
    <p><button class="btn" type="submit">Rezept berechnen</button></p>
  </form>

  {% if solutions is defined %}
    <h2>Ergebnisse</h2>
    {% if solutions|length == 0 %}
      <p><strong>Keine Lösung</strong> unter den gegebenen Regeln gefunden.</p>
    {% else %}
      {% for s in solutions %}
        <div class="card">
          <h3>Gesamtzutaten: {{ s.sum }}</h3>
          <p><strong>Zutatenmix:</strong>
            {% for name, cnt in s.counts_by_name.items() %}
              <code>{{name}} × {{cnt}}</code>
            {% endfor %}
          </p>
          <p><strong>Ergebniswerte:</strong>
            Geschmack {{ s.totals[0] }}, Farbe {{ s.totals[1] }}, Stärke {{ s.totals[2] }}, Schaum {{ s.totals[3] }}
          </p>
          <p>
            {% for a in attrs %}
              {% set b = s.bands[a] %}
              <span class="pill {{ b }}">{{ a }}: {{ b }}</span>
            {% endfor %}
          </p>
          <details><summary>Roh-Vektor</summary><pre class="mono">{{ s.x }}</pre></details>
        </div>
      {% endfor %}
    {% endif %}
  {% endif %}

  <hr>
  <details>
    <summary>JSON ansehen</summary>
    <h3>Zutaten</h3>
    <pre class="mono">{{ ingredients_json }}</pre>
    <h3>Bierstile</h3>
    <pre class="mono">{{ styles_json }}</pre>
  </details>
  {% if debug_info %}
      <hr>
      <details open>
        <summary>Debug</summary>
        <pre class="mono">{{ debug_info | join('\n') }}</pre>
      </details>
    {% endif %}
</body>
</html>
"""

@app.route("/", methods=["GET"])
def index():
    style = list(BEER_STYLES.keys())[0]
    base = BEER_STYLES[style]["base"]
    reqs = {a: {"op":"none","val":None} for a in ATTRS}
    return render_template_string(
        INDEX_HTML,
        styles=list(BEER_STYLES.keys()),
        style=style,
        base=base,
        attrs=ATTRS,
        ingredients=[type("I",(object,),ing) for ing in INGREDIENTS],
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        reqs=reqs,
        others_green=False,
        one_yellow=False,
        yellow_attr="",
        total_cap=25,
        per_cap=25,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        count_green=None, count_yellow=None, count_red=None
    )

@app.route("/", methods=["POST"])
def solve():
    style = request.form.get("style")
    base = BEER_STYLES[style]["base"]
    total_cap = int(request.form.get("total_cap", "25"))
    per_cap = int(request.form.get("per_cap", "25"))
    reqs = {}
    for a in ATTRS:
        op = request.form.get(f"op_{a}", "none")
        val_raw = request.form.get(f"val_{a}", "").strip()
        val = float(val_raw) if val_raw != "" else None
        reqs[a] = {"op": op, "val": val}
    others_green = request.form.get("others_green") is not None
    one_yellow = request.form.get("one_yellow") is not None
    yellow_attr = request.form.get("yellow_attr") or None

    # band counts (0-4) or None
    def parse_count(name):
        raw = request.form.get(name, "").strip()
        return int(raw) if raw != "" else None
    count_green = parse_count("count_green")
    count_yellow = parse_count("count_yellow")
    count_red = parse_count("count_red")

    numeric_cons = {a: (reqs[a]["op"], reqs[a]["val"]) for a in ATTRS}
    band_counts = {}
    if count_green is not None: band_counts["green"] = count_green
    if count_yellow is not None: band_counts["yellow"] = count_yellow
    if count_red is not None: band_counts["red"] = count_red

    sols = solve_recipe(
        INGREDIENTS, style, numeric_cons,
        exactly_one_yellow=one_yellow,
        others_green=others_green,
        total_cap=total_cap, per_cap=per_cap,
        preferred_yellow_attr=yellow_attr, topk=10,
        band_count_requirements=band_counts if band_counts else None
    )

    # --- Diagnose: warum keine Lösung? ---
    debug_info = []

    # 1) Mindestmengen & Caps
    name_to_idx = {ing["name"]: i for i, ing in enumerate(INGREDIENTS)}
    min_x = np.zeros(len(INGREDIENTS), dtype=int)
    for nm, cnt in BEER_STYLES[style].get("min_counts", {}).items():
        if nm in name_to_idx:
            min_x[name_to_idx[nm]] = int(cnt)
    debug_info.append(f"min_x (Pflichtzutaten): {min_x.tolist()}")
    debug_info.append(f"Gesamt-Cap: {total_cap}, Pro-Zutat-Cap: {per_cap}")

    # 2) Numerische Intervalle je Attribut (aus ≥, ≤, =)
    def numeric_iv(op, val):
        if val is None or op == "none":
            return (-1e9, 1e9)
        v = float(val)
        if op == "eq": return (v, v)
        if op == "ge": return (v, 1e9)
        if op == "le": return (-1e9, v)
        return (-1e9, 1e9)

    num_iv = {a: numeric_iv(reqs[a]["op"], reqs[a]["val"]) for a in ATTRS}
    debug_info.append("Numerische Intervalle:")
    for a in ATTRS:
        debug_info.append(f"  {a}: {num_iv[a]}")

    # 3) Helfer für Band-Segmente und Schnittbildung
    def band_segments(style_name, attr, band):
        return [
            (seg["min"], seg["max"])
            for seg in BEER_STYLES[style_name]["bands"][attr]
            if seg["band"] == band
        ]

    def apply_force(attr, force_band, base_iv):
        if force_band is None:
            return [base_iv]
        ivs = []
        for lo, hi in band_segments(style, attr, force_band):
            lo2 = max(base_iv[0], lo)
            hi2 = min(base_iv[1], hi)
            if lo2 <= hi2:
                ivs.append((lo2, hi2))
        return ivs

    # 4) Erlaubte Intervalle nach "alles andere grün" / "genau eine gelb"
    yb = (yellow_attr if yellow_attr else None)

    if one_yellow:
        # Der Solver prüft alle Kandidaten, wenn kein Attribut vorgegeben ist.
        candidates = [yellow_attr] if yellow_attr else ATTRS
        for cand in candidates:
            if not cand:
                continue
            debug_info.append(f"--- Annahme: gelb = {cand} ---")
            for a in ATTRS:
                force = "yellow" if a == cand else ("green" if others_green else None)
                ivs = apply_force(a, force, num_iv[a])
                debug_info.append(f"  {a}: {ivs}")
    else:
        if others_green:
            debug_info.append("--- Regel aktiv: alles andere grün ---")
            for a in ATTRS:
                ivs = apply_force(a, "green", num_iv[a])
                debug_info.append(f"  {a}: {ivs}")
        else:
            debug_info.append("--- Keine Band-Erzwingung (nur numerisch) ---")

    # 5) Band-Zähler aus UI
    debug_info.append(
        f"Band-Zähler gewünscht: green={request.form.get('count_green') or 'egal'}, "
        f"yellow={request.form.get('count_yellow') or 'egal'}, "
        f"red={request.form.get('count_red') or 'egal'}"
    )

    # 6) Hinweis, falls leer
    if not sols:
        debug_info.append(
            "Hinweis: Wenn hier Intervalle leer sind, stimmen die Style-Bänder/Zutaten evtl. nicht mit dem Spiel überein.")

    return render_template_string(
        INDEX_HTML,
        styles=list(BEER_STYLES.keys()),
        style=style,
        base=base,
        attrs=ATTRS,
        ingredients=[type("I",(object,),ing) for ing in INGREDIENTS],
        ingredients_json=json.dumps(INGREDIENTS, indent=2, ensure_ascii=False),
        styles_json=json.dumps(BEER_STYLES, indent=2, ensure_ascii=False),
        reqs=reqs,
        others_green=others_green,
        one_yellow=one_yellow,
        yellow_attr=yellow_attr or "",
        total_cap=total_cap,
        per_cap=per_cap,
        solutions=sols,
        style_mins=BEER_STYLES[style].get("min_counts", {}),
        count_green=count_green, count_yellow=count_yellow, count_red=count_red,
        debug_info=debug_info
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
