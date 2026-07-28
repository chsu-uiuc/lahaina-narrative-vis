##################################################################
# INSIDE AIRBNB MONTHLY SNAPSHOTS
# Process 24 monthly Inside Airbnb snapshots for Hawaii into
# monthly active-listing counts: West Maui (Lahaina district)
# vs four control regions (Kihei, Kaua'i, Hawai'i Island, O'ahu)
# ----------------------------------------------------------------
# Raw data is assumed to be downloaded already (24 files under
# $RAW/hi/{date}.csv.gz). 
# 
# Run from the project root:
# RAW=./raw python3 pipeline/airbnb_extract.py
# Output: docs/data/airbnb.json
# ----------------------------------------------------------------
# Source: https://data.insideairbnb.com/united-states/hi/hawaii/{date}/data/listings.csv.gz
# License: CC BY 4.0, https://insideairbnb.com/get-the-data/
# Snapshot dates: 2024-04-21 ... 2026-07-18 (24 monthly scrapes;
# however, no snapshots exist for 2026-01 - 2026-04)
##################################################################
# FIRE PERIMETER: West Maui (Lahaina district) vs control regions
# Lahaina fire perimeter (Hawaii Statewide GIS / public ArcGIS FeatureServer)
#
# burn_alt = actual burned area (used for analysis)
# burn_alt.geojson
# Source: https://services1.arcgis.com/x4h61KaW16vFs7PM/arcgis/rest/services/Lahaina_2023_Fire_Perimeter/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
# License: State of Hawaii public GIS data
##################################################################

import csv, gzip, io, json, glob, math, os, re

CONTROLS = ["Kihei (South Maui)", "Kaua'i", "Hawai'i Island", "O'ahu"]
files = []
months = []
# Burn Perimeter geometry
BANDS = ["inside", "0-1km", "1-3km", "3-6km", "6-12km", "12km+"]
# Equirectangular approximation: 1 deg latitude ~= 110.574 km (WGS84, equator
# value), 1 deg longitude ~= 111.320 * cos(lat) km. Constants from:
# https://en.wikipedia.org/wiki/Latitude#Meridian_distance_on_the_ellipsoid
# https://en.wikipedia.org/wiki/Longitude#Length_of_a_degree_of_longitude
# Approximation error (<0.3%) is far below the 150m coordinate jitter
# and the 1km minimum band width, so band assignment is insensitive to it.
# km per degree of latitude
KY = 110.574
# km per degree of longitude at West maui
KX = 111.320 * math.cos(math.radians(20.87))
# outer rings of every burned polygon, in (lon, lat)
rings = []
# all ring vertices projected to km, for nearest-distance search
VERTS = []
# listing id -> band, from FIRST-SEEN coordinates
# (jitter is re-randomized every scrape); also avoids recomputing
band_cache = {}


def init():
    global files, months
    RAW = os.environ.get("RAW", "./raw")
    # set field size
    csv.field_size_limit(10 ** 7)

    files = sorted(glob.glob(f"{RAW}/hi/*.csv.gz"))
    # use regex to extract months
    months = [
        re.search(r"(\d{4}-\d{2})-\d{2}\.csv\.gz$", f).group(1) for f in files
    ]
    print(months)
    print(len(files), months[0], months[-1])

    return files, months


def load_burn():
    """Load burned area polygons; keep outer rings only (holes = unburned pockets)"""
    global rings, VERTS
    RAW = os.environ.get("RAW", "./raw")
    burn = json.load(open(f"{RAW}/burn_alt.geojson"))
    for f in burn["features"]:
        geom = f["geometry"]
        if geom["type"] == "Polygon":
            # outer ring only
            rings.append(geom["coordinates"][0])
        elif geom["type"] == "MultiPolygon":
            # outer rings of all polygons in the multipolygon
            rings.extend(poly[0] for poly in geom["coordinates"])
    VERTS = [(lon * KX, lat * KY) for ring in rings for lon, lat, in ring]


def inside(lon, lat):
    """Ray casting: is the point inside any burned polygon?"""
    casting = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            # Check if the ray from the point crosses the edge of the polygon
            # If the ray crosses the edge, toggle the casting flag
            # The ray is cast horizontally to the right from the point; if it crosses the edge, the point is inside the polygon.
            if (yi > lat) != (yj > lat ) and (
                lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi
            ):
                casting = not casting
            j = i
    return casting


def dist_km(lon, lat):
    """Shortest distance from a point to the burn perimeter.

    Approximated as the distance to the nearest perimeter VERTEXT,
    not the nearest edge. The perimeter polygons carry ~720 vertices in total
    (all outer-ring points at the time of writing),loaded by load_burn(),
    spaced tens of meters apart along the boundary so the vertex-vs-edge error
    is bounded by half that spacing, far below the 150m coordinate jitter and
    the 1km minimum band width. True edge distance would not change any
    band assignment.
    """
    x, y = lon * KX, lat * KY
    return math.sqrt(min((x - vx) ** 2 + (y-vy) ** 2 for vx, vy in VERTS))


def band_of(lon, lat):
    """Return the band name for a point based on its distance to the burn perimeter."""
    if inside(lon, lat):
        return "inside"
    d = dist_km(lon, lat)
    for hi, name in [(1, "0-1km"), (3, "1-3km"), (6, "3-6km"), (12, "6-12km")]:
        if d < hi:
            return name
    return "12km+"


def scan(file_name):
    """One snapshot -> band counts dict.

    Counts active listings (number_of_reviews_ltm > 0) for Lahaina (West Maui)
    and the control regions defined in CONTROLS.

    Returns:
        dict: band counts dict
    """
    bc = {b: 0 for b in BANDS}
    cc = {c: 0 for c in CONTROLS}
    with gzip.open(file_name, "rb") as fh:
        for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
            grp = r["neighbourhood_group_cleansed"]
            nb = r["neighbourhood_cleansed"]

            # Cache the band for this listing before the activity filter
            if nb == "Lahaina" and r["id"] not in band_cache:
                try:
                    band_cache[r["id"]] = band_of(
                        float(r["longitude"]),
                        float(r["latitude"])
                    )
                except ValueError:
                    pass
            try:
                if float(r["number_of_reviews_ltm"] or 0) <= 0:
                    # active listings only
                    continue
            except ValueError:
                continue

            if nb == "Lahaina":
                # Whole Lahaina (West Maui) region
                if r["id"] in band_cache:
                    bc[band_cache[r["id"]]] += 1
            elif nb == "Kihei-Makena":
                cc["Kihei (South Maui)"] += 1
            elif grp == "Kauai":
                cc["Kaua'i"] += 1
            elif grp == "Hawaii":
                cc["Hawai'i Island"] += 1
            elif grp == "Honolulu":
                cc["O'ahu"] += 1
    return bc, cc


def process_airbnb_snapshots():
    """Scan all snapshots into per-band and per-control monthly series and write the airbnb.json file."""
    band_series = {b: [] for b in BANDS}
    ctrl_series = {c: [] for c in CONTROLS}
    for i, fn in enumerate(files):
        bc, cc = scan(fn)
        for b in BANDS:
            band_series[b].append(bc[b])
        for c in CONTROLS:
            ctrl_series[c].append(cc[c])
        print(
            f"{months[i]}: inside={bc['inside']} "
            f"0-1km={bc['0-1km']} 1-3km={bc['1-3km']}"
        )

    # expected 24 months
    assert len(months) == 24

    # assertions
    i0 = months.index("2024-08")
    assert band_series["0-1km"][i0] == 5, band_series["0-1km"][i0]
    assert band_series["0-1km"][-1] == 123, band_series["0-1km"][-1]
    assert sum(s[i0] for s in band_series.values()) == 2312
    assert sum(s[-1] for s in band_series.values()) == 2955

    out = {
        "months": months,
        "active_def": "number_of_reviews_ltm > 0",
        "bands": band_series,
        "control": ctrl_series
    }

    # ensures the data folder exists
    os.makedirs("docs/data", exist_ok=True)

    # write the json file
    with open("docs/data/airbnb.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print("wrote docs/data/airbnb.json")


if __name__ == "__main__":
    files, months = init()
    load_burn()
    process_airbnb_snapshots()
