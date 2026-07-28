##################################################################
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

import csv, gzip, io, json, glob, math, os, re

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


CONTROLS = ["Kihei (South Maui)", "Kaua'i", "Hawai'i Island", "O'ahu"]


def scan(file_name):
    """One snapshot -> (lahaina_active_total, control_counts dict)."""
    lah = 0
    cc = {c: 0 for c in CONTROLS}
    with gzip.open(file_name, "rb") as fh:
        for r in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")):
            try:
                if float(r["number_of_reviews_ltm"] or 0) <= 0:
                    # active listings only
                    continue
            except ValueError:
                continue
            grp = r["neighbourhood_group_cleansed"]
            nb = r["neighbourhood_cleansed"]
            if nb == "Lahaina":
                 # Inside Airbnb's "Lahaina" = the whole West Maui district, 
                 # not the burned town
                lah += 1
            elif nb == "Kihei-Makena":
                cc["Kihei (South Maui)"] += 1
            elif grp == "Kauai":
                cc["Kaua'i"] += 1
            elif grp == "Hawaii":
                cc["Hawai'i Island"] += 1
            elif grp == "Honolulu":
                cc["O'ahu"] += 1
    return lah, cc


#print(scan(f"{RAW}/hi/2024-08-14.csv.gz"))


lah_series = []
ctrl_series = {c: [] for c in CONTROLS}
for fn in files:
    lah, cc = scan(fn)
    lah_series.append(lah)
    for c in CONTROLS:
        ctrl_series[c].append(cc[c])
    print(f"{months[len(lah_series)-1]}: lahaina={lah}")

# expected 24 months
assert len(months) == 24

i0 = months.index("2024-08")
assert lah_series[i0] == 2312, lah_series[i0]
assert lah_series[-1] == 2955, lah_series[-1]

out = {"months": months,
       "active_def": "number_of_reviews_ltm > 0",
       "lahaina_total": lah_series,
       "control": ctrl_series}

# ensures the data folder exists
os.makedirs("docs/data", exist_ok=True)

# write the json file
with open("docs/data/airbnb.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))

print("wrote docs/data/airbnb.json")
