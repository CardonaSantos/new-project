/**
 * "Reporte del día": one consolidated snapshot of a single calendar day, fixed to the
 * Guatemala wall clock (America/Guatemala, 00:00 to 23:59:59.999) regardless of the
 * branch's own configured zonaHoraria/horaCorteOperativo (those drive the *financial*
 * operational day used by cash-shift closing; the user explicitly asked for the plain
 * calendar day here instead, so this type intentionally does not reuse that mechanism).
 */
export interface DailyReportQuery{sucursalId:string;fecha?:string}
