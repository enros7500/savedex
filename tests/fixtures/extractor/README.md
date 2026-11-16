Fixtures sintéticos: success/partial/error proceden de examples/ del extractor (licencia MIT, copia en packages/contracts/schemas/EXTRACTOR-LICENSE). URLs y autores son ficticios. No representan extracciones reales realizadas por Savedex.

empty-success es un resultado sintético válido sin ítems, derivado de la plantilla de error con cobertura suficiente, sin issues y con status success. request envía output_language=es explícitamente. repeated-omitted es una traza construida según progress.py/cli.py/worker.py; OCR se repite y transcription no se observa. La ausencia de un evento no permite deducir que su fase esté omitida.

El CLI real valida los cuatro resultados estructural y semánticamente mediante scripts/verify-extractor.py. summary comprueba los códigos 0/2/65 sobre resultados guardados; no es una extracción de medios. extract se invoca separadamente con una solicitud inválida controlada (64), sin modelos ni red de plataformas.
