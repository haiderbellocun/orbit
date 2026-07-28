# Carga Académica en Orbit

Documento explicativo de cómo funciona el módulo de **Carga Académica**: qué es, de dónde sale la información, qué se ve en la plataforma, cómo se actualiza y cómo se relaciona con otros procesos.

---

## 1. ¿Qué es la carga académica?

La **carga académica** es el registro de **qué docentes están asignados a qué materias y grupos, en qué periodo académico**.

Cada fila representa una asignación concreta, por ejemplo:

> El docente *Ana Pérez* dicta la materia *Cálculo I*, grupo *01*, del programa *Ingeniería de Sistemas*, en el periodo *26C11*, en modalidad presencial.

En Orbit, el módulo se presenta como:

- **Nombre:** Carga Académica  
- **Descripción en pantalla:** *Asignación docente por periodo*

Su propósito principal es **consultar y filtrar** esa información de forma centralizada, y además **alimentar el cálculo de horas de cátedra** en el módulo de Horas Sustantivas.

---

## 2. Idea clave: Orbit consulta; no crea la carga

Hoy la carga académica en Orbit es una **vista de consulta** (solo lectura).

| En Orbit sí se puede | En Orbit no se puede |
|---|---|
| Ver las asignaciones importadas | Crear una asignación nueva |
| Buscar por docente, materia o programa | Editar una materia o un grupo |
| Filtrar por periodo y modalidad | Aprobar / rechazar cargas |
| Consultar el detalle por docente (vía API) | Borrar filas desde la interfaz |

La **fuente de verdad** de las asignaciones es el sistema externo **ACA (proyección)**. Orbit recibe esa información mediante un proceso de importación y la guarda para consulta.

En la práctica, lo que se muestra en Orbit es una **proyección** de la carga académica (así está etiquetado en el sistema), no un flujo de “carga actual” editable dentro de la aplicación.

---

## 3. ¿Qué información guarda cada asignación?

Una asignación de carga académica combina varios conceptos:

### 3.1 Docente

Es la persona que imparte la materia. En Orbit debe existir previamente como **persona/docente** (identificada por su documento).

Si el documento del docente **no está registrado** en Orbit, esa asignación **no se importa** y no aparecerá en el módulo.

### 3.2 Materia (asignatura)

El curso o asignatura: código, nombre, créditos y, cuando aplica, horas asociadas.

### 3.3 Grupo

La oferta concreta de esa materia: código de grupo, fechas, aula, cupo, bloque, horario, modalidad, estudiantes matriculados, etc.

### 3.4 Periodo académico

El periodo al que pertenece la asignación (por ejemplo códigos tipo `26C11`, `2026Q`, etc.). Es el filtro más importante para consultar “la carga de un ciclo”.

### 3.5 Programa

El programa académico asociado a la asignación. Puede venir como nombre desde ACA y, cuando es posible, vincularse al catálogo de programas de Orbit.

### 3.6 Modalidad

Se normaliza principalmente en dos valores:

- **P** → Presencial  
- **V** → Virtual  

### 3.7 Ubicación (opcional)

Región, ciudad o campus, cuando esa información viene asociada a la carga.

---

## 4. Cómo se ve en Orbit (para el usuario)

### 4.1 Acceso

El módulo aparece en el menú como **Carga Académica**. Solo lo ven usuarios con permiso de consulta de carga académica.

Además:

- Algunos roles ven **toda** la información.
- Coordinadores u otros roles con alcance de escuela suelen ver **solo** las cargas relacionadas con su escuela (según el docente o el programa).
- Solo aparecen docentes **activos**.

### 4.2 Qué muestra la pantalla

Una tabla con columnas como:

| Columna | Significado |
|---|---|
| Docente | Nombre del profesor |
| Programa | Programa asociado |
| Materia | Nombre de la asignatura |
| Créditos | Créditos de la materia |
| Modalidad | Presencial o Virtual |
| Periodo | Periodo académico de la asignación |

### 4.3 Búsqueda y filtros

El usuario puede:

1. **Buscar** por docente, materia o programa.  
2. **Filtrar por periodo** (lista de periodos disponibles según los datos importados).  
3. **Filtrar por modalidad** (Presencial / Virtual).  
4. Navegar por **páginas** (listados paginados, típicamente 100 registros por página).

No hay formularios de creación ni botones de edición: la pantalla es de exploración y seguimiento.

---

## 5. De dónde sale la información (flujo completo)

```text
ACA (proyección / scrape)
        │
        ▼
 Archivo JSON de carga académica
        │
        ▼
 Scripts de importación en Orbit
        │
        ├──► Verifica que el docente exista (por documento)
        ├──► Crea o actualiza materias y grupos
        └──► Guarda / actualiza las asignaciones
        │
        ▼
 Base de datos de Orbit (módulo de carga académica)
        │
        ├──► Pantalla "Carga Académica"
        └──► Cálculo de horas de cátedra en "Horas Sustantivas"
```

### 5.1 Origen

Un proceso externo descarga/scrapea la proyección de ACA y genera un archivo JSON con las asignaciones (docente, periodo, materia, grupo, programa, modalidad, cupos, etc.).

### 5.2 Importación a Orbit

Un script de operaciones toma ese JSON e importa la información a Orbit. El flujo típico de una **recarga completa** es:

1. **Borra** la carga académica actual en Orbit.  
2. Limpia materias/grupos que queden huérfanos (sin uso).  
3. Recorre cada asignación del JSON.  
4. Para cada una:
   - Busca al docente por documento.  
   - Si no existe → **omite** esa fila y la deja registrada en un archivo de progreso.  
   - Si existe → crea/actualiza materia, grupo y asignación.  
5. Genera un **reporte de progreso** (cuántas se cargaron, cuántas se saltaron, etc.).

### 5.3 Completar docentes faltantes

Cuando hay asignaciones omitidas porque el docente no estaba en Orbit, el proceso operativo suele ser:

1. Contrastar la **BASE DOCENTE** (Excel de nuevos/reintegros) contra las personas ya registradas.  
2. Crear o actualizar los docentes faltantes en Orbit.  
3. Reimportar las asignaciones que antes se habían saltado.

Así se busca que la mayor parte posible de la proyección de ACA quede reflejada en la plataforma.

---

## 6. Reglas de negocio importantes

Estas son las reglas que más importan para coordinación académica, operación y seguimiento:

1. **Sin docente en Orbit, no hay carga visible.**  
   El documento del profesor debe existir en el maestro de personas. Si no, la asignación se omite en la importación.

2. **La actualización normal es una recarga completa.**  
   El import típico reemplaza toda la carga, no “parcha” solo unas pocas filas. Hay que tratarlo como un refresco del periodo (o del conjunto de periodos del archivo).

3. **Orbit no aprueba ni gestiona el flujo de asignación.**  
   No hay estados tipo borrador / aprobado / rechazado. Lo que se ve es lo importado desde la proyección.

4. **Lo que se muestra es proyección.**  
   El sistema trata los datos como proyección proveniente de ACA, no como un segundo proceso de “carga vigente” editable en Orbit.

5. **Solo docentes activos aparecen en el listado.**  
   Si un docente está inactivo en el maestro de personas, su carga no se lista en la consulta general.

6. **La visibilidad depende del permiso y, a veces, de la escuela.**  
   No todos los usuarios ven lo mismo; el alcance puede estar limitado por rol y escuela.

7. **Una asignación se identifica de forma única** por la combinación de:
   - docente  
   - materia  
   - grupo  
   - periodo  

   Es decir: el mismo profesor, misma materia, mismo grupo y mismo periodo = una sola fila.

8. **El programa puede verse como nombre**, aunque no siempre esté completamente enlazado al catálogo interno de programas. Eso no impide consultarlo en pantalla.

9. **Modalidad se interpreta como Presencial o Virtual.**  
   Otros valores, si llegaran, se muestran tal cual, pero el filtro operativo está pensado para P/V.

10. **La carga académica alimenta Horas Sustantivas.**  
    Las materias asignadas al docente se usan para calcular las **horas de cátedra** del balance semanal.

---

## 7. Relación con Horas Sustantivas

Aunque son módulos distintos, están conectados.

En **Horas Sustantivas**, Orbit calcula aproximadamente así el balance semanal de un docente:

```text
Horas de contrato
  − Horas de cátedra (provenientes de la carga académica)
  − Horas de preparación de clase
  − Horas sustantivas ya asignadas
= Horas restantes
```

### Detalles útiles

- **Contrato:** típicamente 42 horas (tiempo completo) o 21 (medio tiempo), según la etiqueta de contrato del docente.  
- **Cátedra:** se obtiene a partir de las materias asociadas a la carga académica del docente.  
- **Preparación:** si el docente no tiene un valor específico configurado, se usa un valor por defecto (actualmente 4 horas).  
- **Horas sustantivas:** son asignaciones distintas (actividades no de cátedra) que se gestionan en su propio módulo.

En resumen: **sin carga académica bien cargada, el balance de horas de un docente puede quedar incompleto o desactualizado**.

---

## 8. Relación con otros módulos

| Módulo / fuente | Relación con carga académica |
|---|---|
| **Personas / Docentes** | Toda asignación exige que el docente exista (documento). |
| **Programas / Escuelas** | Ayudan a contextualizar y a filtrar por alcance de escuela. |
| **Horas Sustantivas** | Usa la carga para calcular cátedra y el balance de horas. |
| **BASE DOCENTE (Excel)** | Fuente operativa para completar docentes nuevos/reintegros antes o durante la importación. |
| **ACA** | Fuente externa de la proyección de asignaciones. |
| **Planta activa, vacantes, novedades** | Comparten el maestro de personas, pero no administran la carga académica. |

---

## 9. Ciclo operativo recomendado (para el equipo)

Cuando se necesita actualizar la carga en Orbit, el flujo práctico suele ser:

1. **Obtener** el JSON de proyección desde ACA (scrape / descarga).  
2. **Revisar** si hay docentes nuevos o reintegros en la BASE DOCENTE.  
3. **Asegurar** que esos docentes existan en Orbit (documento correcto, activos, datos básicos).  
4. **Ejecutar** la importación de carga académica.  
5. **Revisar** el archivo de progreso: cargadas vs omitidas.  
6. **Completar** docentes faltantes y reimportar lo pendiente, si aplica.  
7. **Validar en la UI** de Carga Académica: periodos, muestras por escuela, modalidades, docentes clave.  
8. **Revisar Horas Sustantivas** para confirmar que la cátedra refleja la nueva carga.

### Señales de que algo falta

- Un docente “debería” tener materias y no aparece → probablemente no está en personas, está inactivo, o su documento no coincide.  
- Un periodo no sale en el filtro → ese periodo no vino en el último import (o quedó vacío).  
- Hay muchas filas omitidas en el progreso → priorizar el cruce BASE DOCENTE vs personas.

---

## 10. Qué no hace (aún) el módulo

Para evitar expectativas incorrectas:

- No permite asignar docentes a materias desde Orbit.  
- No detecta cruces de horario ni conflictos de agenda.  
- No valida automáticamente “máximo de horas por docente” al importar.  
- No exige que el cupo del grupo coincida con los matriculados (solo evita valores negativos en datos).  
- No tiene flujo de aprobación ni historial de versiones de negocio dentro de la app.  
- No sustituye a ACA como sistema de proyección/asignación.

Orbit, en este punto, es el **espejo consultable** de esa proyección, integrado al resto de la operación docente (personas, escuelas, horas).

---

## 11. Preguntas frecuentes

### ¿Por qué no veo a un docente en Carga Académica?

Puede deberse a que:

- no está creado en el maestro de personas,  
- su documento no coincide con el de ACA,  
- está inactivo,  
- o su asignación pertenece a un periodo que no está filtrado / no fue importado.

### ¿Puedo corregir una materia desde Orbit?

No desde la interfaz. La corrección debe hacerse en el origen (ACA) y luego reimportarse, o mediante un proceso operativo de datos.

### ¿La importación suma sobre lo anterior?

En el proceso estándar de recarga completa, **no**: primero limpia la carga existente y luego vuelve a cargar. Por eso es importante usar el archivo correcto y completo de periodos.

### ¿Carga Académica y Horas Sustantivas son lo mismo?

No.  
- **Carga Académica** = qué enseña cada docente.  
- **Horas Sustantivas** = balance de horas (contrato, cátedra, preparación y otras actividades).  

La primera alimenta parte del cálculo de la segunda.

### ¿Quién puede ver el módulo?

Usuarios con permiso de consulta de carga académica. Según el rol, pueden ver todo o solo su escuela.

---

## 12. Resumen en una frase

**Carga Académica en Orbit es la consulta centralizada de la proyección docente (materia–grupo–periodo) importada desde ACA; no se edita en la app, requiere que el docente exista en Orbit, y sirve también como base de las horas de cátedra en Horas Sustantivas.**

---

## Anexo: componentes del proceso (referencia operativa)

| Pieza | Rol |
|---|---|
| Pantalla **Carga Académica** | Consulta, búsqueda y filtros |
| API de consulta de carga | Entrega listados, resumen por periodo y detalle por docente |
| Esquema de carga académica | Guarda asignaciones, materias, grupos y preparación de clase |
| Maestro de personas | Identifica al docente por documento |
| Import desde JSON ACA | Refresca la proyección en Orbit |
| Cruce BASE DOCENTE | Detecta docentes faltantes |
| Completar docentes + carga | Crea personas faltantes y recupera asignaciones omitidas |
| Horas Sustantivas | Consume la carga para calcular cátedra |

---

*Documento orientado a usuarios de negocio, coordinación y operación. Si se requieren detalles técnicos de tablas, endpoints o scripts, pueden documentarse en un anexo técnico separado.*
