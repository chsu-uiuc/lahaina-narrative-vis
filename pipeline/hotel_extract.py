##################################################################
# HAWAII TOURISM AUTHORITY HOTEL PERFORMANCE DATA EXTRACTION
# HTA hotel performance xlsx (2024-12 – 2026-05; each includes prior-year month)
# HTA PDF reports (all of 2023; each includes 2022 and 2019 same-month baselines)
# ----------------------------------------------------------------
# Raw data is assumed to be downloaded already 
# Run from the project root:
# RAW=./raw python3 pipeline/hotel_extract.py
# Output: docs/data/hotel.json
# ----------------------------------------------------------------
# Source (XLSX): https://www.hawaiitourismauthority.org/media/{id}/hawaii-hotel-performance-{month}.xlsx
# Source (PDF):  https://www.hawaiitourismauthority.org/media/{id}/hta-{month}-2023-hawaii-hotels-performance-final.pdf
#   {id} = numeric media id the HTA site assigns to each report's download link;
#   find it by hovering the report links on
#   https://www.hawaiitourismauthority.org/research/infrastructure-research/
#   (e.g. 13970 -> hawaii-hotel-performance-12-2024.xlsx)
# License: State of Hawaii public data (DBEDT/HTA visitor industry reports)
##################################################################

import json, re, subprocess, sys, zipfile, glob, os
import xml.etree.ElementTree as ET

# XML namespace for parsing XLSX sheet data
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
# Month name to month number mapping
MONTHS = {m: i+1 for i, m in enumerate(
    "january february march april may june july august september october november december".split()
)}

# YYYY-MM -> series of hotel performance data
series = {}
# month 1-12 -> baseline hotel performance data
baseline = {}
# Narrative event lines for the scene annotations. Kept in the data (not in
# the JS) so every annotation on the page carries its source with it.
events = [
    {
        "date": "2023-08-08", "label": "Lahaina wildfire",
        "src": "NIFC fire perimeter; 102 deaths (Maui County)"
    },
    {
        "date": "2023-10-08", "label": "West Maui phased tourism reopening begins",
        "src": "State of Hawai'i announcement"
     },
    {
        "date": "2024-05-13", "label": "85% of sheltered households moved out of hotels",
        "src": "Hawai'i Public Radio 2024-05-13"
     },
    {
        "date": "2024-06-10", "label": "FEMA/State Non-Congregate Sheltering program ends",
        "src": "Governor's office news release 2024-05-11; mauirecovers.org"
    }
]


def put(ym, occ, adr, src):
    """New reports carry revised values, so they overwrite older ones"""
    if ym not in series or src > series[ym]["src"]:
        # occ = occupancy rate for the month
        series[ym] = {
            "occ": round(occ, 1),
            "adr": round(adr),
            "src": src
        }


def parse_row(line):
    """Pull every numeric token (percent and dollars) from a table row."""
    vals = []
    # Use regex to find all percent and dollar values in the line
    for pct, dol in re.findall(r"(-?[\d.]+)%|\$([\d,.]+)", line):
        vals.append(float(pct) if pct else float(dol.replace(",", "")))

    return vals


def parse_pdfs():
    """Parse Lahaina hotel performance data from PDF files."""
    RAW = os.environ.get("RAW", "./raw")
    for fn in sorted(glob.glob(f"{RAW}/hta_pdf/*.pdf")):
        mon = MONTHS[re.search(r"([a-z]+)-2023", fn).group(1)]
        txt = subprocess.run(
            [
                "pdftotext", "-layout", fn, "-"
            ], 
            capture_output=True,
            text=True
        ).stdout
        # data rows = contain "Lahaina" and carry >= 8 numeric tokens
        # REASON: narrative sentences also mention "Lahaina" but carry only a few numbers
        rows = [
            parse_row(l) for l in txt.split("\n")
            if "Lahaina" in l and len(parse_row(l)) >= 8
        ]

        if len(rows) < 2:
            sys.exit(f"FATAL: {fn}: expected 2 Lahaina data rows, got {len(rows)}")

        # monthly vs 2022, monthly vs 2019 ytd rows come later
        mon22, mon19 = rows[0], rows[1]
        put(f"2023-{mon:02d}", mon22[0], mon22[3], src=0)
        # record baseline occupancy rates for the month
        baseline[mon] = {
            "occ2022": round(mon22[1], 1),
            "occ2019": round(mon19[1], 1)
        }


def xlsx_rows(fn):
    """Read the first worksheet of an XLSX file as a list of row value lists.

    An XLSX file is a zip archive containing XML files. Shared strings are stored
    in a separate XML file and referenced by index in the worksheet XML.
    This function reads the shared strings table and then reads the first worksheet,
    returning a list of rows, where each row is a list of cell values.
    """
    z = zipfile.ZipFile(fn)
    # Read the shared strings table from the XLSX zip file
    ss = []
    # Root element of the shared strings XML
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.iter(f"{NS}si"):
        # Concatenate all text elements within the shared string item
        ss.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    # Use the first worksheet in the XLSX file
    sheet = sorted(
                n for n in z.namelist()  
                if re.match(r"xl/worksheets/sheet\d+\.xml$", n)
            )[0]

    output = []
    for row in ET.fromstring(z.read(sheet)).iter(f"{NS}row"):
        vals = []
        for c in row.iter(f"{NS}c"):
            # Each cell may have a value element
            v = c.find(f"{NS}v")
            if v is None:
                vals.append(None)
            elif c.get("t") == "s":
                # Shared string: look up the value in the shared strings table
                vals.append(ss[int(v.text)])
            else:
                # Numeric or other value: try to convert to float, otherwise keep as text
                try: vals.append(float(v.text))
                except ValueError: vals.append(v.text)
        output.append(vals)

    return output


def parse_xlsx():
    """Parse all hta hotel performance XLSX files and record occupancy and ADR data."""
    RAW = os.environ.get("RAW", "./raw")
    for fn in sorted(glob.glob(f"{RAW}/hta_xlsx/*.xlsx")):
        # Extract the month and the year
        mm, yy = map(int, re.search(r"-(\d{2})-(\d{4})\.xlsx", fn).groups())
        lah = next(
                r for r in xlsx_rows(fn)
                if any(isinstance(c, str) and "Lahaina" in c for c in r)
            )

        # columns:  [_, _, label, occ_cur, occ_prev, _, adr_cur, adr_prev, ...]
        # occupancy is a 0-1 fraction in xlsx, pdf had percent, thus -> x100
        src = yy * 100 + mm
        put(f"{yy}-{mm:02d}", lah[3] * 100, lah[6], src)
        put(f"{yy-1}-{mm:02d}", lah[4] * 100, lah[7], src)


def write_json():
    """Write the collected hotel occupancy and ADR data to docs/data/hotel.json."""
    out_series = [{
        "m": k,
        "occ": v["occ"],
        "adr": v["adr"]
    } for k, v in sorted(series.items())]

    assert len(baseline) == 12

    got = {r["m"] for r in out_series}
    need = ({f"2023-{m:02d}" for m in range(1,13)}
            | {f"2024-{m:02d}" for m in range(1, 13)})
    assert need <= got, f"missing months: {sorted(need-got)}"

    # anchors verified against the report text by hand
    anchors = {"2023-08": 45.4, "2023-11": 73.3, "2024-09": 49.8, "2026-02": 76.3}
    for m, v in anchors.items():
        actual = next(r["occ"] for r in out_series if r["m"] == m)
        assert abs(actual - v) < 0.15, f"anchor {m}: {actual} != {v}"

    with open("docs/data/hotel.json", "w") as f:
        json.dump({
            "region": "Lahaina/Ka'anapali/Kapalua",
            "note": "Occupancy Oct 2023-spring 2024 includes displaced residents "
                    "and relief workers, per HTA report commentary (Oct/Nov/Dec 2023).",
            "series": out_series,
            "baseline": [{"month": m, **baseline[m]} for m in sorted(baseline)],
            "events": events,
        }, f, separators=(",", ":"))
    print(f"wrote docs/data/hotel.json ({len(out_series)} months)")


if __name__ == "__main__":
    parse_pdfs()
    parse_xlsx()
    write_json()
