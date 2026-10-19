import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const dir='../outputs/planta-2026-10-16/';
const plan=JSON.parse(fs.readFileSync(dir+'plan.json','utf8'));
const source=JSON.parse(fs.readFileSync(dir+'source.json','utf8'));
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:/^(true|1)$/.test(process.env.DB_SSL||'')?{rejectUnauthorized:false}:undefined,connectionTimeoutMillis:15000});
const c=await pool.connect(); const result={created:[],contracts_created:[],skipped:[]};
const nd="regexp_replace(coalesce(document,''),'[^0-9]','','g')";
try {
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='10s'");
 await c.query('LOCK TABLE core.person IN SHARE ROW EXCLUSIVE MODE');
 for(const item of plan){
  if((await c.query(`select id from core.person where ${nd}=$1`,[item.document])).rowCount){result.skipped.push(item.document);continue;}
  if(!item.role_id || !item.full_name || !/^\d+$/.test(item.document))throw Error('Invalid person');
  const p={...item,is_active:true};
  if(item.kind==='DOCENTE'){
   const r=source[item.source_row-1];
   const vals=[r[3],r[4]?.slice(0,10)||null,r[5]?.slice(0,10)||null,r[15],r[10]];
   const existing=await c.query('select id from core.contract_type where name=$1 and start_date is not distinct from $2::date and end_date is not distinct from $3::date and work_schedule=$4 and modality=$5 order by id limit 1',vals);
   if(existing.rowCount)p.contract_type_id=existing.rows[0].id;
   else{
    const v=await c.query('insert into core.contract_type(code,name,start_date,end_date,work_schedule,modality,is_active) values($1,$2,$3,$4,$5,$6,true) returning id',['CT-'+crypto.randomUUID(),...vals]);
    p.contract_type_id=v.rows[0].id; result.contracts_created.push(p.contract_type_id);
   }
   const manager=await c.query(`select id from core.person where ${nd}=$1`,[item.manager_document]);
   if(manager.rowCount===1)p.manager_id=manager.rows[0].id;
  }
  const fields=['document','full_name','role_id','role_eval','school_id','program_id','city_id','hierarchy_id','contract_type_id','manager_id','is_active'].filter(k=>p[k]!==undefined);
  const inserted=await c.query(`insert into core.person(${fields.join(',')}) values(${fields.map((_,i)=>'$'+(i+1)).join(',')}) returning id,document,full_name,role_id`,fields.map(k=>p[k]));
  result.created.push({...inserted.rows[0],kind:item.kind});
 }
 const docs=[...new Set(source.slice(1).flatMap(r=>[r[0],r[16]]).filter(Boolean).map(String))];
 const found=(await c.query(`select id,document,full_name,is_active,role_id from core.person where ${nd}=any($1::text[])`,[docs])).rows;
 const present=new Set(found.map(x=>x.document.replace(/\D/g,'')));
 result.verification={source_unique_documents:docs.length,missing:docs.filter(x=>!present.has(x)),inactive:found.filter(x=>!x.is_active)};
 if(result.verification.missing.length)throw Error('Verification missing documents');
 fs.writeFileSync(dir+'transaction-result.json',JSON.stringify(result,null,2));
 await c.query('COMMIT');
 result.committed=true;
 const confirmed=await c.query('select count(*)::int as n from core.person where id=any($1::bigint[])',[result.created.map(x=>x.id)]);
 result.confirmed_created=confirmed.rows[0].n;
 fs.writeFileSync(dir+'result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({committed:result.committed,created:result.created.length,by_kind:result.created.reduce((a,x)=>(a[x.kind]=(a[x.kind]||0)+1,a),{}),confirmed:result.confirmed_created,contracts_created:result.contracts_created.length,verification:result.verification},null,2));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
