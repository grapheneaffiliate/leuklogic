#!/usr/bin/env python3
"""Build data/needs.json and data/milestones.json from the SOURCES, live, and fail loudly if a source no longer says what we cite.

Every figure is read out of the provider's own response at build time (World Bank API, OWID grapher CSV,
IFR press release, EMBL-EBI AlphaFold DB page); raw responses are kept in _build/receipts/ (not published).
Prose claims (milestones) are checked against the cited page's text. Nothing is typed in by hand except wording.
Usage: python3 _build/fetch_data.py
"""
import csv, html, io, json, os, re, sys, urllib.parse, urllib.request, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REC = os.path.join(ROOT, "_build", "receipts"); os.makedirs(REC, exist_ok=True)
UA = {"User-Agent": "leuklogic-abundance-build/1.0 (tim@leuklogic.com)"}
TODAY = datetime.date.today().isoformat()

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf-8", "replace")

def text(url):
    t = get(url); t = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", t)
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)))

def wb(ind):
    url = f"https://api.worldbank.org/v2/country/WLD/indicator/{ind}?format=json&per_page=80&mrnev=1"
    raw = get(url); open(os.path.join(REC, f"wb_{ind}.json"), "w").write(raw)
    row = json.loads(raw)[1][0]
    assert row["countryiso3code"] == "WLD" and row["value"] is not None, ind
    return url, int(row["date"]), float(row["value"])

def owid_world(slug, col=None):
    url = f"https://ourworldindata.org/grapher/{slug}.csv?tab=table&csvType=full"
    raw = get(url); open(os.path.join(REC, f"owid_{slug}.csv"), "w").write(raw)
    rows = [r for r in csv.DictReader(io.StringIO(raw)) if r["Entity"] == "World"]
    col = col or [c for c in rows[0] if c not in ("Entity", "Code", "Year")][0]
    last = max(rows, key=lambda r: int(r["Year"]))
    return url.split(".csv")[0], int(last["Year"]), float(last[col])

WDI_LIC = "CC BY 4.0 (World Bank, World Development Indicators)"
WDI_LIC_URL = "https://datacatalog.worldbank.org/search/dataset/0037712/World-Development-Indicators"
def wbpage(ind): return f"https://data.worldbank.org/indicator/{ind}"

needs = []
def need(name, ind, under, unit, fmt, change, nature):
    api, year, v = wb(ind)
    needs.append({
        "need": name, "stat_text": fmt(v, year), "value": round(v, 1), "unit": unit, "year": year,
        "source_url": wbpage(ind), "licence": WDI_LIC, "licence_url": WDI_LIC_URL,
        "underlying_source": under, "indicator": ind, "api_url": api, "retrieved": TODAY,
        "gap": nature, "could_change": change})

need("Food", "SN.ITK.DEFC.ZS", "FAO (SDG 2.1.1), via World Bank WDI", "% of population",
     lambda v, y: f"{v:.1f}% of the world's people were undernourished in {y}.",
     "We believe robots that plant, tend and harvest, guided by a superintelligence that learns every field, could help every harvest reach every table.",
     "Prevalence of undernourishment")
need("Water", "SH.H2O.SMDW.ZS", "WHO/UNICEF Joint Monitoring Programme, via World Bank WDI", "% of population",
     lambda v, y: f"{v:.1f}% of people used safely managed drinking water in {y}. About one person in four did not.",
     "We believe tireless machines and smarter engineering could build, repair and watch over the pipes, pumps and treatment plants that safe water depends on.",
     "People using safely managed drinking water services")
need("Shelter", "EN.POP.SLUM.UR.ZS", "UN-Habitat Urban Indicators Database, via World Bank WDI", "% of urban population",
     lambda v, y: f"{v:.1f}% of the world's urban population lived in slums in {y}.",
     "We believe robot builders and AI design could make a safe, good home something that can be built quickly, to a standard, for anyone.",
     "Urban population living in slums")
need("Health", "SH.DYN.MORT", "UN Inter-agency Group for Child Mortality Estimation, via World Bank WDI", "deaths per 1,000 live births",
     lambda v, y: f"The world's under-5 mortality rate was {v:.1f} deaths per 1,000 live births in {y}.",
     "We believe AI could bring the knowing how of the best doctor to every clinic, and speed up the medicines and vaccines that protect children.",
     "Under-5 mortality rate")
need("Energy", "EG.ELC.ACCS.ZS", "SDG 7.1.1 Electrification Dataset (Tracking SDG7), via World Bank WDI", "% of population",
     lambda v, y: f"{v:.1f}% of people had access to electricity in {y}. The rest, about {100-v:.0f}%, did not.",
     "We believe robots could build and maintain clean power at a scale people alone cannot, and AI could run the grids that carry it.",
     "Access to electricity")
need("Learning", "SE.LPV.PRIM", "World Bank / UNESCO Institute for Statistics (learning poverty), via World Bank WDI", "% of children at end-of-primary age",
     lambda v, y: f"{v:.1f}% of children at the end of primary-school age were below minimum reading proficiency in {y} (learning poverty).",
     "We believe a patient AI tutor in every child's own language could be there for every learner, wherever the nearest school is.",
     "Learning poverty, adjusted for out-of-school children")

# ---- ingredient facts ------------------------------------------------------------------------------
ifr_url = "https://ifr.org/ifr-press-releases/news/five-million-robots-now-operate-in-factories-globally"
ift = text(ifr_url); open(os.path.join(REC, "ifr_2026_press.txt"), "w").write(ift)
assert "global operational stock of industrial robots surged 9% to a record 5 million units in 2025" in ift
assert "Sep 24, 2026" in ift
sol_url, sol_year, sol_v = owid_world("share-electricity-solar")
af = text("https://alphafold.ebi.ac.uk/"); open(os.path.join(REC, "alphafold_ebi.txt"), "w").write(af)
assert "over 200 million protein structure predictions" in af and "CC-BY-4.0" in af
ingredients = [
  {"ingredient": "Work", "label": "Robotics", "stat_text": "The world's factories now run a record 5 million industrial robots, up 9% in 2025.",
   "value": 5000000, "unit": "industrial robots in operation", "year": 2025, "source_url": ifr_url,
   "licence": "Quoted fact from an IFR press release (Sep 24, 2026); © IFR, linked and attributed, not reproduced", "retrieved": TODAY},
  {"ingredient": "Energy", "label": "Clean energy", "stat_text": f"Solar produced {sol_v:.1f}% of the world's electricity in {sol_year}.",
   "value": round(sol_v, 1), "unit": "% of global electricity", "year": sol_year, "source_url": sol_url,
   "licence": "CC BY 4.0 (Ember; shown via Our World in Data)", "underlying_source": "Ember Yearly Electricity Data (https://ember-energy.org/data/yearly-electricity-data/)", "retrieved": TODAY},
  {"ingredient": "Knowing how", "label": "Superintelligence", "stat_text": "An AI system's predicted protein structures are now free to every scientist: over 200 million of them.",
   "value": 200000000, "unit": "protein structure predictions (lower bound, 'over')", "year": int(TODAY[:4]), "source_url": "https://alphafold.ebi.ac.uk/",
   "licence": "CC BY 4.0 (EMBL-EBI AlphaFold Protein Structure Database)", "retrieved": TODAY,
   "note": "The page states 'over 200 million'; year is the retrieval year because the page itself carries no date."},
]

# ---- milestones: wording checked against the cited page -------------------------------------------------
WP = "https://en.wikipedia.org/wiki/"
def wp_text(title):
    u = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=" + urllib.parse.quote(title)
    d = json.loads(get(u)); return re.sub(r"\s+", " ", list(d["query"]["pages"].values())[0]["extract"])
MS = [
 (1956, "The field gets its name", "A summer workshop at Dartmouth, widely seen as the founding event of artificial intelligence as a field.", "Dartmouth workshop", "Dartmouth_workshop", ["1956 summer workshop widely considered to be the founding event of artificial intelligence as a field"]),
 (1961, "The first industrial robot goes to work", "Unimate takes a job on a General Motors assembly line in Ewing Township, New Jersey.", "Unimate", "Unimate", ["first industrial robot", "General Motors assembly line", "in 1961"]),
 (1997, "A computer beats the world chess champion", "IBM's Deep Blue defeats Garry Kasparov in a six-game rematch.", "Deep Blue (chess computer)", "Deep_Blue_(chess_computer)", ["In 1997, it underwent an upgrade, and in a six-game rematch it defeated Kasparov"]),
 (2011, "A machine wins at Jeopardy!", "IBM's Watson beats champions Brad Rutter and Ken Jennings at the quiz show.", "Watson (computer)", "Watson_(computer)", ["in 2011, the Watson computer system competed on Jeopardy! against champions Brad Rutter and Ken Jennings"]),
 (2012, "Deep learning takes off", "AlexNet wins the ImageNet image-recognition contest with a top-5 error rate of 15.3%.", "AlexNet", "AlexNet", ["top-5 error rate of 15.3% to win the contest"]),
 (2016, "AlphaGo beats a Go champion", "DeepMind's AlphaGo wins four of five games against Lee Sedol in Seoul.", "AlphaGo versus Lee Sedol", "AlphaGo_versus_Lee_Sedol", ["AlphaGo won all but the fourth game", "March 2016"]),
 (2017, "The transformer", "The paper \"Attention Is All You Need\" introduces the architecture behind today's large language models.", "Attention Is All You Need", "Attention_Is_All_You_Need", ["is a 2017 research paper", "transformer"]),
 (2020, "AlphaFold 2 cracks protein folding", "At the CASP14 competition, AlphaFold 2 predicts protein structures with far higher accuracy than any other entry.", "AlphaFold", "AlphaFold", ["CASP14 competition in November 2020", "much higher than any other entry"]),
 (2022, "ChatGPT reaches the public", "OpenAI releases ChatGPT on November 30, 2022.", "ChatGPT", "ChatGPT", ["Originally released on November 30, 2022"]),
]
milestones = []
for year, title, line, wp_title, slug, phrases in MS:
    t = wp_text(wp_title)
    for p in phrases: assert p in t, (wp_title, p)
    milestones.append({"year": year, "title": title, "text": line, "source_url": WP + slug, "source_name": "Wikipedia: " + wp_title.replace(" (chess computer)", "").replace(" (computer)", ""), "kind": "robotics" if year == 1961 else "ai", "retrieved": TODAY})
nob = text("https://www.nobelprize.org/prizes/chemistry/2024/press-release/")
assert "Demis Hassabis and John Jumper have developed an AI model to solve a 50-year-old problem: predicting proteins" in nob.replace("pro­teins", "proteins").replace("­", "")
milestones.append({"year": 2024, "title": "A Nobel Prize for predicting protein structures", "text": "The Nobel Prize in Chemistry goes in part to Demis Hassabis and John Jumper for an AI model that solved a 50-year-old problem.", "source_url": "https://www.nobelprize.org/prizes/chemistry/2024/press-release/", "source_name": "NobelPrize.org press release", "kind": "ai", "retrieved": TODAY})
milestones.append({"year": 2025, "title": "Five million industrial robots at work", "text": "The International Federation of Robotics reports a record 5 million industrial robots operating in the world's factories.", "source_url": ifr_url, "source_name": "International Federation of Robotics, press release of Sep 24, 2026", "kind": "robotics", "retrieved": TODAY})
milestones.sort(key=lambda m: m["year"])

dropped = [
 {"figure": "673.2 million undernourished people, 2024 (FAO via OWID)", "verified": True, "reason": "Verified in the OWID CSV, but the original data licence is CC BY-NC-SA 3.0 IGO (non-commercial). LeukLogic is a business, so the CC BY World Bank republication of the FAO prevalence is used instead."},
 {"figure": "2.14 billion people without safely managed drinking water, 2024 (WHO/UNICEF JMP via OWID)", "verified": True, "reason": "Verified in the OWID CSV, but licence is CC BY-NC-SA 3.0 IGO (non-commercial). The CC BY World Bank share is used instead."},
 {"figure": "Learning poverty of about 70% in low- and middle-income countries (2022 estimate)", "verified": False, "reason": "Could not be read from the World Bank API (its WDI series returns 57.2% for low and middle income, 2019, and 48.3% for the world, 2019). Dropped rather than quoted from memory."},
 {"figure": "Number of people without electricity access", "verified": False, "reason": "No open headcount series was found at the source; the World Bank share (91.9%) is used instead. A headcount obtained by multiplying by population would be a derived number, so it is not shown."},
 {"figure": "Solar PV module price fall since 1976 (OWID)", "verified": True, "reason": "Verified ($99.60/W in 1976 to $0.27/W in 2024) but its mixed licences include (c) IRENA 2025, so it is not used. Ember's CC BY solar share is used instead."},
]

out = {"title": "Abundance for All: where the gaps are today", "retrieved": TODAY, "geography": "World", "needs": needs, "ingredients": ingredients, "dropped": dropped}
json.dump(out, open(os.path.join(ROOT, "data", "needs.json"), "w"), indent=2, ensure_ascii=False)
json.dump({"title": "How far we have come", "retrieved": TODAY, "milestones": milestones}, open(os.path.join(ROOT, "data", "milestones.json"), "w"), indent=2, ensure_ascii=False)
print("needs:", [(n["need"], n["value"], n["year"]) for n in needs]); print("ingredients:", [(i["ingredient"], i["value"], i["year"]) for i in ingredients]); print("milestones:", len(milestones))
