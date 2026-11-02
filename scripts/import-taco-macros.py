"""Add published TACO macros, checked against the official workbook. No patient data.

Run after scripts/import-taco.py. Local official downloads may be reused with --cache.
"""
import hashlib, io, json, re, sys, urllib.request, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
provenance = json.loads((ROOT / 'data/taco-provenance.json').read_text(encoding='utf-8'))
def source(ext):
    path = ROOT / '.playwright-mcp' / ('taco-oficial.' + ext)
    raw = path.read_bytes() if '--cache' in sys.argv and path.exists() else urllib.request.urlopen(provenance[ext + '_url']).read()
    assert hashlib.sha256(raw).hexdigest() == provenance[ext + '_sha256'], 'Official source changed; inspect before importing'
    return raw

ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
workbook = {}
with zipfile.ZipFile(io.BytesIO(source('xlsx'))) as archive:
    strings = [''.join(t.itertext()) for t in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    for row in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('m:sheetData/m:row', ns):
        cells = {}
        for cell in row.findall('m:c', ns):
            v = cell.find('m:v', ns)
            if v is not None:
                cells[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(v.text)] if cell.attrib.get('t') == 's' else v.text
        if cells.get('A', '').isdigit() and cells.get('B'):
            workbook[int(cells['A'])] = cells

fields = {'protein_per_100g': ('F', 61.7), 'fat_per_100g': ('G', 100.6), 'carbs_total_per_100g': ('I', 181.3), 'fiber_per_100g': ('J', 218.9)}
published = {}
def numeric(raw):
    if raw == 'Tr':
        return 0.0
    return float(raw.replace(',', '.')) if re.fullmatch(r'\d+(?:[.,]\d+)?', raw) else None

with pymupdf.open(stream=source('pdf'), filetype='pdf') as pdf:
    for page in pdf:
        words = [(pymupdf.Rect(*w[:4]) * page.rotation_matrix, w[4]) for w in page.get_text('words')]
        headers = [r for r, word in words if word == '(kcal)']
        if not headers:
            continue
        energy_x = sum((r.x0 + r.x1)/2 for r in headers)/len(headers)
        for rect, word in words:
            if word.isdigit() and 70 < (rect.x0 + rect.x1)/2 < 106 and 1 <= int(word) <= 597:
                y = (rect.y0 + rect.y1)/2
                values = {}
                for field, (column, offset) in fields.items():
                    found = [s for r,s in words if abs((r.x0+r.x1)/2-energy_x-offset)<11 and abs((r.y0+r.y1)/2-y)<2]
                    assert len(found)<=1, (word, field, found)
                    raw = found[0] if found else ''
                    value = numeric(raw)
                    excel = workbook[int(word)].get(column, '').strip()
                    if value is not None and raw != 'Tr':
                        assert re.fullmatch(r'[\d.Ee+-]+', excel) and abs(value-float(excel))<0.101, (word, field, raw, excel)
                    elif raw == 'Tr':
                        assert excel == 'Tr' or re.fullmatch(r'[\d.Ee+-]+', excel) and float(excel)<0.1, (word, field, excel)
                    else:
                        assert not re.fullmatch(r'[\d.Ee+-]+', excel), (word, field, raw, excel)
                    values[field] = value
                published[int(word)] = values

assert len(published)==597, len(published)
path=ROOT/'data/taco-4.json'
data=json.loads(path.read_text(encoding='utf-8'))
for food in data['foods']:
    food.update(published[food['id']])
    total,fiber=food['carbs_total_per_100g'],food['fiber_per_100g']
    food['carbs_per_100g']=0 if total==0 else round(max(0,total-fiber),1) if total is not None and fiber is not None else None
path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
provenance['macros']={'basis':'100 g edible portion; published PDF values independently checked against official XLSX', 'carbohydrates':'Available carbohydrate = max(total carbohydrate minus dietary fiber, 0); total and fiber retained', 'trace':'Tr treated as approximately 0 g, never confused with NA/ND/missing', 'unknown':'NA/ND/missing remain null; missing fiber does not imply zero', 'complete_profiles':sum(all(f[k] is not None for k in ['protein_per_100g','fat_per_100g','carbs_per_100g']) for f in data['foods'])}
(ROOT/'data/taco-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(provenance['macros']))
