/**
 * Mensajes de importación legibles en español (incl. errores típicos de PostgreSQL).
 */

export function translateImportErrorDetail(raw: string): string {
  const m = raw.trim();
  if (!m) return "Error desconocido.";

  if (
    /null value in column "enrolled_quantity" of relation "academic_load"/i.test(
      m
    )
  ) {
    return (
      "Falta la cantidad de matriculados: la columna «Total estudiantes» en la hoja «Carga Actual» está vacía " +
      "o no hay fila en «Carga Actual» para ese docente cuando se crea la carga desde «ACA Proyección». " +
      "Complete el número de estudiantes (puede ser 0) o agregue la fila correspondiente."
    );
  }

  const nullNotNull = m.match(
    /null value in column "([^"]+)" of relation "([^"]+)" violates not-null constraint/i
  );
  if (nullNotNull) {
    return `Falta un valor obligatorio en la columna «${nullNotNull[1]}» (tabla «${nullNotNull[2]}»). Revise el Excel y los datos enlazados.`;
  }

  const varcharTooLong = m.match(
    /value too long for type character varying\((\d+)\)/i
  );
  if (varcharTooLong) {
    const n = varcharTooLong[1];
    return (
      `Algún texto supera el máximo de ${n} caracteres que permite la base de datos. ` +
      "Suele pasar con «Descripción Clase Nómina» o «Modalidad» del Excel (se guardan con hasta 50 caracteres en el tipo de contrato), " +
      "o con códigos largos de periodo, materia o grupo (50 caracteres). Acorte el valor en la plantilla; si debe conservarse íntegro, amplíe la columna en la base de datos."
    );
  }

  let out = m;
  out = out.replace(/^Error processing row:\s*/i, "");
  out = out.replace(
    /violates not-null constraint/gi,
    "no cumple el requisito de campo obligatorio"
  );
  out = out.replace(
    /duplicate key value violates unique constraint/gi,
    "valor duplicado que infringe una restricción única"
  );
  out = out.replace(/violates foreign key constraint/gi, "infringe una clave foránea");
  out = out.replace(/^File validation failed\.?$/i, "La validación del archivo falló.");
  out = out.replace(/^File not found:\s*/i, "No se encontró el archivo: ");
  out = out.replace(
    /^Invalid file type\. Expected \.xlsx or \.xls, got \./i,
    "Tipo de archivo no válido. Se esperaba .xlsx o .xls; recibido ."
  );
  out = out.replace(
    /^File validation error:\s*/i,
    "Error al validar el archivo: "
  );
  out = out.replace(/^Missing columns:\s*/i, "Faltan columnas: ");
  out = out.replace(
    /^Could not determine header row\.?$/i,
    "No se pudo detectar la fila de encabezados."
  );
  out = out.replace(/^Internal server error\.?$/i, "Error interno del servidor.");

  return out;
}

export const IMPORT_GENERIC_SERVER_ERROR =
  "Error interno del servidor. Si persiste, revise los registros del sistema.";
