import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:/^(true|1)$/.test(process.env.DB_SSL||'')?{rejectUnauthorized:false}:undefined,connectionTimeoutMillis:15000});
try{
 const rows=JSON.parse(fs.readFileSync('../outputs/planta-2026-10-16/source.json','utf8')).slice(1);
 const docs=[...new Set(rows.flatMap(r=>[r[0],r[16]]).filter(Boolean).map(String))];
 const people=(await pool.query("select document,full_name,edu_email,email from core.person where regexp_replace(document,'[^0-9]','','g')=any($1::text[])",[docs])).rows;
 fs.writeFileSync('../outputs/planta-2026-10-16/emails-db.json',JSON.stringify(people,null,2));
 console.log(JSON.stringify({people:people.length,with_institutional:people.filter(p=>p.edu_email?.trim()).length,with_other:people.filter(p=>p.email?.trim()).length}));
}finally{await pool.end();}
