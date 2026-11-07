import json, pypdfium2 as pdf, re
from pypdf import PdfReader
from pathlib import Path
root=Path('/home/user/citycare/qa-evidence/qa4'); out={}
for mode in ['ambient','no-deva','noto']:
 for lang in ['en','hi','mr']:
  for size in ['A4','Letter']:
   name=f'print-{mode}-{lang}-{size}'; d=pdf.PdfDocument(str(root/(name+'.pdf')));texts=[p.get_textpage().get_text_range() for p in d];pypdftexts=[p.extract_text() for p in PdfReader(str(root/(name+'.pdf'))).pages];pages=[]
   for i,p in enumerate(d):
    image=f'{name}-page-{i+1}.png';p.render(scale=1.2).to_pil().convert('RGB').save(root/image,optimize=True);pages.append({'image':image,'chars':len(texts[i].strip()),'pypdf_nul':pypdftexts[i].count('\x00')})
   combined=''.join(texts);out[name]={'pages':pages,'markers':{m:combined.count(m) for m in ['MED-QA-001','MED-QA-060','ALL-QA-014','OBS-QA-012','LAB-QA-005','ENCOUNTER-QA-ADVICE']},'extraction_preview_pdfium':texts[0][:500],'extraction_preview_pypdf':pypdftexts[0][:500]};print(name,'pages',len(d),'text chars',[p['chars'] for p in pages], 'pypdf nul',[p['pypdf_nul'] for p in pages])
json.dump(out,open(root/'pdf-analysis.json','w'),ensure_ascii=False,indent=2)
