"""Import the official NEPA workbook; reconcile every energy value with TACO 4 PDF.

Read-only source extraction. Requires PyMuPDF for the independent PDF check.
Run from the repository root: python scripts/import-taco.py
"""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import io
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import pymupdf

XLSX_URL = 'https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/'
PDF_URL = 'https://www.nepa.unicamp.br/arquivo/uploads/taco-4-edicao-ampliada-e-revisada/taco_4_edicao_ampliada_e_revisada/'
CFN_URL = 'https://www.cfn.org.br/wp-content/uploads/2017/03/taco_4_edicao_ampliada_e_revisada.pdf'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def build():
    raw = urllib.request.urlopen(XLSX_URL).read()
    pdf_bytes = urllib.request.urlopen(PDF_URL).read()
    foods = []
    group = ''
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        strings = [''.join(t.itertext()) for t in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        for row in sheet.findall('m:sheetData/m:row', NS):
            cells = {}
            for cell in row.findall('m:c', NS):
                value = cell.find('m:v', NS)
                if value is not None:
                    cells[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            if cells.get('A', '').isdigit() and cells.get('B'):
                energy = cells.get('D', '')
                # Tr/NA/blank are unknown, never an invented zero.
                kcal = int(Decimal(energy).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if re.fullmatch(r'[\d.Ee+-]+', energy) else None
                foods.append({'id': int(cells['A']), 'name': cells['B'].strip(), 'category': group, 'kcal_per_100g': kcal})
            elif cells.get('A') and not cells.get('B') and len(cells['A']) > 8 and cells['A'].strip() not in ('Número do', 'Alimento'):
                group = cells['A'].strip()
    assert [f['id'] for f in foods] == list(range(1, 598)), 'Incomplete or reordered official dataset'
    assert len({f['category'] for f in foods}) == 15, 'Unexpected category labels or repeated table headers'

    published = {}
    with pymupdf.open(stream=pdf_bytes, filetype='pdf') as pdf:
        for page in pdf:
            words = [(pymupdf.Rect(*w[:4]) * page.rotation_matrix, w[4]) for w in page.get_text('words')]
            energy_headers = [rect for rect, word in words if word == '(kcal)']
            if not energy_headers:
                continue
            energy_x = sum((r.x0 + r.x1) / 2 for r in energy_headers) / len(energy_headers)
            for rect, word in words:
                if word.isdigit() and 70 < (rect.x0 + rect.x1) / 2 < 106 and 1 <= int(word) <= 597:
                    y = (rect.y0 + rect.y1) / 2
                    energy = [s for r, s in words if abs((r.x0 + r.x1) / 2 - energy_x) < 11 and abs((r.y0 + r.y1) / 2 - y) < 2]
                    if len(energy) == 1 and energy[0].isdigit():
                        published[int(word)] = int(energy[0])
    for food in foods:
        if food['kcal_per_100g'] is not None:
            assert published.get(food['id']) == food['kcal_per_100g'], f"PDF/XLSX energy mismatch: {food['id']} ({published.get(food['id'])}, {food['kcal_per_100g']})"
    output = Path('data')
    output.mkdir(exist_ok=True)
    payload = {'version': 'TACO-4-2011', 'source': 'NEPA/UNICAMP', 'basis_g': 100, 'reference_url': CFN_URL, 'foods': foods}
    (output / 'taco-4.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    provenance = {'source': 'NEPA/UNICAMP, TACO, 4ª edição revisada e ampliada, 2011', 'xlsx_url': XLSX_URL, 'pdf_url': PDF_URL, 'cfn_reference': CFN_URL, 'xlsx_sha256': hashlib.sha256(raw).hexdigest(), 'pdf_sha256': hashlib.sha256(pdf_bytes).hexdigest(), 'food_count': len(foods), 'basis': '100 g de parte comestível', 'energy': 'kcal publicadas, arredondadas a zero casas; todos os valores numéricos conferidos com o PDF', 'unknown_energy': [f['id'] for f in foods if f['kcal_per_100g'] is None]}
    (output / 'taco-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'foods': len(foods), 'energies_verified': len(published), 'unknown': provenance['unknown_energy']}))

if __name__ == '__main__':
    build()
