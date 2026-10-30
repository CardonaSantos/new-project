#!/usr/bin/env python3
"""Validate the real REP-2B binaries using only the Python stdlib.
Runs after TypeScript unit tests and checks actual ZIP/XML, not string mocks.
"""
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

root = Path("/tmp/rep2b-smoke")
xlsx, pdf, csv = root / "report.xlsx", root / "report.pdf", root / "report.csv"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
with ZipFile(xlsx) as archive:
    assert archive.testzip() is None, "Corrupt ZIP member"
    files = set(archive.namelist())
    required = {"[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
                "xl/_rels/workbook.xml.rels", "xl/styles.xml"}
    required.update(f"xl/worksheets/sheet{n}.xml" for n in (1, 2, 3))
    assert required <= files, f"Missing OOXML parts: {required - files}"
    xml = {path: ET.fromstring(archive.read(path)) for path in files if path.endswith(".xml") or path.endswith(".rels")}
    styles = xml["xl/styles.xml"]
    names = [node.tag.rsplit("}", 1)[-1] for node in styles]
    expected = ["numFmts", "fonts", "fills", "borders", "cellStyleXfs",
                "cellXfs", "cellStyles", "tableStyles"]
    assert [x for x in names if x in expected] == expected, "Styles children out of ISO OOXML order"
    xfs = styles.find("m:cellXfs", NS)
    assert xfs is not None
    xfs_list = list(xfs)
    assert int(xfs.attrib["count"]) == len(xfs_list)
    fonts = styles.find("m:fonts", NS)
    fills = styles.find("m:fills", NS)
    borders = styles.find("m:borders", NS)
    for node in (fonts, fills, borders):
        assert node is not None and int(node.attrib["count"]) == len(list(node))
    for style in xfs_list:
        assert int(style.attrib.get("fontId", 0)) < len(fonts)
        assert int(style.attrib.get("fillId", 0)) < len(fills)
        assert int(style.attrib.get("borderId", 0)) < len(borders)
    wb = xml["xl/workbook.xml"]
    sheets = wb.findall("m:sheets/m:sheet", NS)
    assert [sheet.attrib["name"] for sheet in sheets] == ["Resumen", "Diario", "Detalle"]
    for n in (1, 2, 3):
        sheet = xml[f"xl/worksheets/sheet{n}.xml"]
        assert sheet.find("m:cols", NS) is not None, "Missing actual column widths"
        assert sheet.find("m:sheetData", NS) is not None
        for cell in sheet.findall(".//m:c", NS):
            assert int(cell.attrib.get("s", 0)) < len(xfs_list), "Out-of-range style ID"
        merge = sheet.find("m:mergeCells", NS)
        if merge is not None:
            assert int(merge.attrib["count"]) == len(list(merge))
            for mc in merge:
                assert re.match(r"^[A-Z]+\d+:[A-Z]+\d+$", mc.attrib["ref"])
    summary = archive.read("xl/worksheets/sheet1.xml").decode()
    diario = archive.read("xl/worksheets/sheet2.xml").decode()
    detalle = archive.read("xl/worksheets/sheet3.xml").decode()
    assert "INDICADORES PRINCIPALES" in summary
    assert "RESUMEN DEL D" in diario
    assert "2026-10-30" in diario
    assert "autoFilter" in detalle and "<f>SUM(" in detalle
    assert "0.000000" in archive.read("xl/styles.xml").decode()
    assert "=bad_formula()" in detalle and "<f>bad_formula()" not in detalle
raw = pdf.read_bytes()
assert raw.startswith(b"%PDF-1.4")
assert raw.rstrip().endswith(b"%%EOF")
xref_match = re.search(rb"startxref\n(\d+)\n%%EOF", raw)
assert xref_match, "Missing PDF xref"
assert raw[int(xref_match.group(1)):].startswith(b"xref")
for content in (b"INDICADORES DEL PER", b"INFORMACI", b"DETALLE OPERATIVO", b"ORD-1"):
    assert content in raw, "Missing PDF section: " + content.decode()
assert b"Columnas 1-6 de" not in raw, "Legacy technical panels in PDF"
assert csv.read_bytes().startswith(b"\xef\xbb\xbf")
assert b"'=bad_formula()" in csv.read_bytes()
print("REP-2B valid: XML/OOXML order, 3 styled sheets, numeric styles, PDF layout and CSV safety")
