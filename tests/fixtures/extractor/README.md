# Synthetic extractor fixtures

`success`, `partial` and `error` come from the extractor's `examples/` directory (MIT license; a copy is stored at `packages/contracts/schemas/EXTRACTOR-LICENSE`). URLs and authors are fictional. These fixtures do not represent real extractions performed by SaveDex.

`empty-success` is a valid synthetic result with no items, derived from the error template with sufficient coverage, no issues and `status: success`. `request` explicitly sets `output_language=es` to exercise Spanish output. `repeated-omitted` is a trace constructed from `progress.py`, `cli.py` and `worker.py`; OCR repeats and transcription is not observed. A missing event does not establish that its phase was skipped.

The real CLI validates all four results structurally and semantically through `scripts/verify-extractor.py`. `summary` checks exit codes 0/2/65 against saved results; it does not extract media. `extract` is invoked separately with a controlled invalid request (exit code 64), without models or platform network access.
