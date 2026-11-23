import type { PlantaPerson } from '@/src/types';

type ExportOptions = {
  people: readonly PlantaPerson[];
  status: 'active' | 'inactive';
  /** Texto corto sobre los filtros aplicados; se escribe en la hoja. */
  filterNote?: string | null;
};

const HEADER_FILL = 'FF6D28D9';

function todayStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function byName(a: PlantaPerson, b: PlantaPerson) {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

/**
 * Descarga Planta Activa en Excel con dos hojas: la planta (una fila por
 * persona, con su responsable y si es segundo al mando) y los segundos al
 * mando (una fila por unidad). exceljs se carga solo al exportar.
 */
export async function downloadPlantaExcel({
  people,
  status,
  filterNote,
}: ExportOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const styleHeader = (sheet: import('exceljs').Worksheet) => {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    header.alignment = { vertical: 'middle' };
    header.height = 22;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  };

  const sorted = [...people].sort(byName);

  const planta = wb.addWorksheet(status === 'active' ? 'Planta activa' : 'Planta inactiva');
  planta.columns = [
    { header: 'Nombre', key: 'name', width: 36 },
    { header: 'Tipo doc.', key: 'type_document', width: 10 },
    { header: 'Documento', key: 'document', width: 16 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 28 },
    { header: 'Programa', key: 'program', width: 32 },
    { header: 'Correo CUN', key: 'edu_email', width: 34 },
    { header: 'Responsable', key: 'manager', width: 36 },
    { header: 'Cargo del responsable', key: 'manager_role', width: 32 },
    { header: 'Segundo al mando de', key: 'second', width: 36 },
    { header: 'Estado', key: 'status', width: 10 },
  ];
  for (const p of sorted) {
    planta.addRow({
      name: p.name,
      type_document: p.type_document ?? '',
      document: p.document ?? '',
      role: p.role_name ?? '',
      area: p.area ?? '',
      school: p.school ?? '',
      program: p.program ?? '',
      edu_email: p.edu_email ?? '',
      manager: p.manager_name ?? '',
      manager_role: p.manager_role_name ?? '',
      second: (p.second_in_command_scopes ?? []).join(', '),
      status: p.status === 'active' ? 'Activo' : 'Inactivo',
    });
  }
  styleHeader(planta);

  const seconds = wb.addWorksheet('Segundos al mando');
  seconds.columns = [
    { header: 'Unidad', key: 'scope', width: 36 },
    { header: 'Segundo al mando', key: 'name', width: 36 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Correo CUN', key: 'edu_email', width: 34 },
    { header: 'Responsable', key: 'manager', width: 36 },
  ];
  const secondRows = sorted
    .flatMap((p) =>
      (p.second_in_command_scopes ?? []).map((scope) => ({ scope, p }))
    )
    .sort(
      (a, b) =>
        a.scope.localeCompare(b.scope, 'es', { sensitivity: 'base' }) ||
        byName(a.p, b.p)
    );
  for (const { scope, p } of secondRows) {
    seconds.addRow({
      scope,
      name: p.name,
      role: p.role_name ?? '',
      area: p.area ?? '',
      edu_email: p.edu_email ?? '',
      manager: p.manager_name ?? '',
    });
  }
  styleHeader(seconds);

  if (filterNote) {
    const info = wb.addWorksheet('Filtros');
    info.columns = [{ header: 'Filtros aplicados al exportar', key: 'v', width: 80 }];
    info.addRow({ v: filterNote });
    info.getRow(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planta-${status === 'active' ? 'activa' : 'inactiva'}-${todayStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
