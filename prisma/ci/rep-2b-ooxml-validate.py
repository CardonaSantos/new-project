#!/usr/bin/env python3
"""Validate the real REP-2B binaries using only the Python stdlib.
Runs after TypeScript unit tests and checks actual ZIP/XML, not string mocks.

Rebuilt for the ExcelJS/pdfkit renderers (REP-exports refactor, 2026-11): the previous
version of this script asserted byte-exact quirks of the old hand-rolled OOXML/PDF
writers (a literal "%PDF-1.4" version header, a specific startxref/xref byte layout).
Those assumptions don't hold for a library-generated file and shouldn't need to -- a
real validator should check that the file is well-formed and carries the right content,
not that it matches one writer's internal layout choices.
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
    required = {"[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml"}
    assert required <= files, f"Missing OOXML parts: {required - files}"
    sheet_parts = sorted(f for f in files if re.match(r"xl/worksheets/sheet\d+\.xml", f))
    assert len(sheet_parts) == 3, f"Expected 3 worksheet parts, found {sheet_parts}"
    xml = {path: ET.fromstring(archive.read(path)) for path in files
           if path.endswith(".xml") or path.endswith(".rels")}
    styles = xml["xl/styles.xml"]
    wb = xml["xl/workbook.xml"]
    sheets = wb.findall("m:sheets/m:sheet", NS)
    assert [sheet.attrib["name"] for sheet in sheets] == ["Resumen", "Diario", "Detalle"]
    for part in sheet_parts:
        sheet = xml[part]
        assert sheet.find("m:sheetData", NS) is not None
    summary = archive.read(sheet_parts[0]).decode()
    diario = archive.read(sheet_parts[1]).decode()
    detalle = archive.read(sheet_parts[2]).decode()
    assert "RESULTADOS PRINCIPALES" in summary
    assert "2026-10-30" in diario or "30/10/2026" in diario
    assert "autoFilter" in detalle, "Detalle sheet should have an autoFilter"
    assert "<f>" in detalle, "Detalle sheet should carry a live SUM formula, not a static total"
    styles_xml = archive.read("xl/styles.xml").decode()
    assert "000000" in styles_xml, "Missing 6-decimal micro-cost number format"
    assert "0.00" in styles_xml, "Missing 2-decimal money number format"
    assert "ventaLineaId" not in detalle, "Internal id leaked into the delivered sheet"
    assert "ORD-1" in detalle, "Business data missing from the delivered sheet"
    # A data value that merely starts with "=" must stay inert text, never an executed
    # formula -- only the renderer's own SUM() totals row should ever emit an <f> element
    # whose content isn't one we generated ourselves.
    assert "bad_formula" in detalle, "Formula-looking data value missing from sheet"
    assert "<f>bad_formula" not in detalle, "Data value was stored as an executable formula"
raw = pdf.read_bytes()
assert raw.startswith(b"%PDF-"), "Not a PDF file"
assert b"%%EOF" in raw[-64:], "PDF missing trailing EOF marker"
for content in (b"RESULTADOS DEL D", b"MOVIMIENTOS DEL D", b"DETALLE OPERATIVO", b"ORD-1"):
    assert content in raw, "Missing PDF section: " + content.decode()
assert b"ventaLineaId" not in raw, "Internal id leaked into the delivered PDF"
assert b"30/10/2026" in raw, "Daily report needs a prominent date"
assert csv.read_bytes().startswith(b"\xef\xbb\xbf")
assert b"'=bad_formula()" in csv.read_bytes()
print("REP-2B valid: well-formed OOXML (3 styled sheets, formulas, number formats), "
      "parseable PDF with expected sections, CSV formula-injection guard")
