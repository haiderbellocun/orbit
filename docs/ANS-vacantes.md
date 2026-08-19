# ANS — Gestión de Vacantes Orbit

| Campo | Valor |
|-------|--------|
| **Versión** | 1.0 (borrador) |
| **Fecha** | Julio 2026 |
| **Alcance** | Módulo Vacantes de Orbit |
| **Estado** | Pendiente validación Operaciones / Capital Humano |
| **Zona horaria** | America/Bogota |
| **Días hábiles** | Lunes a viernes (excluye festivos Colombia cuando se acuerde el calendario) |

---

## 1. Propósito

Definir el **Acuerdo de Nivel de Servicio (ANS)** para el ciclo de vida de vacantes en Orbit: tiempos máximos por etapa, responsables, indicadores, calidad de cumplimientos y escalamiento.

Este documento se alinea al modelo operativo ya implementado en Orbit (estados, roles, requisición, métrica de *tiempo activo*). Los umbrales en días son **propuestos** hasta su firma formal.

---

## 2. Partes y alcance

### 2.1 Incluye

- Vacantes creadas manualmente en Orbit.
- Vacantes autogeneradas al inhabilitar personal (DOCENTE, LITE, COORDINADOR ACADÉMICO).
- Requisición asociada, cumplimientos (terna, PDA, condiciones contractuales, HV pre-entrevista).
- Cierre en estados terminales: `hired`, `closed`, `cancelled`, `cancelled_by_capital`.
- Estado intermedio `internal_movement`.
- Roles Orbit con acceso a vacantes (37, 38, 51, coordinadores de escuela, acceso total/operaciones).
- Catálogo de cargos CORE (incluye roles ESP.).

### 2.2 Excluye

- SLA del formulario Zoho de requisición de personal (sistema externo).
- Tiempos de nómina / formalización legal posteriores al estado `hired`.
- Usuarios sin capability `view:vacancies` (p. ej. perfil LITE).

---

## 3. Definiciones

| Término | Definición en Orbit |
|---------|---------------------|
| Vacante | Registro en `vacancies.vacancy` con área, cargo, cantidad y estado operativo |
| Requisición | Registro opcional 1:1 en `vacancies.requisition` |
| Tiempo activo | Días calendario desde `sentToCapitalAt` hasta hoy (o cierre) |
| Estado terminal | `hired`, `closed`, `cancelled`, `cancelled_by_capital` |
| Contratación parcial | `hiredQuantity` &lt; `quantity` |

### Estados operativos

| Código | Etiqueta | Tipo |
|--------|----------|------|
| `open` | Abierta | Inicial |
| `selected` | Seleccionado | Intermedio |
| `requisition_sent` | Requisición enviada | Intermedio (auto al crear REQ) |
| `internal_movement` | Movimiento interno | Intermedio |
| `hired` | Contratado | Terminal |
| `closed` | Cerrada | Terminal |
| `cancelled` | Cancelada | Terminal |
| `cancelled_by_capital` | Cancelada por capital | Terminal |

---

## 4. Flujo del servicio

```
Abierta (open)
  → Seleccionado (selected)
    → Requisición enviada (requisition_sent)
      → [Movimiento interno] (internal_movement)   [opcional]
        → Contratado (hired)
        → Cerrada (closed)
        → Cancelada (cancelled)
        → Cancelada por capital (cancelled_by_capital)
```

### 4.1 Plazos por etapa (propuestos)

| # | Etapa | Estado | Responsable | SLA | Evidencia en Orbit |
|---|-------|--------|-------------|-----|--------------------|
| 1 | Apertura | `open` | Escuela / Coordinación (roles 4–8, 11, 51) | ≤ 1 día hábil desde necesidad identificada | `createdAt` + notificación |
| 2 | Selección | `selected` | Área solicitante | ≤ 5 días hábiles desde apertura | Historial de estado |
| 3 | Requisición | `requisition_sent` | Operaciones vacantes (rol 37) | ≤ 2 días hábiles desde `selected` | `reqAssignedAt`, `sentToCapitalAt` |
| 4 | Gestión capital | `requisition_sent` / `internal_movement` | Capital humano | ≤ 15 días hábiles (estándar) | Tiempo activo |
| 5 | Cierre | terminal | Operaciones + Capital | ≤ 1 día hábil tras decisión | `closedAt`, `hiredQuantity` |

**Ciclo completo meta (apertura → `hired`):** ≤ **25 días hábiles** (ver plazos por tipo de cargo en §7).

---

## 5. Indicadores de servicio (KPI / SLA)

| Indicador | Fórmula | Meta | Umbral crítico |
|-----------|---------|------|----------------|
| Tiempo a envío a capital | `sentToCapitalAt − createdAt` | ≤ 8 días hábiles | > 12 días hábiles |
| Tiempo activo en capital | días desde `sentToCapitalAt` | ≤ 15 días hábiles | > 25 días hábiles |
| Ciclo completo a contratación | `closedAt − createdAt` (si `hired`) | ≤ 25 días hábiles | > 35 días hábiles |
| Tasa de contratación | Σ `hiredQuantity` / Σ `quantity` | ≥ 80% | < 60% |
| Cumplimiento terna / PDA | % con `true` en vacantes `hired` | ≥ 90% | < 70% |
| Cancelación por capital | % `cancelled_by_capital` / cerradas | ≤ 10% | > 20% |

### 5.1 Medición

- Fuente: listado/detalle de vacantes, panel informativo (roles 37/38), `vacancy_status_history`, change log.
- El sistema ya expone **tiempo activo** desde envío a capital; alertas automáticas por umbral quedan como mejora futura alineada a este ANS.

---

## 6. Roles y permisos (RACI operativo)

| Rol | IDs Orbit | Alcance | Responsabilidad ANS |
|-----|-----------|---------|---------------------|
| Coordinadores escuela | 4, 5, 6, 7, 8, 11 | Escuela | Crear/actualizar vacantes de su escuela; cumplir SLA de apertura y selección |
| Personal + Vacantes | 51 | Escuela | Operar vacantes de su escuela |
| Vacantes + panel informativo | 37 | Global | Operar ciclo; requisición; seguimiento de tiempos; panel informativo |
| Admin vacantes | 38 | Global | Excepciones: forzar estado, eliminar (confirmación `CONFIRMAR`); escalamiento L2 |
| Acceso total / Operaciones | 1, 9, 10, 13, 19, 42–46 | Global | Supervisión y acceso completo |
| Capital humano | (proceso externo a Orbit) | — | Gestión post-envío; cumplimientos; cancelación por capital |

### 6.1 Bloqueos técnicos (también reglas ANS)

- Tras crear requisición (`reqAssignedAt`): no modificar área, escuela, programa, cargo, cantidad ni línea curricular.
- Jefe inmediato (`directManagerIdentification`): inmutable tras el primer guardado.
- Estados terminales: sin edición de campos core; en `hired` solo se permite actualizar requisición.
- Admin (38) puede forzar estado con confirmación explícita; cada uso debe quedar justificado en notas/auditoría.

---

## 7. Plazos diferenciados por tipo de cargo

| Tipo de cargo | Ciclo meta (días hábiles) | Notas |
|---------------|---------------------------|-------|
| DOCENTE / LITE | ≤ 20 | Prioridad académica |
| COORDINADOR ACADÉMICO | ≤ 25 | Estándar |
| Cargos ESP. (catálogo CORE) | ≤ 30 | Perfiles especializados |
| Otros | ≤ 25 | Default del ANS |

---

## 8. Calidad — cumplimientos de requisición

Campos tri-estado en Orbit: Pendiente / Sí cumplió / No cumplió.

| Campo | Significado | Exigencia ANS |
|-------|-------------|----------------|
| Terna (`shortlistComplied`) | Terna de candidatos según política | Registrado antes de `hired` |
| PDA (`pdaComplied`) | Proceso / PDA cumplido | Registrado antes de `hired` |
| Condiciones contractuales | Condiciones validadas | Registrado antes de `hired` |
| HV pre-entrevista | Hojas de vida disponibles | Durante gestión en capital |

Si un cumplimiento queda en «No cumplió», la vacante puede cerrarse/cancelarse con nota en `capitalNotes` o notas de operación.

---

## 9. Datos mínimos y reglas de cierre

### 9.1 Creación

**Obligatorios:** área, cargo (`positionName`), cantidad &gt; 0.

**Recomendados (ANS):** escuela/programa cuando aplique; jefe inmediato en ≤ 2 días hábiles desde la apertura.

### 9.2 Contratación

- Estado `hired` exige `hiredQuantity` ≥ 1 y ≤ `quantity`.
- **Contratación parcial:** la vacante permanece abierta (o en estado no terminal) hasta completar `quantity`, o se cierra/cancela con justificación en notas.
- Vacantes auto por inhabilitación: mismo SLA de apertura; priorizar DOCENTE/LITE según §7.

### 9.3 Cancelación

- `cancelled`: decisión interna (escuela/operaciones); documentar motivo.
- `cancelled_by_capital`: decisión de capital; documentar en `capitalNotes`.

---

## 10. Escalamiento

| Nivel | Disparador | Acción | Tiempo de respuesta |
|-------|------------|--------|---------------------|
| L1 — Alerta | Tiempo activo &gt; 15 días hábiles o etapa vencida | Notificar rol 37 + área solicitante | 1 día hábil |
| L2 — Escalamiento | Tiempo activo &gt; 25 días o sin respuesta L1 | Escalar a rol 38 + responsable capital | 1 día hábil |
| L3 — Crítico | Ciclo &gt; 35 días o cancelaciones recurrentes | Revisión gerencial; plan correctivo | 3 días hábiles |

Notificaciones de creación actuales (`VACANCY_NOTIFY_EMAILS`) se mantienen; este ANS añade umbrales de seguimiento.

---

## 11. Excepciones

Quedan fuera del cómputo de SLA (con registro en notas):

1. Festivos / cierres institucionales acordados.
2. Vacantes en espera de decisión presupuestal documentada.
3. Movimiento interno (`internal_movement`) cuando el cupo se cubre sin proceso externo de capital (el reloj de «tiempo activo en capital» puede pausarse si no hubo `sentToCapitalAt`).
4. Intervenciones admin (rol 38) por corrección de datos; no cuentan como incumplimiento del área solicitante.

---

## 12. Gobernanza

| Tema | Acuerdo |
|------|---------|
| Revisión del ANS | Trimestral (roles 37/38 + Capital Humano) |
| Fuente de verdad | Orbit: panel informativo, historial de estados, change log |
| Cambios | Nueva versión del documento; comunicar a roles con `view:vacancies` |
| Firma | Pendiente — Operaciones Vacantes / Capital Humano / Producto Orbit |

---

## 13. Mapa a capacidades Orbit (referencia técnica)

| Capacidad / dato | Uso en ANS |
|------------------|------------|
| `createdAt` | Inicio de ciclo |
| `sentToCapitalAt` | Inicio tiempo activo / SLA capital |
| `closedAt` | Fin de ciclo |
| `hiredQuantity` / `quantity` | Tasa de contratación |
| Cumplimientos REQ | Calidad |
| Roles 37 / 38 / 51 | Responsables y escalamiento |
| Panel informativo | Auditoría y revisión trimestral |

---

## 14. Próximos pasos sugeridos (producto)

1. Validar y firmar plazos de §4, §5 y §7 con negocio.
2. Alertas automáticas cuando tiempo activo supere meta/crítico.
3. (Opcional) Campo de prioridad en vacante si se requiere diferenciación más fina.
4. Dashboard ANS: % dentro de SLA por etapa y por tipo de cargo.

---

*Documento vivo. Ajustar umbrales tras la primera revisión trimestral con datos reales de Orbit.*
