import { modernEnglish } from './modern-messages';
export type Language = 'en' | 'es';
export function languagePreference(value: string | null): Language { return value === 'es' ? 'es' : 'en'; }
export const english: Record<string, string> = {
  'Terminados':'Finished',
  'Lista de procesado':'Processing list',
  'Lote terminado':'Batch finished',
  'Información sobre el límite de duración':'About the duration limit','Límite de duración':'Duration limit',
  'Máximo 5 minutos por vídeo, también en modo exhaustivo.':'Up to 5 minutes per video, including exhaustive mode.',
  'Conexión con el servidor local de Savedex y sincronización de la cola.':'Connection to the local Savedex server and queue synchronization.',
  'Pendientes':'Pending','Acciones del vídeo':'Video actions','Acciones':'Actions','Cerrar detalles':'Close details','Vista del vídeo':'Video view',
  'Resultado':'Result','Resultado mostrado':'Displayed result','Este vídeo se está procesando.':'This video is processing.','Todavía no hay un resultado válido.':'No valid result is available yet.',
  'intento':'attempt','intentos':'attempts','Intento':'Attempt','Tarea':'Task',
  'Mostrar actividad':'Show activity','Ocultar actividad':'Hide activity',
  'Actividad del vídeo':'Video activity','Avance del lote':'Batch progress',
  'Conectado':'Connected',
  'Cerrar resumen':'Dismiss summary',
  'Preparando el vídeo para la extracción.':'Preparing the video for extraction.',
  'Buscando información en la descripción del vídeo.':'Looking for information in the video description.',
  'Convirtiendo el audio en texto para analizarlo.':'Turning audio into text for analysis.',
  'Buscando texto en los fotogramas.':'Looking for text in video frames.',
  'Comprobando los elementos encontrados y sus evidencias.':'Checking extracted items and their evidence.',
  'Finalizando la extracción. El resultado aún no está disponible.':'Finalizing extraction. The result is not available yet.',
  'Esperando información del extractor. Algunas etapas pueden tardar varios minutos.':'Waiting for updates from the extractor. Some stages may take several minutes.',
  'Último estado conocido':'Last known state','Tiempo transcurrido':'Elapsed time','Última señal hace':'Last update',
  'Sin conexión. La cola puede seguir trabajando.':'Disconnected. The queue may still be running.',
  'Este vídeo terminará. El siguiente no se iniciará.':'This video will finish. The next one will not start.',
  'Detener después de este vídeo':'Stop after this video','vídeos procesados':'videos processed',
  'en espera en este lote':'waiting in this batch','Vídeos procesados del lote':'Processed videos in this batch',
  'completados':'completed','parciales':'partial','errores':'errors',
  'Biblioteca':'Library','Añadir':'Add','Procesado':'Processing','Añadir un vídeo':'Add a video',
  'Saltar al contenido':'Skip to content','Savedex, añadir vídeo':'Savedex, add a video','Secciones de Savedex':'Savedex sections',
  'Tu espacio de consulta.':'Your reference space.','Apariencia':'Appearance','Sistema':'System','Clara':'Light','Oscura':'Dark','Idioma':'Language',
  'Conectado · Guardado local':'Connected · Stored locally','Conectando con Savedex…':'Connecting to Savedex…','Sincronizando estado…':'Syncing…',
  'Sin conexión · Mostrando el último estado conocido. La cola puede seguir trabajando.':'Disconnected · Showing the last known state. The queue may still be running.',
  'Cerrar aviso':'Dismiss message','Actividad global':'Global activity','Procesando':'Processing','Deteniendo al finalizar el vídeo':'Stopping after this video',
  'El vídeo activo terminará antes de detener la cola.':'The active video will finish before the queue stops.',
  'Lote terminado ·':'Batch finished ·','tarea':'task','tareas':'tasks','completados ·':'completed ·','parciales ·':'partial ·','errores ·':'errors ·','por revisar':'to review','por revisar ·':'to review ·',
  'Cola detenida':'Queue stopped','pendientes. Reanuda cuando quieras.':'pending. Resume when you are ready.','La cola necesita atención':'The queue needs attention',
  'Sin actividad':'No activity','Añade un enlace para empezar.':'Add a link to get started.','Inicia la cola cuando quieras.':'Start the queue when you are ready.',
  'Ver resultados':'View results','Ver cola':'View queue','Detener':'Stop','Deteniendo…':'Stopping…','Descartar resumen':'Dismiss summary',
  'De guardado a útil.':'From saved to useful.','Guarda el vídeo. Recupera lo que importa.':'Save the video. Find what matters.',
  'Enlace de Instagram o YouTube':'Instagram or YouTube link','Pega aquí el enlace del vídeo':'Paste the video link here','Añadiendo…':'Adding…',
  'Una URL cada vez. Tú decides cuándo iniciar la cola.':'One URL at a time. You decide when to start the queue.',
  'Límite: 5 minutos por vídeo.':'Limit: 5 minutes per video.','También en modo exhaustivo. Los vídeos más largos no se procesan.':'This also applies to exhaustive mode. Longer videos cannot be processed.',
  'Límite: 5 minutos por vídeo, también en modo exhaustivo. Los vídeos más largos no se procesan.':'Limit: 5 minutes per video, including exhaustive mode. Longer videos cannot be processed.',
  'Vídeo añadido a la cola':'Video added to the queue','Este vídeo ya está guardado':'This video is already saved','Guardado en este dispositivo.':'Saved on this device.',
  'No se ha duplicado ni vuelto a encolar.':'It has not been duplicated or queued again.','Ver en Procesado':'View in Processing','Iniciar cola':'Start queue','Reanudar cola':'Resume queue','Finalizar lote':'Finish batch',
  'Del enlace a tu biblioteca':'From link to library','Los resultados conservan su fuente y su evidencia. Podrás revisarlos antes de darlos por buenos.':'Results retain their source and evidence. You can review them before accepting them.',
  'Una tarea cada vez. Las nuevas incorporaciones esperan al siguiente lote.':'One task at a time. New additions wait for the next batch.','pendientes':'pending',
  'DETENIENDO AL FINALIZAR EL VÍDEO':'STOPPING AFTER THIS VIDEO','VÍDEO ACTIVO':'ACTIVE VIDEO','Vídeo activo':'Active video',
  'Paso observado. El extractor puede repetir u omitir pasos.':'Observed step. The extractor may repeat or skip steps.','· Lote':'· Batch',
  'El vídeo activo ha terminado. Reanuda cuando quieras.':'The active video has finished. Resume when you are ready.','Cargando cola…':'Loading queue…',
  'Tu cola está vacía':'Your queue is empty','Añade un vídeo para empezar.':'Add a video to get started.','Exhaustivo':'Exhaustive','Normal':'Normal','· Siguiente lote':'· Next batch',
  'Requiere revisión':'Review required','Quitar':'Remove','Reintentar':'Retry','Volver a encolar':'Queue again','Ver resultado e historial':'View result and history',
  'Lo que has extraído, con su evidencia.':'Your extracted results, with evidence.','Filtros de biblioteca':'Library filters','Nombre o descripción':'Name or description',
  'Buscar en los ítems':'Search items','Tipo':'Type','Todos los tipos':'All types','Incorporado desde':'Added from','Hasta':'To','Filtrar':'Apply filters',
  'Vista de biblioteca':'Library view','Por vídeo':'By video','Por tipo':'By type','vídeos ·':'videos ·','ítems':'items',
  'Mostrando el vídeo seleccionado.':'Showing the selected video.','Ver toda la biblioteca':'View the full library','Volver a cargar':'Reload','Actualizando resultados…':'Updating results…',
  'No hay resultados con estos filtros':'No results match these filters','Tu biblioteca empieza aquí':'Your library starts here',
  'Los resultados aparecerán al terminar una extracción. Puedes seguir en esta sección mientras se procesa.':'Results will appear when extraction finishes. You can stay here while it runs.',
  '· Incorporado el':'· Added on','Abrir vídeo original':'Open original video','(nueva pestaña)':'(new tab)','Sin resultado válido':'No valid result',
  'El último intento falló.':'The latest attempt failed.','Se conserva el resultado válido anterior.':'The previous valid result is preserved.',
  'Extracción:':'Extracted:','· Ejecución':'· Run','Ejecución':'Run','Aceptado · Ejecución':'Accepted · Run','Aceptado':'Accepted','Por revisar':'To review',
  'Motivos y advertencias ·':'Reasons and warnings ·','recuperados':'recovered','de':'of','pendientes de recuperar':'missing',
  'Aceptar extracción':'Accept extraction','Marcar para revisar':'Mark for review','Restablecer revisión automática':'Reset automatic review','Descargar JSON original':'Download original JSON',
  'No hay ítems en esta extracción.':'No items in this extraction.','Advertencias y cobertura':'Warnings and coverage','Historial':'History','Reprocesar exhaustivo':'Reprocess exhaustively',
  'Historial de extracciones':'Extraction history','Cerrar historial':'Close history','Cargando historial…':'Loading history…','Descargar JSON de esta ejecución':'Download JSON for this run',
  'Resultado de esta ejecución':'Result for this run','Sin ítems disponibles.':'No items available.','Ver evidencia ·':'View evidence ·','Este ítem no tiene evidencia asociada.':'This item has no associated evidence.',
  'Ver campos extraídos':'View extracted fields','Lugar':'Place','Herramienta':'Tool','Recomendación':'Recommendation','Paso':'Step','Opción de viaje':'Travel option','Producto':'Product','Otro':'Other',
  'Sin tarea':'No task','Pendiente':'Pending','En curso':'In progress','Completado':'Completed','Retirado':'Removed','Parcial':'Partial',
  'Preparando extracción':'Preparing extraction','Leyendo descripción':'Reading description','Transcribiendo audio':'Transcribing audio','Texto en pantalla':'On-screen text','Validando resultados':'Validating results','Guardando resultado':'Saving result',
  'Esperando el primer paso del extractor':'Waiting for the first extraction step','Descripción del autor':'Author description','Transcripción':'Transcript',
  'No se pudo completar la acción':'The action could not be completed','No se pudo completar la acción. Vuelve a intentarlo.':'The action could not be completed. Try again.',
  'No se pudo conectar. Comprueba que Savedex sigue abierto.':'Could not connect. Check that Savedex is still running.','No se pudo añadir el vídeo':'Could not add the video',
  'Los resultados se están actualizando. Vuelve a cargar.':'Results are being updated. Reload to try again.','No se pudo cargar la Biblioteca':'Could not load the library',
  'El historial cambió. Vuelve a abrirlo.':'History has changed. Open it again.','No se pudo cargar el historial':'Could not load history',
  'Vídeo pendiente al final de la cola.':'Video added to the end of the queue.','Vídeo pendiente al final de la cola. Inicia la cola en Procesado.':'Video added to the end of the queue. Start the queue in Processing.',
  'URL no admitida':'Unsupported URL','Solicitud no válida':'Invalid request','No se encontró el recurso':'Resource not found','La cola requiere revisión del backend antes de continuar':'The queue requires attention before it can continue',
  'No se pudo completar la operación. Revisa el backend e inténtalo de nuevo.':'The operation could not be completed. Check the server and try again.',
  'Extracción parcial':'Partial extraction','Marcada para revisión manual':'Marked for manual review',
  'El vídeo supera el límite de 5 minutos. Usa un vídeo de 5 minutos o menos; el modo exhaustivo mantiene este límite.':'The video exceeds the 5-minute limit. Use a video of 5 minutes or less; exhaustive mode has the same limit.',
  'Vídeos guardados y elementos extraídos.':'Saved videos and extracted items.',
  'Ver detalles':'View details','Ocultar detalles':'Hide details','Faltantes sin cuantificar':'Missing count unknown','Último intento fallido':'Latest attempt failed',
  'Filtros':'Filters','Mostrar filtros':'Show filters','Ocultar filtros':'Hide filters','Resultados de biblioteca':'Library results',
  'Metadatos de la plataforma':'Platform metadata','Observación visual':'Visual observation',
  'Se agotó el tiempo de procesamiento':'Processing timed out','El proceso no pudo completar la extracción':'The process could not complete extraction','El extractor devolvió una respuesta no válida':'The extractor returned an invalid response',
  'El contenido supera el límite de tamaño admitido por el extractor.':'The content exceeds the size limit supported by the extractor.',
  'No se pudieron leer fotogramas del vídeo para reconocer su texto.':'Video frames could not be read to recognize their text.',
  'El extractor no pudo validar que los datos extraídos estuvieran respaldados por las fuentes del vídeo.':'The extractor could not validate the extracted data against the video sources.',
};
export function translate(value: unknown, language: Language): string {
  const text = value == null ? '' : String(value);
  if (language === 'es') return text;
  const trimmed = text.trim();
  const localized = modernEnglish[trimmed] ?? english[trimmed];
  if (localized) return text.replace(trimmed, localized);
  const process = /^Procesar (\d+) (vídeo|vídeos)$/.exec(trimmed);
  if (process) return `Process ${process[1]} ${process[2] === 'vídeo' ? 'video' : 'videos'}`;
  const age = /^hace (\d+) (min|h|días)$/.exec(trimmed);
  if (age) return `${age[1]} ${age[2] === 'días' ? 'days' : age[2]} ago`;
  const valid = /^✓ (\d+) válidos$/.exec(trimmed);
  if (valid) return `✓ ${valid[1]} valid`;
  const count = /^· (\d+) (repetidos|no válidos)$/.exec(trimmed);
  if (count) return `· ${count[1]} ${count[2] === 'repetidos' ? 'duplicates' : 'invalid'}`;
  const added = /^(\d+) vídeos añadidos a la cola$/.exec(trimmed);
  if (added) return `${added[1]} videos added to the queue`;
  const places = /^(\d+) lugares · (.+)$/.exec(trimmed);
  if (places) return `${places[1]} places · ${translate(places[2], language)}`;
  for (const [prefix,translation] of [['Guardar: ','Save: '],['Quitar de guardados: ','Unsave: '],['Guardado: ','Saved: '],['Quitado de guardados: ','Unsaved: '],['Ver ','View '],['Ubicación sin confirmar · ','Unconfirmed location · ']] as const) {
    if (text.startsWith(prefix)) return translation + text.slice(prefix.length);
  }
  if (english[text]) return english[text];
  const pending = /^(\d+) vídeos pendientes$/.exec(text);
  if (pending) return `${pending[1]} videos pending`;
  const missing = /^(\d+) elementos pendientes en (.+)$/.exec(text);
  if (missing) return `${missing[1]} missing items in ${missing[2]}`;
  return text;
}
export function translateReviewReason(reason: {code: string; message: string}, language: Language): string {
  return ['partial','incomplete_collection','manual'].includes(reason.code) ? translate(reason.message,language) : reason.message;
}
