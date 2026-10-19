# ORBIT — Mapa del proceso operativo (paquete para generar la pieza)

> **Qué es esto:** la **Parte 0** es la paleta real de la app. La **Parte 1** es la instrucción de estilo (diseño propio de Orbit, no sketch a mano). La **Parte 2** es el contenido literal de los 16 pasos. La **Parte 3** son los paneles de apoyo y el pie.
> Copia **todo** y pégalo en un generador de imágenes, en Figma/FigJam, o pide que se construya como página HTML.

---

## PARTE 0 — PALETA Y ESTILO (tomados del código de la app)

| Token | Hex | Uso en la pieza |
|---|---|---|
| Primary | `#A855F7` | Números de paso, acentos, botones principales |
| Accent | `#7C3AED` | Etiquetas de fase, degradado del encabezado |
| Info | `#0284C7` | Datos, chips informativos, gráficos |
| Success | `#16A34A` | Estados terminales positivos (Contratado) |
| Warning | `#D97706` | Riesgo, plazo por vencer |
| Danger | `#E11D48` | Vencido, cancelado, alertas |
| Fondo | `#FFFFFF` | Lienzo |
| Fondo secundario | `#F7F7FA` | Bandas de fase |
| Interactivo | `#F1F1F5` | Relleno de las miniaturas de interfaz |
| Borde | `#E4E4EB` | Bordes de tarjeta, 1 px |
| Texto | `#111118` | Títulos y cuerpo |
| Texto secundario | `#5C5C6B` | Viñetas |
| Muted | `#8B8B9A` | Etiquetas y metadatos |

**Tipografía:** Inter o similar geométrica sans. Títulos semibold, cuerpo regular. Mayúsculas solo en las etiquetas de fase.

---

## PARTE 1 — INSTRUCCIÓN (pégala primero)

> Diseña un **mapa de proceso de producto**, limpio y moderno — **no** un sketch dibujado a mano, **no** estilo pizarra ni marcador. Debe parecer una lámina de documentación de software hecha en Figma.
>
> **Formato:** horizontal, 2560 × 1600 px, fondo blanco `#FFFFFF`.
>
> **Estructura:** cuatro **bandas de fase** horizontales apiladas. Cada banda con fondo `#F7F7FA`, esquinas redondeadas de 16 px y una etiqueta de fase a la izquierda, escrita en vertical, en mayúsculas y en `#7C3AED`. Dentro de cada banda, las tarjetas de paso van en fila, conectadas por flechas finas de 2 px en `#A855F7` con punta pequeña.
>
> **Tarjeta de paso:** fondo blanco, borde de 1 px `#E4E4EB`, radio 12 px, sombra muy suave. Arriba a la izquierda, un círculo relleno `#A855F7` de 28 px con el número en blanco; al lado, el título en `#111118` semibold. Debajo, una **miniatura de interfaz**: wireframe gris con rectángulos `#F1F1F5`, líneas `#E4E4EB` y un solo elemento resaltado en `#A855F7` o `#0284C7`. Debajo de la miniatura, de tres a cuatro viñetas en `#5C5C6B`, con viñeta cuadrada morada.
>
> **Encabezado:** franja superior con degradado sutil de `#7C3AED` a `#A855F7`, logotipo "ORBIT" en blanco, título y subtítulo, y a la derecha cuatro contadores en cajas translúcidas.
>
> **Columna derecha:** cuatro paneles de apoyo con el mismo estilo de tarjeta.
>
> **Pie:** banda blanca con siete principios, cada uno con un icono lineal de 24 px en `#A855F7`, título en negrita y una línea de texto.
>
> Usa **exactamente** los textos que siguen, en español con tildes. No inventes contenido ni lo traduzcas.
>
> [PEGAR AQUÍ LAS PARTES 2 Y 3]

**Si el generador no sostiene tanto texto:** pídelo por fases, una imagen por banda con el mismo estilo, y únelas. Da mucho mejor resultado que forzar todo en una sola.

**Ruta alternativa, la más confiable:** pide "construye esto como una página HTML de una sola pantalla con esta paleta". El texto sale nítido y lo exportas a PNG o PDF.

---

## PARTE 2 — CONTENIDO

### ENCABEZADO

- **Logotipo:** ORBIT
- **Título:** Mapa del proceso operativo
- **Subtítulo:** De la novedad de planta a la decisión académica
- **Descriptor:** Plataforma interna CUN para operación académica y de planta. Registra cada novedad, la convierte en una vacante trazable y devuelve el resultado a la operación.

**Contadores del encabezado:**

- 7 módulos
- 11 dominios de API
- 8 estados de vacante
- 1 fuente de verdad

---

### FASE A — ACCESO Y CONTEXTO

#### 1. Autenticación

**Miniatura:** tarjeta de login centrada, logotipo, un campo de correo atenuado y un botón morado "Continuar con Google"; abajo, la nota "@cun.edu.co".

- Inicio de sesión con Google restringido al dominio institucional.
- Allowlist de correos habilitados.
- Token de sesión que firma cada acción posterior.
- Sin credenciales locales en producción.

#### 2. Rol y capabilities

**Miniatura:** matriz de dos columnas, "Vista" y "Permiso", con interruptores; dos encendidos en morado y dos apagados en gris.

- Cada vista se habilita por capability, no por cargo.
- Grants específicos para Planta Activa y administración de vacantes.
- El menú se arma según lo que el usuario puede ver.
- El backend valida el permiso en cada ruta, no solo la interfaz.

#### 3. Command Center

**Miniatura:** barra lateral estrecha con iconos, tres tarjetas de métrica con números grandes, un gráfico de línea azul y dos filas de alerta.

- Resumen de la operación: personal activo, vacantes abiertas, contrataciones del mes.
- Tiempo promedio de cierre y vacantes en riesgo.
- Alertas de calidad del dato: personal sin correo CUN o sin identificación.
- Accesos directos a cada módulo según el rol.

---

### FASE B — DETECCIÓN DE LA NOVEDAD

#### 4. Planta Activa

**Miniatura:** tabla con buscador arriba y columnas "Nombre · Documento · Área · Cargo · Estado"; chips de estado de colores y un botón "Editar".

- Padrón de personas activas por área y escuela.
- Edición acotada: solo los campos que el permiso autoriza.
- Filtros por área, cargo, programa y estado.
- Fuente única de verdad que alimenta al resto de la plataforma.

#### 5. Registro de la novedad

**Miniatura:** modal "Registrar novedad" con selector de tipo, campo de motivo, selector de fecha efectiva y botón morado "Registrar".

- Tipos: inhabilitación, reintegro y movimiento interno.
- Motivo y fecha efectiva obligatorios.
- Se almacena como evento de fuerza laboral, no como una edición suelta.
- Queda con autor, fecha y hora para auditoría.

#### 6. Evaluación de impacto

**Miniatura:** panel de dos columnas; a la izquierda "Área afectada" con un árbol de escuela y programa, a la derecha chips de impacto: "Carga académica", "Horas sustantivas", "Vacante".

- Identifica qué áreas y programas quedan descubiertos.
- Detecta si la novedad deja grupos sin docente asignado.
- Marca si corresponde abrir vacante o resolver con movimiento interno.
- Prioriza según la criticidad del cargo.

#### 7. Generación de la vacante

**Miniatura:** ficha "Nueva vacante" con campos Área, Cargo, Cantidad y Origen; un chip morado "AUTO" y el estado "Abierta" resaltado.

- Automática al inhabilitar DOCENTE, LITE o COORDINADOR ACADÉMICO.
- Manual cuando la necesidad nace de planeación y no de una baja.
- Cargo tomado del catálogo CORE, sin texto libre.
- Estado inicial: Abierta.

---

### FASE C — GESTIÓN DE LA VACANTE

#### 8. Selección de candidato

**Miniatura:** lista de tres candidatos con avatar y nombre; el segundo con borde morado y una marca de selección.

- Registro del candidato propuesto por el área.
- El estado pasa a Seleccionado.
- Queda la fecha de selección para el cálculo de tiempos.
- Permite contratación parcial cuando la cantidad es mayor a uno.

#### 9. Requisición y cumplimientos

**Miniatura:** panel "Requisición" con cuatro filas de verificación — Terna, PDA, Condiciones contractuales, HV pre-entrevista — cada una con tres opciones y un responsable asignado.

- Requisición uno a uno asociada a la vacante.
- Cada cumplimiento se marca como Sí cumplió, No cumplió o Pendiente.
- Al crear la requisición el estado pasa a Requisición enviada.
- Se registra la fecha de envío a Capital Humano: ahí arranca el reloj.

#### 10. Notificación y responsables

**Miniatura:** campana con contador rojo, lista de tres notificaciones y un sobre de correo con la etiqueta "Enviado".

- Campana dentro de la aplicación y correo a los responsables.
- Cada etapa tiene un dueño explícito.
- Avisos al cambiar de estado y al vencerse un plazo.
- Nadie depende de recordar: el sistema avisa.

#### 11. Seguimiento y ANS

**Miniatura:** línea de estados horizontal con cinco nodos conectados; al lado, un medidor "Tiempo activo: 18 días" y una etiqueta ámbar "En riesgo".

- Tiempo activo contado desde el envío a Capital Humano.
- Umbrales por etapa, con semáforo verde, ámbar y rojo.
- Escalamiento cuando una etapa supera su plazo.
- Historial completo de estados con usuario y fecha.

#### 12. Cierre

**Miniatura:** tarjeta de resultado con cuatro opciones de cierre apiladas, la primera en verde con una marca de verificación, y un resumen "Contratados 2 de 3".

- Estados terminales: Contratado, Cerrada, Cancelada y Cancelada por capital.
- Admite contratación parcial sobre la cantidad solicitada.
- El contratado se incorpora a Planta Activa.
- Se congela el tiempo total del ciclo para el indicador.

---

### FASE D — OPERACIÓN ACADÉMICA Y DECISIÓN

#### 13. Carga académica

**Miniatura:** tabla "Docente × Materia × Grupo" con barras de progreso de horas; dos en azul y una en rojo.

- Asignaciones de docente, materia y grupo por periodo.
- Proyección académica como insumo de planeación.
- Detecta grupos sin docente y docentes sobreasignados.
- Se alimenta de la planta ya actualizada por el cierre.

#### 14. Balance de carga

**Miniatura:** dos columnas comparativas, "Horas sustantivas" y "Horas cátedra", con barras y una etiqueta de alerta "Cargas desequilibradas".

- Distribución de horas sustantivas frente a horas cátedra.
- Desequilibrios por docente, programa y escuela.
- Comparativo entre áreas para redistribuir antes de contratar.
- Evita abrir vacantes que se resuelven reorganizando.

#### 15. Panel informativo y auditoría

**Miniatura:** pestañas "Bitácora | Novedades"; lista de cambios con identificador, usuario, fecha y punto de color de estado.

- Bitácora de cambios: quién, qué y cuándo.
- Novedades difundidas por área y por rol.
- Reconstrucción de la historia completa de cualquier vacante.
- Soporte para comités y revisiones de control interno.

#### 16. Reportes y KPIs

**Miniatura:** tablero con selector de periodo, dos tarjetas de indicador, un gráfico de anillo y un botón "Descargar Excel".

- Vacantes por estado, área y cargo.
- Tiempos de ciclo y cumplimiento del ANS.
- Evolución mensual de contrataciones y cierres.
- Exportación a Excel para comités y seguimiento.

**Flecha de retorno:** del paso 16 vuelve al paso 3, con la etiqueta **"La decisión vuelve a la operación"**.

---

## PARTE 3 — PANELES DE APOYO

### Panel 1 — Estados de la vacante

| Estado | Tipo | Color |
|---|---|---|
| Abierta | Inicial | `#0284C7` |
| Seleccionado | Intermedio | `#A855F7` |
| Requisición enviada | Intermedio | `#7C3AED` |
| Movimiento interno | Intermedio, opcional | `#8B8B9A` |
| Contratado | Terminal | `#16A34A` |
| Cerrada | Terminal | `#5C5C6B` |
| Cancelada | Terminal | `#D97706` |
| Cancelada por capital | Terminal | `#E11D48` |

### Panel 2 — Quién hace qué

| Perfil | Alcance |
|---|---|
| Coordinación de escuela | Registra novedades y propone candidatos de su área. |
| Operaciones | Gestiona vacantes, requisición y seguimiento del ANS. |
| Capital Humano | Recibe la requisición, verifica cumplimientos y cierra. |
| Acceso total | Visión transversal, auditoría y reportes. |
| Perfil Lite | Consulta acotada, sin acceso a vacantes. |

### Panel 3 — Reglas que el sistema aplica solo

- Inhabilitar DOCENTE, LITE o COORDINADOR ACADÉMICO genera vacante automáticamente.
- Crear la requisición mueve el estado a Requisición enviada.
- El tiempo activo se cuenta desde la fecha de envío a Capital Humano.
- Un estado terminal congela el reloj y bloquea la edición.
- El cargo siempre proviene del catálogo CORE.
- Toda acción queda atribuida al usuario que la ejecutó.

### Panel 4 — Indicadores del tablero

- Personal activo
- Vacantes abiertas
- Contrataciones del mes
- Tiempo promedio de cierre
- Vacantes en riesgo, más de 30 días
- Tasa de recurrencia por área
- Cargas desequilibradas
- Personal sin correo o sin identificación

---

## PIE — PRINCIPIOS DE DISEÑO DE ORBIT

| Icono | Título | Texto |
|---|---|---|
| Línea de tiempo | Trazabilidad | Cada novedad se sigue de origen a cierre. |
| Panel | Visibilidad operativa | La información es clara y está al día. |
| Escudo | Seguridad por rol | Cada quien ve solo lo que le corresponde. |
| Reloj | Plazos acordados | El ANS mide y avisa antes de que sea tarde. |
| Red | Áreas impactadas | El efecto se ve en toda la operación. |
| Persona | Responsables | Asignar, dar seguimiento y rendir cuentas. |
| Base de datos | Dato confiable | Una sola fuente de verdad para decidir. |
