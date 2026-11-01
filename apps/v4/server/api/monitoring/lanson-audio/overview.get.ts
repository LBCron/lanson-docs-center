import type {
  LansonAudioLaneHealth,
  LansonAudioLaneStatus,
  LansonAudioMonitoringResponse,
  MonitoringEnvironment,
  MonitoringRange,
} from '~/types/monitoring/lanson-audio'
import { getQuery } from 'h3'
import {
  buildLansonAudioGatewayApls,
  executeAxiomApl,
  resolveLansonAudioStartTime,
} from '~/server/utils/lanson-audio-apl'

const CACHE_TTL_MS = 30_000
const STALE_AFTER_MINUTES = 10

interface CacheEntry {
  response: LansonAudioMonitoringResponse
  cachedAt: number
}
const cache = new Map<string, CacheEntry>()

const UPSTREAM_FALLBACK_BASES = [
  'http://127.0.0.1:41737',
  'https://c.lanson.dev',
  'https://control.lansonai.com',
]

function parseRange(raw: unknown): MonitoringRange {
  const value = String(raw ?? '24h')
  if (value === '24h' || value === '3d' || value === '7d' || value === '30d' || value === '90d')
    return value
  return '24h'
}

function parseEnvironment(raw: unknown): MonitoringEnvironment {
  const value = String(raw ?? 'production').trim().toLowerCase()
  if (value === 'non-production' || value === 'preview' || value === 'development')
    return 'non-production'
  return 'production'
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNum(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null
}

function isStaleEvent(eventAt: string | null): boolean {
  if (!eventAt)
    return true
  const eventTime = Date.parse(eventAt)
  return !Number.isFinite(eventTime) || Date.now() - eventTime > STALE_AFTER_MINUTES * 60_000
}

function normalizeAxiomTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && !/^\d+$/.test(value))
    return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return null
  const epochMilliseconds = numeric > 1e15 ? numeric / 1e6 : numeric
  const date = new Date(epochMilliseconds)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function laneStatus(count: number, success: number, errors: number): LansonAudioLaneStatus {
  if (count <= 0)
    return 'idle'
  if (success <= 0)
    return 'down'
  if (errors > 0 && errors / count > 0.01)
    return 'degraded'
  return 'healthy'
}

function buildLane(input: {
  id: string
  name: string
  count: number
  success: number
  errors: number
  p95Ms: number | null
  latestSuccessAt: string | null
  meta?: string[]
}): LansonAudioLaneHealth {
  return {
    id: input.id,
    name: input.name,
    status: laneStatus(input.count, input.success, input.errors),
    count: input.count,
    success: input.success,
    errors: input.errors,
    p95Ms: input.p95Ms,
    latestSuccessAt: input.latestSuccessAt,
    meta: input.meta ?? [],
  }
}

function emptyResponse(range: MonitoringRange, environment: string): LansonAudioMonitoringResponse {
  return {
    meta: { sceneId: 'lanson-audio-gateway', generatedAt: new Date().toISOString(), range, environment },
    summary: {
      requests: 0,
      successRatePct: 100,
      clientErrors: 0,
      serverErrors: 0,
      p50HttpMs: null,
      p75HttpMs: null,
      p95HttpMs: null,
      sessions: 0,
      audioSeconds: 0,
      transcriptions: 0,
      meteredTranscriptions: 0,
      p50SessionMs: null,
      p75SessionMs: null,
      p95SessionMs: null,
      droppedAudioFrames: 0,
      abnormalCloses: 0,
      upstreamConnectionFailures: 0,
      readinessFailures: 0,
      offlineJobs: 0,
      offlineErrors: 0,
      probeCyclesWithDown: 0,
      backpressureEvents: 0,
    },
    series: { requestTimeline: [] },
    lanes: [],
    upstreamWorkers: [],
    incidents: [],
    freshness: { latestEventAt: null, isStale: true, staleAfterMinutes: STALE_AFTER_MINUTES },
    queryHealth: { total: 0, succeeded: 0, failed: 0, degraded: false },
  }
}

async function fetchFromUpstream(
  environment: MonitoringEnvironment,
  range: MonitoringRange,
): Promise<LansonAudioMonitoringResponse | null> {
  const qs = `environment=${encodeURIComponent(environment)}&range=${encodeURIComponent(range)}`
  for (const base of UPSTREAM_FALLBACK_BASES) {
    try {
      const res = await fetch(`${base}/api/monitoring/lanson-audio/overview?${qs}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok)
        continue
      const text = await res.text()
      if (!text.trim().startsWith('{'))
        continue
      const parsed = JSON.parse(text) as LansonAudioMonitoringResponse
      if (parsed?.meta?.sceneId === 'lanson-audio-gateway') {
        return parsed
      }
    }
    catch {
      // try next upstream
    }
  }
  return null
}

export default defineEventHandler(async (event): Promise<LansonAudioMonitoringResponse> => {
  const rawQuery = getQuery(event)
  const range = parseRange(rawQuery.range)
  const environment = parseEnvironment(rawQuery.environment)
  const dataset = process.env.AXIOM_FLOW_MONITORING_DATASET || 'lanson_flow'
  const cacheKey = `${environment}:${range}:${dataset}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS)
    return cached.response

  const axiomToken = process.env.AXIOM_FLOW_MONITORING_ADMIN_TOKEN || process.env.AXIOM_ADMIN_TOKEN
  const axiomOrgId = process.env.AXIOM_FLOW_MONITORING_ORG_ID || process.env.AXIOM_ORG_ID

  // When Axiom credentials are not present in this process, proxy from the control plane API
  if (!axiomToken || !axiomOrgId) {
    const upstream = await fetchFromUpstream(environment, range)
    if (upstream) {
      cache.set(cacheKey, { response: upstream, cachedAt: Date.now() })
      return upstream
    }
    const fallback = emptyResponse(range, environment)
    fallback.queryHealth = {
      total: 0,
      succeeded: 0,
      failed: 0,
      degraded: true,
      errors: { axiom: 'axiom_credentials_not_configured' },
    }
    return fallback
  }

  const response = emptyResponse(range, environment)
  const apls = buildLansonAudioGatewayApls(environment, range, dataset)
  const options = {
    token: axiomToken,
    orgId: axiomOrgId,
    startTime: resolveLansonAudioStartTime(range),
    endTime: 'now',
  }
  const [requests, sessions, transcriptions, reliability, timeline, incidents, lanes, offline, upstreamWorkers] = await Promise.all([
    executeAxiomApl<Record<string, unknown>>(apls.requestSummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.sessionSummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.transcriptionSummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.reliabilitySummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.requestTimeline, options),
    executeAxiomApl<Record<string, unknown>>(apls.recentIncidents, options),
    executeAxiomApl<Record<string, unknown>>(apls.laneSummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.offlineLaneSummary, options),
    executeAxiomApl<Record<string, unknown>>(apls.upstreamWorkerSummary, options),
  ])

  const results = { requests, sessions, transcriptions, reliability, timeline, incidents, lanes, offline, upstreamWorkers }
  const errors = Object.fromEntries(
    Object.entries(results).flatMap(([name, result]) => result.error ? [[name, result.error]] : []),
  )
  const request = requests.rows[0] ?? {}
  const session = sessions.rows[0] ?? {}
  const transcription = transcriptions.rows[0] ?? {}
  const reliabilityRow = reliability.rows[0] ?? {}
  const totalRequests = num(request.requests)
  response.summary = {
    requests: totalRequests,
    successRatePct: totalRequests > 0 ? Math.round((num(request.success) / totalRequests) * 10_000) / 100 : 100,
    clientErrors: num(request.client_errors),
    serverErrors: num(request.server_errors),
    p50HttpMs: nullableNum(request.p50_http_ms),
    p75HttpMs: nullableNum(request.p75_http_ms),
    p95HttpMs: nullableNum(request.p95_http_ms),
    sessions: num(session.sessions),
    audioSeconds: Math.round(num(transcription.transcribed_seconds) * 100) / 100,
    transcriptions: num(transcription.transcriptions),
    meteredTranscriptions: num(transcription.metered),
    p50SessionMs: num(session.sessions) > 0 ? nullableNum(session.p50_session_ms) : null,
    p75SessionMs: num(session.sessions) > 0 ? nullableNum(session.p75_session_ms) : null,
    p95SessionMs: num(session.sessions) > 0 ? nullableNum(session.p95_session_ms) : null,
    droppedAudioFrames: num(session.dropped_audio_frames),
    abnormalCloses: num(session.abnormal_closes),
    upstreamConnectionFailures: num(reliabilityRow.upstream_connection_failures),
    readinessFailures: num(reliabilityRow.readiness_failures),
    offlineJobs: num(request.offline_jobs),
    offlineErrors: num(request.offline_errors),
    probeCyclesWithDown: num(reliabilityRow.probe_cycles_with_down),
    backpressureEvents: num(reliabilityRow.backpressure_events),
  }
  response.series.requestTimeline = timeline.rows.map(row => ({
    ts: String(row.ts ?? ''),
    requests: num(row.requests),
    success: num(row.success),
    serverErrors: num(row.server_errors),
    p95HttpMs: nullableNum(row.p95_http_ms),
  }))

  const laneByPath = new Map(lanes.rows.map(row => [String(row.path ?? ''), row]))
  const offlineRow = offline.rows[0] ?? {}
  const jobsPathRow = laneByPath.get('/v1/audio/transcriptions/jobs') ?? {}
  const segmentRow = laneByPath.get('/v1/audio/transcriptions') ?? {}
  const languageRow = laneByPath.get('/v1/audio/language-detection') ?? {}
  const classificationRow = laneByPath.get('/v1/audio/classification') ?? {}
  const sessionCount = num(session.sessions)
  const abnormalCloses = num(session.abnormal_closes)
  const jobsStarted = num(offlineRow.jobs_started)
  const jobsCompleted = num(offlineRow.jobs_completed)
  const jobsFailed = num(offlineRow.jobs_failed)
  const slicesStarted = num(offlineRow.slices_started)
  const slicesCompleted = num(offlineRow.slices_completed)
  const sliceRetries = num(offlineRow.slice_retries)
  const reliabilityDown = num(reliabilityRow.readiness_failures) > 0
  response.lanes = [
    buildLane({
      id: 'segment',
      name: 'HTTP 分段转录',
      count: num(segmentRow.requests),
      success: num(segmentRow.success),
      errors: num(segmentRow.client_errors) + num(segmentRow.server_errors),
      p95Ms: nullableNum(segmentRow.p95_ms),
      latestSuccessAt: normalizeAxiomTimestamp(segmentRow.latest_success_at),
      meta: [`转录 ${response.summary.transcriptions.toLocaleString('zh-CN')} 次`, `${response.summary.audioSeconds.toLocaleString('zh-CN')} s 音频`],
    }),
    buildLane({
      id: 'realtime-ws',
      name: '实时 WS 转录',
      count: sessionCount,
      success: sessionCount - abnormalCloses,
      errors: abnormalCloses,
      p95Ms: sessionCount > 0 ? nullableNum(session.p95_session_ms) : null,
      latestSuccessAt: sessionCount > 0 ? normalizeAxiomTimestamp(session.latest_session_at) : null,
      meta: [`背压 ${num(reliabilityRow.backpressure_events)} 次`],
    }),
    buildLane({
      id: 'offline',
      name: '离线批处理',
      count: jobsStarted,
      success: jobsCompleted,
      errors: jobsFailed,
      p95Ms: null,
      latestSuccessAt: normalizeAxiomTimestamp(offlineRow.latest_success_at),
      meta: [`提交入口 ${num(jobsPathRow.requests)} · 完成 ${jobsCompleted} / 失败 ${jobsFailed}`, `分块丢弃 ${num(offlineRow.chunks_dropped)}`],
    }),
    buildLane({
      id: 'slice',
      name: '切片服务',
      count: slicesStarted,
      success: slicesCompleted,
      errors: sliceRetries,
      p95Ms: null,
      latestSuccessAt: normalizeAxiomTimestamp(offlineRow.latest_success_at),
      meta: sliceRetries > 0 ? [`切分重试 ${sliceRetries}`] : [],
    }),
    buildLane({
      id: 'language-detection',
      name: '语言探测',
      count: num(languageRow.requests),
      success: num(languageRow.success),
      errors: num(languageRow.client_errors) + num(languageRow.server_errors),
      p95Ms: nullableNum(languageRow.p95_ms),
      latestSuccessAt: normalizeAxiomTimestamp(languageRow.latest_success_at),
    }),
    buildLane({
      id: 'classification',
      name: '音频分类',
      count: num(classificationRow.requests),
      success: num(classificationRow.success),
      errors: num(classificationRow.client_errors) + num(classificationRow.server_errors),
      p95Ms: nullableNum(classificationRow.p95_ms),
      latestSuccessAt: normalizeAxiomTimestamp(classificationRow.latest_success_at),
    }),
  ]
  if (reliabilityDown) {
    for (const lane of response.lanes) {
      if (lane.id === 'segment' && lane.status === 'healthy')
        lane.status = 'degraded'
    }
  }
  response.upstreamWorkers = upstreamWorkers.rows.map(row => ({
    workerId: String(row.worker_id ?? '') || '（治理前事件）',
    finished: num(row.finished),
    audioSeconds: Math.round(num(row.audio_seconds) * 100) / 100,
    latestAt: normalizeAxiomTimestamp(row.latest_at),
  }))
  response.incidents = incidents.rows
  const latestEventAt = normalizeAxiomTimestamp(request.latest_event_at)
    ?? normalizeAxiomTimestamp(response.series.requestTimeline.at(-1)?.ts)
  response.freshness = {
    latestEventAt,
    isStale: isStaleEvent(latestEventAt),
    staleAfterMinutes: STALE_AFTER_MINUTES,
  }
  response.queryHealth = {
    total: Object.keys(results).length,
    succeeded: Object.keys(results).length - Object.keys(errors).length,
    failed: Object.keys(errors).length,
    degraded: Object.keys(errors).length > 0,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  }
  cache.set(cacheKey, { response, cachedAt: Date.now() })
  return response
})
