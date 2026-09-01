function asciiLower(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Área investigativa (Harvey / Jarvey en catálogo). */
export function isHarveyAreaName(name: string | null | undefined): boolean {
  const n = asciiLower(name);
  return (
    n.includes("investigativ") || n.includes("harvey") || n.includes("jarvey")
  );
}

/** Programa de Vicerrectoría Acad. y de Investigación (área Harvey). */
export function isHarveyProgramName(name: string | null | undefined): boolean {
  const n = asciiLower(name);
  return n.includes("vicerrector") && n.includes("investig");
}
