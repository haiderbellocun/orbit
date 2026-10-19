import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:/^(true|1)$/.test(process.env.DB_SSL||'')?{rejectUnauthorized:false}:undefined,connectionTimeoutMillis:15000});
try {
 const out={};
 for(const t of ['role','hierarchy','contract_type','school','program','area','city']) out[t]=(await pool.query(`select * from core.${t}`)).rows;
 out.columns=(await pool.query("select column_name,data_type,is_nullable,column_default,character_maximum_length from information_schema.columns where table_schema='core' and table_name='person' order by ordinal_position")).rows;
 out.people=(await pool.query('select * from core.person')).rows;
 fs.writeFileSync('../outputs/planta-2026-10-16/db-before.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify({catalogs:Object.fromEntries(Object.entries(out).filter(([k])=>!['people','columns'].includes(k))),columns:out.columns,people:out.people.length},null,2));
} finally {await pool.end();}
