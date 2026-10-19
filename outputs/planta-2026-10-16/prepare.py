import json,re,unicodedata,collections
from pathlib import Path
p=Path(__file__).parent
d=json.loads((p/'db-before.json').read_text(encoding='utf-8'))
rows=json.loads((p/'source.json').read_text(encoding='utf-8'))[1:]
def norm(x): return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',str(x or '')).encode('ascii','ignore').decode().upper()).strip()
def doc(x): return re.sub(r'\D','',str(x or ''))
people=collections.defaultdict(list)
for x in d['people']: people[doc(x['document'])].append(x)
def cat(t,name):
 if t=='program' and name=='DISEÑO EXPERIENCIAS INTERACTIVAS': name='DISEÑO DE EXPERIENCIAS INTERACTIVAS'
 a=[x['id'] for x in d[t] if norm(x.get('name'))==norm(name)]
 return a[0] if len(a)==1 else None
plan=[]; issues=[]; lites={}; teachers={}
for i,r in enumerate(rows,2):
 teachers[doc(r[0])]=(r,i)
 if doc(r[16]): lites.setdefault(doc(r[16]),[]).append((r,i))
for k,rs in lites.items():
 if k not in people:
  r,i=rs[0]
  plan.append(dict(document=k,full_name=r[17],role_id=cat('role','LITE'),school_id=cat('school',r[18]),hierarchy_id='4',source_row=i,kind='LITE'))
for k,(r,i) in teachers.items():
 if k in people:
  if len(people[k])>1: issues.append(dict(document=k,issue='documento duplicado DB'))
  if any(not x['is_active'] for x in people[k]): issues.append(dict(document=k,name=r[1]+' '+r[2],issue='existente inactivo'))
  continue
 name=r[1]+' '+r[2]
 same=[x for x in d['people'] if norm(x['full_name'])==norm(name)]
 if same:
  issues.append(dict(document=k,name=name,issue='mismo nombre con otro documento',matches=[dict(document=x['document'],id=x['id']) for x in same]));continue
 program=cat('program',r[12])
 if not program: issues.append(dict(document=k,issue='programa sin coincidencia unica',program=r[12]))
 contracts=[x for x in d['contract_type'] if norm(x['name'])==norm(r[3]) and str(x.get('start_date') or '')[:10]==str(r[4] or '')[:10] and str(x.get('end_date') or '')[:10]==str(r[5] or '')[:10] and norm(x.get('work_schedule'))==norm(r[15]) and norm(x.get('modality'))==norm(r[10])]
 plan.append(dict(document=k,full_name=name,role_id=cat('role','DOCENTES PENSIONADOS' if r[9]=='DOCENTES PENSIONADOS' else 'DOCENTE'),role_eval='DOCENTE',school_id=cat('school',r[18]),program_id=program,city_id=cat('city',r[8]),hierarchy_id='5',contract_type_id=contracts[0]['id'] if contracts else None,manager_document=doc(r[16]),source_row=i,kind='DOCENTE'))
summary=dict(source_teachers=len(teachers),source_lites=len(lites),missing_by_kind=dict(collections.Counter(x['kind'] for x in plan)),existing_inactive=sum(x['issue']=='existente inactivo' for x in issues),issues=issues)
(p/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
(p/'validation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=True,indent=2));print('contracts unmatched',sum(x.get('contract_type_id') is None for x in plan if x['kind']=='DOCENTE'))
