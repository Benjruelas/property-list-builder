/**
 * MapLibre defaults to blob: workers, which strict CSP blocks even when
 * worker-src is set (Chrome can still fall back to script-src). Load the
 * CSP worker from a same-origin URL instead.
 */
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url'

setWorkerUrl(workerUrl)
