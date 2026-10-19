import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const dir='../outputs/planta-2026-10-16/';
const rows=JSON.parse(fs.readFileSync(dir+'source.json','utf8')).slice(1);
const doc=v=>String(v??'').trim().replace(/\D/g,'');
const expected=new Map();
for(const [i,r] of rows.entries()){
 const teacher=doc(r[0]),lite=doc(r[16]);
 if(!teacher||!lite)throw Error('Documento docente/LITE vacío en fila '+(i+2));
 if(teacher===lite)throw Error('Autoasignación en fila '+(i+2));
 if(expected.has(teacher)&&expected.get(teacher)!==lite)throw Error('LITEs contradictorios para '+teacher);
 expected.set(teacher,lite);
}
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:/^(true|1)$/.test(process.env.DB_SSL||'')?{rejectUnauthorized:false}:undefined,connectionTimeoutMillis:15000});
const c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='10s'");
 if(process.argv.includes('--apply'))await c.query('LOCK TABLE core.person IN SHARE ROW EXCLUSIVE MODE');
 const people=(await c.query('select p.id,p.document,p.full_name,p.manager_id,p.role_id,p.is_active,r.name as role_name from core.person p left join core.role r on r.id=p.role_id')).rows;
 const byDoc=new Map(),byId=new Map(people.map(x=>[x.id,x]));
 for(const p of people){const k=doc(p.document);if(!byDoc.has(k))byDoc.set(k,[]);byDoc.get(k).push(p);}
 const get=k=>{const ps=byDoc.get(k)||[];if(ps.length!==1)throw Error('Documento ausente o duplicado: '+k);return ps[0];};
 const changes=[],anomalies=[];
 for(const [teacher,lite] of expected){
  const p=get(teacher),m=get(lite);
  if(!m.is_active||!/^LITE$|^LIDER$/i.test(m.role_name||''))anomalies.push({document:lite,name:m.full_name,role:m.role_name,is_active:m.is_active});
  if(p.manager_id!==m.id)changes.push({person_id:p.id,document:teacher,name:p.full_name,old_manager_id:p.manager_id,old_manager_document:byId.get(p.manager_id)?.document??null,manager_id:m.id,lite_document:lite,lite_name:m.full_name});
 }
 const result={teachers:expected.size,lites:new Set(expected.values()).size,already_aligned:expected.size-changes.length,to_change:changes.length,changes,lite_anomalies:[...new Map(anomalies.map(x=>[x.document,x])).values()]};
 if(process.argv.includes('--apply')){
  const updated=await c.query(`update core.person p set manager_id=x.manager_id,updated_at=now() from jsonb_to_recordset($1::jsonb) as x(person_id bigint,manager_id bigint) where p.id=x.person_id and p.manager_id is distinct from x.manager_id returning p.id`,[JSON.stringify(changes)]);
  if(updated.rowCount!==changes.length)throw Error('Recuento de cambios inesperado');
  const verify=await c.query(`select count(*)::int n from core.person p join jsonb_to_recordset($1::jsonb) as x(document text,lite_document text) on regexp_replace(p.document,'[^0-9]','','g')=x.document join core.person m on m.id=p.manager_id where regexp_replace(m.document,'[^0-9]','','g')=x.lite_document`,[JSON.stringify([...expected].map(([document,lite_document])=>({document,lite_document})))]);
  if(verify.rows[0].n!==expected.size)throw Error('Verificación incompleta');
  result.verified_aligned=verify.rows[0].n;
  await c.query('COMMIT');result.committed=true;
 }else await c.query('ROLLBACK');
 fs.writeFileSync(dir+(result.committed?'lite-alignment-result.json':'lite-alignment-audit.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,changes:undefined},null,2));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
