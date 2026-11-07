import json,re,hashlib,unicodedata,os
import pypdfium2 as pdf
from PIL import Image
root='/home/user/citycare/qa-evidence/qa1'; dom=json.load(open(root+'/browser-matrix.json'));results={}
def norm(s):return ''.join(c for c in unicodedata.normalize('NFC',s) if not c.isspace() and unicodedata.category(c)!='Cf')
for kind in ['short','long']:
 for lang in ['en','hi','mr']:
  for fmt in ['A4','Letter']:
   name=f'patient-{kind}-{lang}-{fmt}'; d=pdf.PdfDocument(f'{root}/{name}.pdf'); texts=[p.get_textpage().get_text_range() for p in d]; text='\n'.join(texts); summary=dom[kind][lang]; lines=[s for section in summary['sections'] for s in [section['heading'],*section['lines'],section['note']] if s]+summary['footer']; missing=[x for x in lines if norm(x) not in norm(text)]; markers=[]
   if kind=='long':
    markers=[f'{prefix}-QA-{i:03d}' for prefix,count in [('ALL',14),('COND',14),('MED',60),('OBS',12),('LAB',5)] for i in range(1,count+1)]+['ENCOUNTER-QA-DIAGNOSIS','ENCOUNTER-QA-ADVICE'];
   counts={m:text.count(m) for m in markers}; invalid={m:c for m,c in counts.items() if c!=1}; drafts='DRAFT-QA-' in text
   pages=[]
   for i,p in enumerate(d):
    im=p.render(scale=1.2).to_pil().convert('RGB'); im.save(f'{root}/{name}-page-{i+1}.png',optimize=True);pages.append({'chars':len(texts[i].strip()),'image':f'{name}-page-{i+1}.png','size_pt':list(p.get_size())})
   results[name]={'pages':pages,'missing_dom_lines':missing,'missing_or_duplicated_markers':invalid,'draft_name_printed':drafts,'marker_count':len(markers),'footer_lines':summary['footer']}
   print(name,'pages',len(d),'chars', [x['chars'] for x in pages], 'missing full lines',len(missing),'bad markers',invalid,'draft printed',drafts)
for fmt in ['A4','Letter']:
 a=pdf.PdfDocument(f'{root}/doctor-current-{fmt}.pdf');b=pdf.PdfDocument(f'{root}/doctor-no-patient-rules-{fmt}.pdf'); hashes=[]
 for i,p in enumerate(a):
  x=p.render(scale=1.2).to_pil().convert('RGB');y=b[i].render(scale=1.2).to_pil().convert('RGB'); x.save(f'{root}/doctor-current-{fmt}-page-{i+1}.png',optimize=True);hashes.append(hashlib.sha256(x.tobytes()).hexdigest()==hashlib.sha256(y.tobytes()).hexdigest())
 results[f'doctor-{fmt}']={'page_chars':[len(p.get_textpage().get_text_range().strip()) for p in a],'identical_raster_per_page':hashes,'same_page_count':len(a)==len(b)};print('doctor',fmt,results[f'doctor-{fmt}'])
json.dump(results,open(root+'/pdf-analysis.json','w'),ensure_ascii=False,indent=2)
