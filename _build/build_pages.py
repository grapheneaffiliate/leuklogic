#!/usr/bin/env python3
"""Build the Abundance for All pages from _build/templates/*.html plus data/*.json and films.json.

Authoring model: edit a template or a JSON file, run `python3 _build/build_pages.py`, commit the generated HTML.
Generated: index.html, day/, needs/, press/, embed/, embed/widget/ (all committed; the site itself needs no build step).
Numbers on the pages come ONLY from data/needs.json and data/milestones.json (see SOURCES.md).
"""
import html, json, os, re, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://leuklogic.com"
T = os.path.join(R, "_build", "templates")
needs = json.load(open(f"{R}/data/needs.json"))
miles = json.load(open(f"{R}/data/milestones.json"))["milestones"]
films = json.load(open(f"{R}/films.json"))["films"]
opts = json.load(open(f"{R}/data/day-options.json"))
E = html.escape

TOOLS = [  # slug, name, one line (from the existing llms.txt, unchanged)
    ("quote", "QuickQuote", "Instant fixed-price quote for a bot, scraper, automation, dashboard or website."),
    ("statement-csv", "SwiftStatement", "Bank statement PDF to CSV or Excel. The statement never uploads."),
    ("subscription-scanner", "SubScan", "Every recurring charge in a bank CSV, ranked by yearly cost."),
    ("csv-diff", "DeltaCSV", "Compare two CSVs by a key column, not line order."),
    ("csv-json", "FlipCSV", "CSV to JSON and back, lossless, strict RFC 4180."),
    ("cron", "CronText", "A cron expression in plain English, with the next run times."),
    ("missed-call-calculator", "Missed-Call Cost Calculator", "What missed calls cost per year, and what a text-back could recover."),
    ("video-check", "CheckClip", "Will your video fit Shorts, TikTok, Reels and X?"),
    ("compress", "ShrinkKit", "Zip files and shrink images to fit an upload limit, offline."),
]
ICON = {
 "Food": '<path d="M12 21V8"/><path d="M12 12c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 12c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M12 17c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 17c3 0 5-2 5-5-3 0-5 2-5 5z"/>',
 "Water": '<path d="M12 3c3.5 4.2 6 7.2 6 10.2A6 6 0 0 1 6 13.200C6 10.200 8.500 7.200 12 3z"/>',
 "Shelter": '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
 "Health": '<path d="M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z"/><path d="M12 9.500v4M10 11.500h4"/>',
 "Energy": '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
 "Learning": '<path d="M4 5.500C6.500 4.500 9.500 4.500 12 6c2.500-1.500 5.500-1.500 8-.5V19c-2.500-1-5.500-1-8 .5-2.500-1.500-5.500-1.500-8-.5z"/><path d="M12 6v13.500"/>',
}

def fmt_val(n):
    v = n["value"]; u = n["unit"]
    s = f"{v:g}" if v != int(v) else f"{int(v)}"
    return s + ("%" if u.startswith("%") else "")

def tiles(more=True):
    out = []
    for n in needs["needs"]:
        out.append(f'''<article class="tile" id="t-{n["need"].lower()}">
  <h3><svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n["need"]]}</svg>{E(n["need"])}</h3>
  <div class="big">{E(fmt_val(n))}<small>{E(n["display_label"])}</small></div>
  <div class="meter" aria-hidden="true"><i style="--w:{n["meter_pct"]}%"></i></div>
  <p class="st">{E(n["stat_text"])}</p>
  <p class="chg">{E(n["could_change"])}</p>
  <p class="src">Source: <a href="{E(n["source_url"])}" rel="noopener">{E(n["source_name"])}</a> &middot; {n["year"]} &middot; <a href="{E(n["licence_url"])}" rel="noopener">CC BY 4.0</a></p>
</article>''')
    return "\n".join(out)

def beats():
    copy = {
     "Work": ("Robotics brings the work.", "Robots that plant, build, haul and repair could lift the heaviest and dullest labour off every back. We believe that frees people rather than replaces them: the work is the part nobody should have to do in order to eat.", "K1"),
     "Energy": ("Clean energy powers all of it.", "Machines and minds both run on electricity. Abundant, clean power is what makes everything else possible, and it has to be there for every household, not just some.", "K5"),
     "Knowing how": ("Superintelligence brings the knowing how.", "The best doctor's judgement, the best engineer's design, the best teacher's patience: knowledge that is scarce today. We believe superintelligence, built carefully and aimed at everyone, could put it within reach of anyone, anywhere, in their own language.", "K2"),
    }
    out, stage = [], []
    for i, ing in enumerate(needs["ingredients"]):
        h, p, k = copy[ing["ingredient"]]
        stage.append(f'<img src="/img/kf/{k}.webp" alt="" width="1000" height="1792" loading="lazy" decoding="async">')
        out.append(f'''<div class="beat rv">
  <div class="pic"><img src="/img/kf/{k}.webp" alt="AI-generated scene from the film: {E(ing["label"].lower())}" width="1000" height="1792" loading="lazy" decoding="async"></div>
  <p class="num">0{i+1} &middot; {E(ing["ingredient"])}</p>
  <h3>{E(h)}</h3>
  <p class="lead">{E(p)}</p>
  <p class="fact">{E(ing["stat_text"])}<span class="src">Source: <a href="{E(ing["source_url"])}" rel="noopener">{E(ing["source_name"])}</a> &middot; {ing["year"]}</span></p>
</div>''')
    return "\n".join(out), "\n".join(stage)

def timeline():
    out = []
    for m in miles:
        out.append(f'''<li class="rv {"rb" if m["kind"]=="robotics" else ""}">
  <div class="yr">{m["year"]}</div>
  <h3>{E(m["title"])}</h3>
  <p>{E(m["text"])}</p>
  <p class="s"><a href="{E(m["source_url"])}" rel="noopener">{E(m["source_name"])}</a></p>
</li>''')
    return "\n".join(out)

def ingfacts():
    return "\n".join(f'<li><b>{E(i["ingredient"])}.</b> {E(i["stat_text"])}<span>Source: <a href="{E(i["source_url"])}" rel="noopener">{E(i["source_name"])}</a>, {i["year"]}. {E(i["licence"])}.</span></li>' for i in needs["ingredients"])

def chips(kind):
    rows = opts["chores"] if kind == "chores" else opts["times"]
    return "\n".join(f'<button type="button" class="chip" data-id="{E(r[0])}" aria-pressed="false">{E(r[1])}</button>' for r in rows)

def film_html():
    out = []
    for f in films:
        links = "".join(f'<a class="btn {"btn-g" if i else "btn-p"}" href="{E(l["url"])}" rel="noopener">{E(l["label"])}</a>' for i, l in enumerate(f["links"]))
        out.append(f'''<article class="film rv in" data-film="{E(f["id"])}">
<div class="player"><span class="ailabel">AI-generated film</span><button class="posterbtn" type="button" style="background-image:url({E(f["poster"])})" aria-label="Play the film: {E(f["title"])}" data-mp4="{E(f["mp4"])}" data-poster="{E(f["poster"])}" data-title="{E(f["title"])}"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg></span></button></div>
<div class="txt"><p class="kick">{E(f["kind"])} &middot; {E(f["duration"])}</p><h3>{E(f["title"])}</h3><p class="lead">{E(f["description"])}</p><p class="meta">{E(f["aiLabel"])}</p><div class="links">{links}</div></div>
</article>''')
    return "\n".join(out)

def tools_grid():
    return "\n".join(f'<a href="/tools/{s}/"><b>{E(n)}</b><span>{E(d)}</span></a>' for s, n, d in TOOLS)

def explorer():
    tabs, panels = [], []
    for i, n in enumerate(needs["needs"]):
        k = n["need"].lower()
        tabs.append(f'<button type="button" role="tab" id="tab-{k}" aria-controls="p-{k}" aria-selected="{"true" if i==0 else "false"}" tabindex="{0 if i==0 else -1}"><svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n["need"]]}</svg>{E(n["need"])}</button>')
        panels.append(f'''<article class="xpanel xcard" role="tabpanel" id="p-{k}" aria-labelledby="tab-{k}" {"" if i==0 else "hidden"}>
  <h2>{E(n["need"])}</h2>
  <div class="big">{E(fmt_val(n))}<small>{E(n["display_label"])}</small></div>
  <div class="meter" aria-hidden="true"><i style="--w:{n["meter_pct"]}%"></i></div>
  <p class="st lead">{E(n["stat_text"])}</p>
  <h3>What we believe could change</h3>
  <p>{E(n["could_change"])}</p>
  <h3>Where the number comes from</h3>
  <dl class="meta">
    <dt>Measure</dt><dd>{E(n["gap"])} (indicator <a href="{E(n["source_url"])}" rel="noopener">{E(n["indicator"])}</a>)</dd>
    <dt>Year</dt><dd>{n["year"]} (the most recent value published for the world aggregate on {E(n["retrieved"])})</dd>
    <dt>Produced by</dt><dd>{E(n["underlying_source"])}</dd>
    <dt>Licence</dt><dd><a href="{E(n["licence_url"])}" rel="noopener">{E(n["licence"])}</a></dd>
    <dt>Data call</dt><dd><a href="{E(n["api_url"])}" rel="noopener">World Bank API response</a></dd>
  </dl>
</article>''')
    return "\n".join(tabs), "\n".join(panels)

def sources_table():
    rows = []
    for n in needs["needs"]:
        rows.append(f'<tr><th scope="row">{E(n["need"])}</th><td>{E(n["stat_text"])}</td><td>{n["year"]}</td><td><a href="{E(n["source_url"])}" rel="noopener">{E(n["source_name"])}</a></td><td><a href="{E(n["licence_url"])}" rel="noopener">CC BY 4.0</a></td></tr>')
    for n in needs["ingredients"]:
        rows.append(f'<tr><th scope="row">{E(n["ingredient"])} (ingredient)</th><td>{E(n["stat_text"])}</td><td>{n["year"]}</td><td><a href="{E(n["source_url"])}" rel="noopener">{E(n["source_name"])}</a></td><td>{E(n["licence"])}</td></tr>')
    return "\n".join(rows)

def press_assets():
    kf = "\n".join(f'<a class="asset" href="/img/kf/K{i}.webp" download><img src="/img/kf/K{i}.webp" alt="AI-generated keyframe K{i} from film V01" width="200" height="358" loading="lazy"><span>Keyframe {i}</span></a>' for i in range(7))
    return kf

# ---------------------------------------------------------------- partials
def head(m):
    t, d, path = m["title"], m["desc"], m["path"]
    url = SITE + path
    og = f'{SITE}/og/{m["og"]}.png'
    ld = [{"@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", "name": "LeukLogic", "url": SITE + "/",
           "logo": SITE + "/brand/page_avatar.png", "email": "tim@leuklogic.com",
           "description": "LeukLogic publishes Abundance for All, a mission site arguing that we should build superintelligence and robotics to provide all needs and reasonable wants for humanity. It also builds small software for businesses.",
           "sameAs": ["https://www.facebook.com/profile.php?id=61595238625290"]}]
    if "video" in m.get("ld", ""):
      for f in films:
        ld.append({"@context": "https://schema.org", "@type": "VideoObject", "name": f["title"], "description": f["description"] + " " + f["aiLabel"],
                   "thumbnailUrl": SITE + f["poster"], "uploadDate": f["uploadDate"], "duration": f["durationIso"], "contentUrl": SITE + f["mp4"],
                   "url": f["links"][0]["url"], "publisher": {"@id": SITE + "/#org"}, "isFamilyFriendly": True, "inLanguage": "en"})
    ldtxt = "\n".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False, separators=(",", ":")) + "</script>" for x in ld)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(t)}</title>
<meta name="description" content="{E(d)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0e2527">
<link rel="icon" href="/img/page_avatar.webp" type="image/webp">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LeukLogic: Abundance for All">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{E(m.get("ogtitle", t))}">
<meta property="og:description" content="{E(d)}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{E(m.get("ogalt", "Abundance for All: build superintelligence and robotics for every need and every reasonable want. Image is AI-generated."))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{E(m.get("ogtitle", t))}">
<meta name="twitter:description" content="{E(d)}">
<meta name="twitter:image" content="{og}">
{ldtxt}
<link rel="preload" href="/fonts/fraunces-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
{m.get("css", "")}<script>document.documentElement.classList.add("js")</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div id="prog" aria-hidden="true"></div>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="/"><img src="/img/page_avatar.webp" alt="" width="30" height="30">LeukLogic <span>Abundance for All</span></a>
    <nav aria-label="Main"><ul>
      <li class="hide-s"><a href="/needs/">Every need</a></li>
      <li class="hide-s"><a href="/#films">Films</a></li>
      <li class="hide-s"><a href="/press/">Press</a></li>
      <li><a class="btn btn-p btn-s" href="/day/">Design your day</a></li>
    </ul></nav>
  </div>
</header>
<main id="main">
'''

def footer(scripts):
    tl = "\n".join(f'<li><a href="/tools/{s}/">{E(n)}</a></li>' for s, n, d in TOOLS)
    return f'''</main>
<footer>
  <div class="wrap">
    <div class="fgrid">
      <div>
        <p class="mission">We should build superintelligence and robotics to provide all needs and reasonable wants for humanity.</p>
        <p>Published by <a href="/services/">LeukLogic</a>. Contact: <a href="mailto:tim@leuklogic.com">tim@leuklogic.com</a>.</p>
      </div>
      <div>
        <h4>Free tools</h4>
        <ul>
{tl}
          <li><a href="/services/dedupe/">Dedupe (service)</a></li>
        </ul>
      </div>
      <div>
        <h4>Explore</h4>
        <ul>
          <li><a href="/day/">Design your abundant day</a></li>
          <li><a href="/needs/">Every human need</a></li>
          <li><a href="/#films">The films</a></li>
          <li><a href="/lab/falsification-ledger/">Lab: the Falsification Ledger</a></li>
          <li><a href="/press/">Press kit</a></li>
          <li><a href="/embed/">Embed the explorer</a></li>
          <li><a href="https://www.facebook.com/profile.php?id=61595238625290" rel="noopener">Follow on Facebook</a></li>
        </ul>
      </div>
    </div>
    <p class="tiny">Film and keyframes are made with AI tools (visuals and narration): a vision, not footage of real events. Figures are sourced on <a href="/needs/">/needs/</a>. The Abundance for All pages set no cookies and load nothing from other sites.</p>
  </div>
</footer>
{scripts}
</body>
</html>
'''

def render(name):
    raw = open(f"{T}/{name}.html").read()
    meta_txt, body = raw.split("\n---\n", 1)
    m = {}
    for line in meta_txt.strip().splitlines():
        k, v = line.split(":", 1); m[k.strip()] = v.strip()
    scripts = "\n".join(f'<script src="{s}" defer></script>' for s in m.get("js", "").split() if s)
    b, st = beats()
    tabs, panels = explorer()
    rep = {"{{TILES}}": tiles(), "{{BEATS}}": b, "{{STAGE}}": st, "{{TIMELINE}}": timeline(), "{{TOOLS}}": tools_grid(),
           "{{TABS}}": tabs, "{{PANELS}}": panels, "{{SOURCES_TABLE}}": sources_table(), "{{KEYFRAMES}}": press_assets(),
           "{{RETRIEVED}}": needs["retrieved"], "{{INGFACTS}}": ingfacts(), "{{CHORE_CHIPS}}": chips("chores"), "{{TIME_CHIPS}}": chips("times"), "{{FILMS}}": film_html(), "{{FILM_IDS}}": ",".join(f["id"] for f in films)}
    for k, v in rep.items(): body = body.replace(k, v)
    assert "{{" not in body, name
    return m, body, scripts

open(f"{R}/js/options.js", "w").write("/* Generated by _build/build_pages.py from data/day-options.json. Do not edit. */\nwindow.AbundanceOptions=" + json.dumps({"chores": opts["chores"], "times": opts["times"]}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("wrote js/options.js")
PAGES = [("home", "index.html"), ("day", "day/index.html"), ("needs", "needs/index.html"), ("press", "press/index.html"), ("embed", "embed/index.html")]
for name, out in PAGES:
    m, body, scripts = render(name)
    p = os.path.join(R, out); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(head(m) + body + footer(scripts))
    print("wrote", out)

# the self-contained embeddable widget: no JS, inline CSS, same fonts; its own minimal document
tiles_html = tiles().replace('<a href="https://datacatalog', '<a target="_blank" href="https://datacatalog')
w = open(f"{T}/widget.html").read().replace("{{TILES}}", re.sub(r'<article class="tile"', '<article class="tile in"', tiles_html)).replace("{{RETRIEVED}}", needs["retrieved"])
os.makedirs(f"{R}/embed/widget", exist_ok=True); open(f"{R}/embed/widget/index.html", "w").write(w); print("wrote embed/widget/index.html")
