export type MonitoringRange = '24h' | '3d' | '7d' | '30d' | '90d'
export type MonitoringEnvironment = 'production' | 'non-production'

export type LansonAudioLaneStatus = 'healthy' | 'degraded' | 'down' | 'idle'

/**
 * 一条业务链路的健康判定（HTTP 分段 / 实时 WS / 离线 / 切片 / 语言探测 / 分类）。
 * idle = 窗口内无流量，不代表故障；latestSuccessAt 是其健康证据。
 */
export interface LansonAudioLaneHealth {
  id: string
  name: string
  status: LansonAudioLaneStatus
  /** 窗口内请求 / 任务 / 会话数（0 = 空闲） */
  count: number
  success: number
  errors: number
  p95Ms: number | null
  latestSuccessAt: string | null
  /** 链路专属补充说明（如离线"完成 3 / 失败 0"） */
  meta: string[]
}

/** 上游 ASR worker 的窗口内调用分布（transcription.finished by worker_id）。 */
export interface LansonAudioUpstreamWorker {
  workerId: string
  finished: number
  audioSeconds: number
  latestAt: string | null
}

export interface LansonAudioMonitoringResponse {
  meta: {
    sceneId: 'lanson-audio-gateway'
    generatedAt: string
    range: MonitoringRange
    environment: string
  }
  summary: {
    requests: number
    successRatePct: number
    clientErrors: number
    serverErrors: number
    p50HttpMs: number | null
    p75HttpMs: number | null
    p95HttpMs: number | null
    sessions: number
    audioSeconds: number
    /** gateway.transcription.finished 总数（HTTP 分段 + WS utterance，一次转录一条）。 */
    transcriptions: number
    /** 其中携带 audio_seconds > 0 的条数（计量覆盖率分子）。 */
    meteredTranscriptions: number
    p50SessionMs: number | null
    p75SessionMs: number | null
    p95SessionMs: number | null
    droppedAudioFrames: number
    abnormalCloses: number
    upstreamConnectionFailures: number
    readinessFailures: number
    offlineJobs: number
    offlineErrors: number
    probeCyclesWithDown: number
    backpressureEvents: number
  }
  series: {
    requestTimeline: Array<{
      ts: string
      requests: number
      success: number
      serverErrors: number
      p95HttpMs: number | null
    }>
  }
  /** 按业务链路拆分的健康判定（链路健康卡片数据源）。 */
  lanes: LansonAudioLaneHealth[]
  /** 上游 ASR 池 per-worker 调用分布。 */
  upstreamWorkers: LansonAudioUpstreamWorker[]
  incidents: Array<Record<string, unknown>>
  freshness: {
    latestEventAt: string | null
    isStale: boolean
    staleAfterMinutes: number
  }
  queryHealth: {
    total: number
    succeeded: number
    failed: number
    degraded: boolean
    errors?: Record<string, string>
  }
}
