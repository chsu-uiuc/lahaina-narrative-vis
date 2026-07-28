##################################################################
# MAP DATA
# Build the exploration-map data: every West Maui listing as a point
# with its distance band and a 24-char activity history ('1' active,
# '0' listed but inactive, '-' absent that month)
# ----------------------------------------------------------------
# Raw data is assumed to be downloaded already 
# Run from the project root:
# RAW=./raw python3 pipeline/map_extract.py
# Output: docs/data/map_points.json, burn.geojson, westmaui.geojson
# Other inputs: see airbnb_extract.py header (snapshots) and burn_alt (ArcGIS)
# ----------------------------------------------------------------
# Source: https://data.insideairbnb.com/united-states/hi/hawaii/2026-06-21/visualisations/neighbourhoods.geojson
# License: CC BY 4.0, https://insideairbnb.com/get-the-data/
##################################################################

import csv, gzip, io, json, glob, os, re
from airbnb_extract import BANDS, load_burn, band_of, init

# id -> (lon, lat) from first appearance, raw precision
coord = {}
# id-> list of 24 chars
hist = {}


def collect():
    """Collect every West Maui listing's coordinates and 24-char activity history.

    Coordinates are taken from the first appearance only (Inside Airbnb
    re-jitters them every scrape) and kept at raw precision until output.
    """
    N = len(files)
    for t, fn in enumerate(files):
        with gzip.open(fn, "rb") as fh:
            for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
                if r["neighbourhood_cleansed"] != "Lahaina":
                    continue
                lid = r["id"]
                if lid not in coord:
                    try:
                        # keep raw precision: banding must use unrounded
                        # coordinates; rounding happens only at output
                        coord[lid] = (float(r["longitude"]), float(r["latitude"]))
                    except ValueError:
                        # skip rows with invalid coordinates
                        continue
                    hist[lid] = ["-"] * N
                try:
                    # Determine whether the listing is active this month: number_of_reviews_ltm > 0
                    act = float(r["number_of_reviews_ltm"] or 0) > 0
                except ValueError:
                    act = False
                # Record the activity status for this month in the history list
                hist[lid][t] = "1" if act else "0"


def write_points():
    """Write the collected West Maui listing points to docs/data/map_points.json,
    including their coordinates, band index, and activity history.
    """
    pts = []
    for lid, (lon, lat) in coord.items():
        h = "".join(hist[lid])
        if "1" not in h:
            # never active -> no info for the story
            continue
        # Only include listings that have been active at least once
        pts.append(
            [round(lon, 4), round(lat, 4),
            BANDS.index(band_of(lon, lat)), h]
        )

    # sort points by band index, then by latitude
    pts.sort(key=lambda p: (p[2], p[1]))
    with open("docs/data/map_points.json", "w") as f:
        json.dump(
            {
                "months": months,
                "bands": BANDS,
                "pts": pts
            },
            f, separators=(",", ":")
        )
    print(f"Wrote {len(pts)} / {len(coord)} points to docs/data/map_points.json")


def write_geo():
    """Write the burn and West Maui neighborhood GeoJSON files to 
    docs/data/burn.geojson and docs/data/westmaui.geojson."""
    RAW = os.environ.get("RAW", "./raw")
    burn = json.load(open(f"{RAW}/burn_alt.geojson"))
    slim = {"type": "FeatureCollection", "features": [
        {
            "type": "Feature",
            "properties": {},
            "geometry": f["geometry"]
        }
        for f in burn["features"]
    ]}
    # Write the slimmed-down burn GeoJSON to the output file
    with open("docs/data/burn.geojson", "w") as f:
        json.dump(slim, f, separators=(",", ":"))
    # Write the West Maui neighborhood GeoJSON to the output file
    nb = json.load(open(f"{RAW}/hi_neighbourhoods.geojson"))
    lah = [f for f in nb["features"]
           if f["properties"].get("neighbourhood") == "Lahaina"]
    assert len(lah) == 1
    # Ensure that exactly one feature corresponds to the Lahaina neighborhood
    with open("docs/data/westmaui.geojson", "w") as f:
        json.dump(
            {
                "type": "FeatureCollection", 
                "features":[
                    {
                        "type": "Feature",
                        "properties": {"name": "Lahaina district"},
                        "geometry": lah[0]["geometry"]
                    }
                ]
            },
            f, separators=(",", ":")
        )

    print(
        "Wrote docs/data/burn.geojson "
        f"(size={os.path.getsize('docs/data/burn.geojson')}) and "
        f"docs/data/westmaui.geojson (size={os.path.getsize('docs/data/westmaui.geojson')})"
    )


if __name__ == "__main__":
    files, months = init()
    load_burn()
    collect()
    write_points()
    write_geo()
