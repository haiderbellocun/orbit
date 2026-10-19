import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'result.json').read_text(encoding='utf-8'))
v=json.loads((p/'validation.json').read_text(encoding='utf-8'))
lines=['# Validación y carga de planta — 16 de octubre de 2026','',f"Altas confirmadas: {r['confirmed_created']}. Documentos pendientes de crear: {len(r['verification']['missing'])}.",'','Se conservaron los estados y datos de las personas existentes. Las altas no incluyen correo porque el archivo no lo suministra.','', '## Altas','', '| Documento | Nombre | Tipo | ID DB |','| --- | --- | --- | --- |']
for x in r['created']: lines.append(f"| {x['document']} | {x['full_name']} | {x['kind']} | {x['id']} |")
lines+=['','## Personas existentes inactivas','', '| Documento | Nombre | Rol DB |','| --- | --- | --- |']
for x in r['verification']['inactive']: lines.append(f"| {x['document']} | {x['full_name']} | {x['role_id']} |")
lines+=['','## Programas pendientes','']
for x in v['issues']:
 if x['issue']=='programa sin coincidencia unica': lines.append(f"- {x['document']}: {x['program']}. Persona creada sin programa.")
(p/'informe.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Informe generado')
