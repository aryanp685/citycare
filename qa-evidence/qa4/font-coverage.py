import ctypes,hashlib,json,struct
from pathlib import Path
f=ctypes.CDLL('libfreetype.so.6');lib=ctypes.c_void_p();assert f.FT_Init_FreeType(ctypes.byref(lib))==0
f.FT_New_Face.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_long,ctypes.POINTER(ctypes.c_void_p)];f.FT_Get_Char_Index.argtypes=[ctypes.c_void_p,ctypes.c_ulong];f.FT_Get_Char_Index.restype=ctypes.c_uint
files=[Path('/home/user/citycare/web/src/app/fonts/InterVariable.woff2'),Path('/tmp/fonts/NotoSansDevanagari.ttf'),*sorted(Path('/usr/share/fonts/truetype/dejavu').glob('*.ttf'))];out={}
ranges={'devanagari':(0x900,0x97f),'devanagari_extended':(0xa8e0,0xa8ff),'vedic_extensions':(0x1cd0,0x1cff)}
for path in files:
 b=path.read_bytes();face=ctypes.c_void_p();assert f.FT_New_Face(lib,str(path).encode(),0,ctypes.byref(face))==0
 stats={}
 for name,(a,z) in ranges.items():
  present=[u for u in range(a,z+1) if f.FT_Get_Char_Index(face,u)];stats[name]={'present':len(present),'range_size':z-a+1,'missing':[f'U+{u:04X}' for u in range(a,z+1) if u not in present]}
 out[str(path)]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'ranges':stats,'symbols':{f'U+{u:04X}':bool(f.FT_Get_Char_Index(face,u)) for u in [0x200c,0x200d,0x25cc,0x20b9,0x964,0x950]}}
 f.FT_Done_Face(face)
catalog=Path('/home/user/citycare/web/src/lib/i18n.ts').read_text();codepoints=sorted(set(ord(c) for c in catalog if 0x900<=ord(c)<=0x97f));out['i18n_catalog_all_devanagari']={'distinct':len(codepoints),'codepoints':[f'U+{u:04X}' for u in codepoints]}
Path('/home/user/citycare/qa-evidence/qa4/font-coverage.json').write_text(json.dumps(out,indent=2));print(json.dumps({p:{'bytes':v['bytes'],'devanagari':v['ranges']['devanagari']['present']} for p,v in out.items() if p!='i18n_catalog_all_devanagari'},indent=2))
