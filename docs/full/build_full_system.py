"""Convert full/*.mmd to drawio pages and merge into one multi-page file."""
import re
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

DRAWIO = r"C:\Program Files\draw.io\draw.io.exe"
ROOT = Path(r"c:\Users\HUAWEI\Desktop\V3-Advanced-Sales\docs\full")
OUT = Path(r"c:\Users\HUAWEI\Desktop\V3-Advanced-Sales\docs\as-full-system.drawio")

PAGES = [
    ("01-layers.mmd", "1 — System Layers"),
    ("02-app-pages.mmd", "2 — App Pages / Nav"),
    ("03-hub-pages.mmd", "3 — Dashboard Hub Tabs"),
    ("04-backend-api.mmd", "4 — Backend API"),
    ("05-settings-docker.mmd", "5 — Settings + Docker"),
]

def convert(mmd: Path, drawio: Path) -> None:
    subprocess.run(
        [DRAWIO, "-x", "-f", "xml", "-o", str(drawio), str(mmd)],
        check=True,
    )


def extract_diagram(path: Path, name: str, page_id: str) -> ET.Element:
    # draw.io may emit mxfile with namespaces; parse as XML
    text = path.read_text(encoding="utf-8")
    # Strip BOM
    if text.startswith("\ufeff"):
        text = text[1:]
    root = ET.fromstring(text)
    diagram = root.find("diagram")
    if diagram is None:
        raise SystemExit(f"no diagram in {path}")
    diagram.set("name", name)
    diagram.set("id", page_id)
    return diagram


def main() -> None:
    diagrams = []
    for i, (fname, title) in enumerate(PAGES, start=1):
        mmd = ROOT / fname
        tmp = ROOT / f"_tmp_{i}.drawio"
        print(f"converting {fname} ...")
        convert(mmd, tmp)
        diagrams.append(extract_diagram(tmp, title, f"page{i}"))

    mxfile = ET.Element("mxfile", host="Electron", type="device")
    for d in diagrams:
        mxfile.append(d)

    tree = ET.ElementTree(mxfile)
    ET.indent(tree, space="  ")
    OUT.write_bytes(b'<?xml version="1.0" encoding="UTF-8"?>\n')
    tree.write(OUT, encoding="utf-8", xml_declaration=False)
    # Fix: write properly
    xml = ET.tostring(mxfile, encoding="unicode")
    OUT.write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + xml, encoding="utf-8")
    print(f"wrote {OUT} with {len(diagrams)} pages")

    for i, (_, title) in enumerate(PAGES, start=1):
        png = ROOT / f"page-{i}.png"
        print(f"export page {i}: {title}")
        subprocess.run(
            [
                DRAWIO, "-x", "-f", "png", "--width", "2000",
                "--page-index", str(i),
                "-o", str(png), str(OUT),
            ],
            check=True,
        )


if __name__ == "__main__":
    main()
