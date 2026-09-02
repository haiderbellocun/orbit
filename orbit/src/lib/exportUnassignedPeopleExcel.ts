import type { PlantaPerson } from '@/src/types';

const BOGOTA_TZ = 'America/Bogota';

const COLUMNS = [
  { key: 'name', label: 'Nombre', width: 160 },
  { key: 'document', label: 'Identificación', width: 100 },
  { key: 'email', label: 'Correo', width: 140 },
  { key: 'edu_email', label: 'Correo institucional', width: 140 },
  { key: 'phone', label: 'Teléfono', width: 90 },
  { key: 'area', label: 'Área', width: 120 },
  { key: 'school', label: 'Escuela', width: 120 },
  { key: 'program', label: 'Programa', width: 140 },
  { key: 'role_name', label: 'Cargo', width: 140 },
  { key: 'status', label: 'Estado', width: 70 },
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellValue(person: PlantaPerson, key: (typeof COLUMNS)[number]['key']): string {
  if (key === 'status') {
    return person.status === 'inactive' ? 'Inactivo' : 'Activo';
  }
  if (key === 'edu_email') {
    const edu = person.edu_email?.trim() ?? '';
    return edu || 'Sin correo CUN';
  }
  const raw = person[key];
  return raw == null ? '' : String(raw).trim();
}

function todayKeyBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
}

export function unassignedPeopleExportFilename(
  label = 'Sin_responsable_asignado'
): string {
  const safe = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return `${safe || 'Sin_responsable_asignado'}_${todayKeyBogota()}.xls`;
}

/** Excel XML Spreadsheet (abre nativo en Excel) con la gente sin responsable. */
export function downloadUnassignedPeopleExcel(
  people: readonly PlantaPerson[],
  opts?: { title?: string; filename?: string }
): void {
  const title = opts?.title?.trim() || 'Sin responsable asignado';
  const filename =
    opts?.filename?.trim() || unassignedPeopleExportFilename(title);
  const generatedAt = new Date().toLocaleString('es-CO', {
    timeZone: BOGOTA_TZ,
  });

  const headerCells = COLUMNS.map(
    (col) =>
      `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(col.label)}</Data></Cell>`
  ).join('');

  const dataRows = people
    .map((person) => {
      const cells = COLUMNS.map((col) => {
        const value = cellValue(person, col.key);
        return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  const columnDefs = COLUMNS.map(
    (col) => `<Column ss:AutoFitWidth="0" ss:Width="${col.width}"/>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Title">
   <Font ss:Bold="1" ss:Size="14" ss:Color="#4C1D95"/>
  </Style>
  <Style ss:ID="Meta">
   <Font ss:Size="10" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#6D28D9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Sin responsable">
  <Table>
   ${columnDefs}
   <Row>
    <Cell ss:StyleID="Title" ss:MergeAcross="${COLUMNS.length - 1}">
     <Data ss:Type="String">${escapeXml(title)}</Data>
    </Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="Meta" ss:MergeAcross="${COLUMNS.length - 1}">
     <Data ss:Type="String">${escapeXml(
       `${people.length.toLocaleString('es-CO')} persona${
         people.length === 1 ? '' : 's'
       } · Generado ${generatedAt}`
     )}</Data>
    </Cell>
   </Row>
   <Row/>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([`\uFEFF${xml}`], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
