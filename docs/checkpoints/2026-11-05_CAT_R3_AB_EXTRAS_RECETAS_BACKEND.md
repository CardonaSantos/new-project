# Gastro Core — R3-A+B / Checkpoint del servidor

**Fecha:** 2026-11-05
**Repositorio:** `CardonaSantos/new-project`
**Base:** R2 `feat/catalog-r2-atomic-setup-readiness-20261105` (PR #31, sin fusionar).
**Rama:** `feat/catalog-r3-extras-recipes-safe-20261105` — PR #32, draft.
**UI correspondiente:** `CardonaSantos/new-project-angular-ui`, PR #33 `feat/catalog-r3-extras-recipe-composer-20261105` (incluye R1 + R2 + R3-A/B).
**Próximo hito:** R3-C (constructor y vista de cartas, navegación de Precios).

## 1. Regla central: cuándo se descuenta Inventario
- `POST /api/recipes` y `POST /api/recipes/:id/versions` definen fórmulas de venta (tipo VENTA), rendimiento, artículos de inventario, unidades, cantidades y merma. Pueden publicar en la misma transacción si el usuario dispone de `recipes.publish`.
- **Guardar o publicar una receta no mueve stock**.
- `src/modules/orders/infrastructure/prisma/order.store.ts` congela al registrar la orden `OrdenLinea.recetaVersionId` y `composicionSnapshot` de extras. Las modificaciones posteriores **no reescriben la composición** de órdenes ya aceptadas.
- `ConsumptionStore.recipe` calcula consumo al procesar la preparación a través de `ProductionStore.planForOrder` y emite movimientos OUT/CONSUMO mediante `InventoryPostingEngine`, usando FEFO y evitando posiciones/lotes no utilizables. Si faltan ingredientes se rechaza la operación: nunca se debe fingir que descontó stock.
- `INVENTARIABLE` registra consumo DIRECTO del artículo terminado en su ruta de venta, no consumo de receta. `SERVICIO` no consume ninguno. La nueva UI no debe forzar recetas sobre estos tipos.

## 2. R3-A — Nueva ruta
**POST /api/catalog/modifier-groups/setup**

Request:
```json
{
  "nombre": "Toppings",
  "minimo": 0,
  "maximo": 1,
  "varianteId": "variante-preparada-opcional",
  "opciones": [
    {
      "nombre": "Crema batida",
      "incrementoPrecio": "3.00",
      "ingredientes": [
        {"articuloId": "id-crema", "unidadId": "id-gramos", "cantidad": "20.000", "efecto": "SUMAR"}
      ]
    },
    {"nombre": "Canela", "incrementoPrecio": "0.00", "ingredientes": []}
  ]
}
```
- Opciones de 1–30; evita duplicar nombre, supera límites o falta artículo/unidad/cantidad.
- Permisos globales: `catalog.manage` siempre; adicionalmente `recipes.manage` cuando se aportan ingredientes físicos.
- Transacción SERIALIZABLE: grupo, opciones, componentes y asociación opcional a una sola variante. Ante error se revierte TODO. Registra auditoría.
- `requiereComposicion` del modificador se deriva de ingredientes efectivamente creados. No existe checkbox backend que habilite consumo sin líneas.
- Reusa `toBase()` para validación positiva y conversión según dimensión/unidad del artículo; consume **cero stock** al crear.
- Formulario guiado admite solo SUMAR (ingredientes adicionales). Los efectos RESTAR y SUSTITUIR se mantienen en la edición avanzada de REC-A, pues deben contrastarse contra la receta del producto; no simplificarlos a toggles ambiguos.
- Asociación de extras con ingredientes exige variante PREPARADO. No asociar componentes físicos a venta directa o servicio desde el alta rápida.

## 3. Bloqueo de publicación insegura
En `CatalogMenuStore.readiness`, además de los controles R2 (precio, foto, receta publicada, ubicación/estación de cocina), se incluyen:
- `EXTRA_SIN_COMPOSICION_FISICA`: modificador activo marcado como físico y sin ingredientes.
- `EXTRA_FISICO_REQUIERE_PREPARADO`: composición física vinculada a INVE/SERVICIO sin canal de consumo receta.

Estas causas impiden publicar menús inconsistentes. No modifican la fórmula o la política de consumo de órdenes existentes.

## 4. Pruebas
- `src/modules/catalog/application/catalog-setup.service.spec.ts`: guarda grupo+ingredientes en una transacción, no crea movimientos físicos, rechaza límites incorrectos, cantidades inválidas, efectos no guiados, duplicados.
- `test/catalog.e2e-spec.ts`: acepta contrato válido y rechaza importes, cantidades y efectos inválidos.
- CI: compilación y tests unitarios/HTTP, PostgreSQL smoke; enlazar el último run aprobado del PR #32.

## 5. UAT obligatoria antes de main
1. Producto PREPARADO con receta publicada, una orden real, preparación y entrega: comparar receta y salida real por artículo/unidad/lote/ubicación. No se descuenta al crear receta.
2. Añadir extra con SUMAR 20g de crema: nuevo pedido con el extra debe consumir ingredientes base **más** crema. Sin extra, solo fórmula base.
3. Modificar receta después de aceptar una orden: su `recetaVersionId` y `composicionSnapshot` siguen inalterados.
4. Publicación de menú con extra físico marcado pero sin ingredientes: bloquear y conservar carta anterior (R2 commit transaccional).
5. Grupo incompleto / sin permisos / unidad incompatible: comprobar rollback real PostgreSQL (sin grupos ni opciones huérfanos).
6. `INVENTARIABLE` con extras de consumo físico debe bloquearse al publicar; los extras meramente comerciales siguen siendo válidos.
7. Revisar entradas reales de Inventario, lotes FEFO, receta con merma y divisiones de preparación; caja/pagos no recalculan inventario.

## 6. Local
Desde `new-project`:
```powershell
git status
git fetch origin
git switch -c feat/catalog-r3-extras-recipes-safe-20261105 --track origin/feat/catalog-r3-extras-recipes-safe-20261105
npm run start:dev
```
Si la rama existe localmente: `git switch feat/catalog-r3-extras-recipes-safe-20261105` y `git pull --ff-only origin feat/catalog-r3-extras-recipes-safe-20261105`.

**No fusionar a main aún. No hay migraciones Prisma nuevas.**
