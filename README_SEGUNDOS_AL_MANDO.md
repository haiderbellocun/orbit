# Segundos al mando

## Estado de avance

| Avance | Estado | Alcance |
|---:|---|---|
| **75%** | Implementado | Se incorporaron las últimas actualizaciones solicitadas para identificar, asignar, importar y visualizar a los segundos al mando. |
| **25%** | Pendiente de validación | Correcciones y ajustes que se definan durante la próxima reunión de revisión. |

**Fecha de corte:** 22 de septiembre de 2026.

**Fecha estimada de finalización:** se confirmará después de la reunión, cuando queden definidos y dimensionados los ajustes del 25% restante.

> El porcentaje representa el estado funcional actual. La funcionalidad está disponible para revisión, pero su cierre depende de la validación y retroalimentación de la reunión.

Planta Activa guarda `person.second_in_command_scopes` como una lista de nombres de áreas o escuelas. No hay unicidad por área: varias personas pueden representar la misma unidad y una persona puede representar varias. Las unidades del Excel incluyen dependencias operativas que no necesariamente coinciden con el catálogo `area`, por eso se conserva su nombre explícito. La API normaliza espacios, mayúsculas y tildes para evitar duplicados.

Desde **Gestionar → Segundo al mando**, selecciona o escribe el área, pulsa **Añadir** y **Guardar**. Para reasignar, quita el área de la persona anterior y añádela a la nueva. Los permisos de edición de la persona siguen aplicándose. Esta identificación no concede permisos ni modifica la jerarquía. Las personas inactivas conservan sus asignaciones, pero no muestran etiquetas hasta reactivarse.

La columna se crea de forma idempotente al iniciar la API. También puede migrarse explícitamente:

```powershell
npm run migrate:second-in-command
npm run import:second-in-command -- "../Segundos al mando - Actualización 07 de Sep.xlsx"
npm run import:second-in-command -- "../Segundos al mando - Actualización 07 de Sep.xlsx" --apply
```

La importación lee exclusivamente la hoja `Segundos al mando`, cruza por el documento de la persona asignada y agrega las asignaciones en una transacción. Si algún documento falta o es ambiguo, no modifica ninguna persona. La ejecución sin `--apply` valida las coincidencias sin guardar. No se ejecuta al iniciar la aplicación: volver a importar puede restaurar asignaciones eliminadas manualmente.

Validación: `npm run test:second-in-command`, `npm test`, `npm run build`; en el frontend, `npm run lint` y `npm run build`.
