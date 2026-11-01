<script setup lang="ts">
import type { LansonAudioLaneStatus, LansonAudioMonitoringResponse } from '~/types/monitoring/lanson-audio'
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Mail,
  Radio,
  RefreshCw,
  Rss,
  ShieldCheck,
  Waves,
  Webhook,
  Wifi,
  XCircle,
} from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/registry/new-york-v4/ui/badge'
import { Button } from '@/registry/new-york-v4/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/registry/new-york-v4/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/registry/new-york-v4/ui/dialog'
import { Input } from '@/registry/new-york-v4/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/registry/new-york-v4/ui/tabs'

const title = 'Service Status'
const description
  = 'Real-time operational health, availability SLOs, and latency telemetry for Lanson Audio APIs.'

useSeoMeta({
  title,
  description,
  ogTitle: `${title} - LansonAI Docs`,
  ogDescription: description,
  twitterCard: 'summary_large_image',
})

const currentLang = ref<'en' | 'zh'>('en')

const data = ref<LansonAudioMonitoringResponse | null>(null)
const loading = ref(true)
const isRefetching = ref(false)
const errorMsg = ref<string | null>(null)
const lastUpdated = ref<Date>(new Date())

// Collapsible sections
const isMetricsOpen = ref(true)
const isIncidentsOpen = ref(true)

// Auto-refresh timer (30s)
const REFRESH_INTERVAL_SEC = 30
const secondsRemaining = ref(REFRESH_INTERVAL_SEC)
let timer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  if (timer)
    clearInterval(timer)
  secondsRemaining.value = REFRESH_INTERVAL_SEC
  timer = setInterval(() => {
    secondsRemaining.value--
    if (secondsRemaining.value <= 0) {
      fetchStatus(false)
      secondsRemaining.value = REFRESH_INTERVAL_SEC
    }
  }, 1000)
}

async function fetchStatus(isInitial = false) {
  if (isInitial)
    loading.value = true
  else isRefetching.value = true
  errorMsg.value = null

  try {
    const res = await $fetch<LansonAudioMonitoringResponse>('/api/monitoring/lanson-audio/overview', {
      query: {
        environment: 'production',
        range: '24h',
      },
    })
    data.value = res
    lastUpdated.value = new Date()
  }
  catch (err: any) {
    errorMsg.value = err?.message || 'Failed to retrieve status'
  }
  finally {
    loading.value = false
    isRefetching.value = false
  }
}

onMounted(() => {
  fetchStatus(true)
  startCountdown()
})

onUnmounted(() => {
  if (timer)
    clearInterval(timer)
})

// Summary metrics
const summary = computed(() => data.value?.summary ?? {
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
})

const serverAvailabilityPct = computed<number | null>(() => {
  const s = data.value?.summary
  if (!s)
    return null
  if (!s.requests)
    return 100.0
  const serverErrorRate = (s.serverErrors / s.requests) * 100
  return Math.max(0, Math.min(100, +(100 - serverErrorRate).toFixed(2)))
})

const availabilityLabel = computed(() =>
  serverAvailabilityPct.value === null ? '—' : `${serverAvailabilityPct.value.toFixed(2)}%`,
)

// Overall System Status evaluation
const overallStatus = computed<'operational' | 'degraded' | 'down' | 'unknown'>(() => {
  if (!data.value)
    return 'unknown'
  const s = summary.value
  const avail = serverAvailabilityPct.value ?? 100
  if (s.serverErrors > 50 || s.upstreamConnectionFailures > 10 || avail < 90) {
    return 'down'
  }
  if (s.serverErrors > 5 || s.upstreamConnectionFailures > 0 || s.readinessFailures > 0 || avail < 99) {
    return 'degraded'
  }
  return 'operational'
})

const statusConfig = computed(() => {
  const isEn = currentLang.value === 'en'
  switch (overallStatus.value) {
    case 'degraded':
      return {
        title: isEn ? 'Degraded Performance' : '部分服务性能降级',
        subtitle: isEn
          ? 'Elevated response latency observed on voice intelligence processing.'
          : '语音智能处理节点出现响应延迟上升。',
        badge: isEn ? 'Degraded' : '性能降级',
        border: 'border-amber-500/25 dark:border-amber-500/20',
        bg: 'bg-amber-500/[0.04] dark:bg-amber-500/[0.08]',
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
        icon: AlertTriangle,
      }
    case 'down':
      return {
        title: isEn ? 'Major Service Outage' : '核心服务异常中断',
        subtitle: isEn
          ? 'Engineers are actively investigating connection interruptions.'
          : '工程师正在紧急排查服务连接中断。',
        badge: isEn ? 'Major Outage' : '服务异常',
        border: 'border-rose-500/25 dark:border-rose-500/20',
        bg: 'bg-rose-500/[0.04] dark:bg-rose-500/[0.08]',
        text: 'text-rose-600 dark:text-rose-400',
        dot: 'bg-rose-500',
        icon: XCircle,
      }
    case 'unknown':
      return {
        title: isEn ? 'Status Unavailable' : '状态暂不可用',
        subtitle: isEn
          ? 'Live status telemetry is not available right now.'
          : '当前无法获取实时状态遥测数据。',
        badge: isEn ? 'Unknown' : '未知',
        border: 'border-border',
        bg: 'bg-muted/30',
        text: 'text-muted-foreground',
        dot: 'bg-muted-foreground',
        icon: AlertTriangle,
      }
    default:
      return {
        title: isEn ? 'All Systems Operational' : '所有系统运行正常',
        subtitle: isEn
          ? 'Lanson Audio is operating normally across realtime streaming and voice intelligence services.'
          : 'Lanson Audio 实时流式传输与语音智能服务目前均运行正常。',
        badge: isEn ? 'Operational' : '正常运行',
        border: 'border-emerald-500/25 dark:border-emerald-500/20',
        bg: 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]',
        text: 'text-emerald-600 dark:text-emerald-400',
        dot: 'bg-emerald-500',
        icon: CheckCircle2,
      }
  }
})

// Real lane health from the monitoring API (no synthesized history).
const LANE_STATUS_META: Record<LansonAudioLaneStatus, { en: string, zh: string, badge: string, dot: string }> = {
  healthy: {
    en: 'Healthy',
    zh: '正常',
    badge: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  degraded: {
    en: 'Degraded',
    zh: '降级',
    badge: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  down: {
    en: 'Down',
    zh: '异常',
    badge: 'border-rose-500/30 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  idle: {
    en: 'Idle',
    zh: '空闲',
    badge: 'border-border bg-muted/40 text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
}

function laneStatusMeta(status: LansonAudioLaneStatus) {
  return LANE_STATUS_META[status] ?? LANE_STATUS_META.idle
}

const laneRows = computed(() => (data.value?.lanes ?? []).map(lane => ({
  ...lane,
  statusMeta: laneStatusMeta(lane.status),
})))

const freshness = computed(() => data.value?.freshness ?? null)
const queryHealth = computed(() => data.value?.queryHealth ?? null)

function formatCount(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(currentLang.value === 'en' ? 'en-US' : 'zh-CN')
}

function formatAudioSeconds(seconds: number): string {
  if (!seconds || seconds <= 0)
    return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0)
    return `${hours}h ${minutes}m`
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function normalizeClientTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && !/^\d+$/.test(value))
    return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return null
  const ms = numeric > 1e15 ? numeric / 1e6 : numeric
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatRelativeTime(value: string | null): string {
  if (!value)
    return currentLang.value === 'en' ? 'no data' : '暂无数据'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts))
    return value
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 60)
    return currentLang.value === 'en' ? `${diffSec}s ago` : `${diffSec} 秒前`
  if (diffSec < 3600)
    return currentLang.value === 'en' ? `${Math.round(diffSec / 60)}m ago` : `${Math.round(diffSec / 60)} 分钟前`
  if (diffSec < 86400)
    return currentLang.value === 'en' ? `${Math.round(diffSec / 3600)}h ago` : `${Math.round(diffSec / 3600)} 小时前`
  return currentLang.value === 'en' ? `${Math.round(diffSec / 86400)}d ago` : `${Math.round(diffSec / 86400)} 天前`
}

// Subscribe Dialog State
const isSubscribeOpen = ref(false)
const subscribeEmail = ref('')
const subscribeWebhook = ref('')
const subscribeTab = ref<'email' | 'webhook' | 'rss'>('email')

function handleSubscribe() {
  if (subscribeTab.value === 'email' && !subscribeEmail.value) {
    toast.warning(currentLang.value === 'en' ? 'Please enter a valid email' : '请输入订阅邮箱')
    return
  }
  toast.success(
    currentLang.value === 'en' ? 'Subscribed successfully' : '状态订阅成功',
    {
      description: currentLang.value === 'en'
        ? 'You will be notified whenever status changes or maintenance occurs.'
        : '当服务发生状态波动或维护时，您将收到通知。',
    },
  )
  isSubscribeOpen.value = false
  subscribeEmail.value = ''
}

// Client live ping tester
const isPinging = ref(false)
const pingResult = ref<{ latencyMs: number, status: number } | null>(null)

async function runLiveClientPing() {
  isPinging.value = true
  pingResult.value = null
  const start = performance.now()
  try {
    const res = await fetch('/api/monitoring/lanson-audio/overview?range=24h', { method: 'GET' })
    const end = performance.now()
    pingResult.value = {
      latencyMs: Math.round(end - start),
      status: res.status,
    }
  }
  catch {
    pingResult.value = { latencyMs: 999, status: 500 }
  }
  finally {
    isPinging.value = false
  }
}

const formattedLastUpdated = computed(() => {
  return lastUpdated.value.toLocaleTimeString(currentLang.value === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
})

// Real incidents from the monitoring API (rolling window).
const INCIDENT_LABELS: Record<string, { en: string, zh: string }> = {
  'gateway.request.failed': { en: 'Request failed', zh: '请求失败' },
  'gateway.session.backpressure_detected': { en: 'Session backpressure', zh: '会话背压' },
  'gateway.readiness.degraded': { en: 'Readiness degraded', zh: '就绪检查降级' },
  'gateway.readiness.checked': { en: 'Readiness check failed', zh: '就绪检查未通过' },
  'gateway.session.closed': { en: 'Abnormal session close', zh: '会话异常关闭' },
}

function incidentLabel(eventName: string): string {
  const entry = INCIDENT_LABELS[eventName]
  if (!entry)
    return eventName
  return currentLang.value === 'en' ? entry.en : entry.zh
}

const incidents = computed(() => (data.value?.incidents ?? []).map((row, index) => {
  const eventName = String(row.event_name ?? '')
  const time = normalizeClientTimestamp(row._time)
  return {
    id: `${String(row.request_id ?? row.session_id ?? eventName)}-${index}`,
    label: incidentLabel(eventName),
    eventName,
    timeLabel: formatRelativeTime(time),
    reason: String(row.reason ?? row.error_message ?? ''),
    status: Number(row.status ?? 0),
    upstreamStatus: Number(row.upstream_status ?? 0),
  }
}))
</script>

<template>
  <div class="flex flex-1 flex-col">
    <PageHeader class="md:**:[.container]:pb-8 lg:**:[.container]:pb-12">
      <div class="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-mono text-muted-foreground">
        <span class="relative flex size-2 items-center justify-center">
          <span class="absolute size-2 rounded-full animate-ping opacity-75" :class="statusConfig.dot" />
          <span class="size-1.5 rounded-full" :class="statusConfig.dot" />
        </span>
        <span>{{ statusConfig.badge }} · {{ availabilityLabel }} {{ currentLang === 'en' ? 'Availability' : '可用率' }}</span>
      </div>
      <PageHeaderHeading class="max-w-4xl">
        {{ currentLang === 'en' ? 'Lanson Audio Status' : 'Lanson Audio 服务状态' }}
      </PageHeaderHeading>
      <PageHeaderDescription>
        {{ currentLang === 'en'
          ? 'Real-time operational health, availability SLOs, and latency telemetry for Lanson Audio APIs.'
          : 'Lanson Audio 实时流式语音、核心引擎与多语言智能服务的健康状态与延迟遥测。'
        }}
      </PageHeaderDescription>
      <PageActions>
        <!-- Subscribe Modal -->
        <Dialog v-model:open="isSubscribeOpen">
          <DialogTrigger as-child>
            <Button size="sm" class="h-[1.9375rem] rounded-lg gap-1.5">
              <Bell class="size-3.5" />
              <span>{{ currentLang === 'en' ? 'Subscribe to updates' : '订阅状态通知' }}</span>
            </Button>
          </DialogTrigger>
          <DialogContent class="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle class="flex items-center gap-2 text-base">
                <Bell class="size-4 text-primary" />
                {{ currentLang === 'en' ? 'Subscribe to Status Updates' : '订阅 Lanson Audio 状态通知' }}
              </DialogTitle>
              <DialogDescription class="text-xs">
                {{ currentLang === 'en'
                  ? 'Get notified immediately whenever major incident updates or scheduled maintenance occur.'
                  : '在服务发生重大变更、维护或异常波动时，实时获取状态推送。'
                }}
              </DialogDescription>
            </DialogHeader>

            <Tabs v-model="subscribeTab" class="w-full pt-1">
              <TabsList class="grid grid-cols-3 w-full h-8 bg-muted/60 text-xs">
                <TabsTrigger value="email" class="text-xs gap-1">
                  <Mail class="size-3" /> Email
                </TabsTrigger>
                <TabsTrigger value="webhook" class="text-xs gap-1">
                  <Webhook class="size-3" /> Webhook
                </TabsTrigger>
                <TabsTrigger value="rss" class="text-xs gap-1">
                  <Rss class="size-3" /> RSS
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" class="space-y-3 pt-3 text-xs">
                <div class="space-y-1.5">
                  <label class="font-medium text-foreground">{{ currentLang === 'en' ? 'Email Address' : '邮箱地址' }}</label>
                  <Input v-model="subscribeEmail" type="email" placeholder="you@company.com" class="h-9 text-xs" />
                </div>
                <p class="text-[11px] text-muted-foreground">
                  {{ currentLang === 'en' ? 'We only send critical status alerts. Unsubscribe at any time.' : '仅在发生服务异常或维护时发送通知，可随时退订。' }}
                </p>
              </TabsContent>

              <TabsContent value="webhook" class="space-y-3 pt-3 text-xs">
                <div class="space-y-1.5">
                  <label class="font-medium text-foreground">Webhook Endpoint</label>
                  <Input v-model="subscribeWebhook" placeholder="https://api.yourdomain.com/status-webhook" class="h-9 text-xs font-mono" />
                </div>
                <p class="text-[11px] text-muted-foreground">
                  {{ currentLang === 'en' ? 'Standard JSON payload will be posted on state transitions.' : '事件发生时将推送标准 JSON 状态变更数据。' }}
                </p>
              </TabsContent>

              <TabsContent value="rss" class="space-y-3 pt-3 text-xs">
                <div class="rounded-lg border bg-muted/30 p-3 font-mono text-xs space-y-1">
                  <span class="text-muted-foreground">Status JSON Feed:</span>
                  <p class="text-primary font-semibold select-all break-all">
                    https://docs.lansonai.com/api/monitoring/lanson-audio/overview
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" size="sm" @click="isSubscribeOpen = false">
                {{ currentLang === 'en' ? 'Cancel' : '取消' }}
              </Button>
              <Button size="sm" class="font-semibold" @click="handleSubscribe">
                {{ currentLang === 'en' ? 'Subscribe' : '确认订阅' }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          class="h-[1.9375rem] rounded-lg gap-1.5"
          :disabled="isRefetching"
          @click="fetchStatus(false)"
        >
          <RefreshCw class="size-3.5" :class="isRefetching ? 'animate-spin' : ''" />
          <span>{{ currentLang === 'en' ? 'Refresh' : '刷新' }}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-[1.9375rem] rounded-lg font-mono text-xs text-muted-foreground hover:text-foreground"
          @click="currentLang = currentLang === 'en' ? 'zh' : 'en'"
        >
          {{ currentLang === 'en' ? '中文' : 'EN' }}
        </Button>
      </PageActions>
    </PageHeader>

    <div class="container-wrapper flex-1">
      <div class="container max-w-5xl py-8 lg:py-10 space-y-8 sm:space-y-10">
        <!-- Error Banner -->
        <Card v-if="errorMsg" class="py-4 px-5 border-rose-500/30 bg-rose-500/[0.04]">
          <div class="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertTriangle class="size-4 shrink-0" />
            <span>{{ currentLang === 'en' ? 'Failed to load live status' : '加载实时状态失败' }}: {{ errorMsg }}</span>
          </div>
        </Card>

        <!-- 1. Hero Status Banner -->
        <Card
          class="py-5 px-5 sm:px-6 transition-colors"
          :class="[statusConfig.border, statusConfig.bg]"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-start sm:items-center gap-3.5 min-w-0">
              <div class="relative flex size-4 items-center justify-center shrink-0 mt-1 sm:mt-0">
                <span
                  class="absolute size-3.5 rounded-full animate-ping opacity-75"
                  :class="statusConfig.dot"
                />
                <span
                  class="size-2.5 rounded-full transition-colors duration-300"
                  :class="statusConfig.dot"
                />
              </div>

              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                    {{ statusConfig.title }}
                  </h2>
                  <Badge variant="outline" class="font-mono text-[11px]" :class="[statusConfig.border, statusConfig.text]">
                    {{ statusConfig.badge }}
                  </Badge>
                </div>
                <p class="text-xs sm:text-sm text-muted-foreground">
                  {{ statusConfig.subtitle }}
                </p>
              </div>
            </div>

            <div class="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-border/40 pt-3 sm:pt-0">
              <div class="text-xs sm:text-sm font-mono font-semibold text-foreground">
                {{ availabilityLabel }} {{ currentLang === 'en' ? 'Availability' : '可用率' }}
              </div>
              <p class="text-xs text-muted-foreground font-mono">
                {{ currentLang === 'en' ? `Updated ${formattedLastUpdated}` : `更新于 ${formattedLastUpdated}` }}
              </p>
            </div>
          </div>
        </Card>

        <!-- 2. Service Overview (4 Capability Pillar Cards) -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold tracking-tight">
                {{ currentLang === 'en' ? 'Service Overview' : '服务概览' }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ currentLang === 'en' ? 'Real-time gateway SLI and core engine metrics.' : '实时音频网关 SLI 与核心引擎运行指标。' }}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="text-xs text-muted-foreground hover:text-foreground font-mono gap-1 h-7 px-2"
              @click="isMetricsOpen = !isMetricsOpen"
            >
              <span>{{ isMetricsOpen ? (currentLang === 'en' ? 'Collapse' : '收起') : (currentLang === 'en' ? 'Expand' : '展开') }}</span>
              <ChevronDown class="size-3.5 transition-transform duration-200" :class="isMetricsOpen ? '' : '-rotate-90'" />
            </Button>
          </div>

          <div v-show="isMetricsOpen" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- 1. Platform Availability -->
            <Card class="py-4 gap-3 justify-between">
              <CardHeader class="px-5 pb-0">
                <div class="flex items-center justify-between text-muted-foreground text-xs">
                  <span class="font-medium">{{ currentLang === 'en' ? 'Platform Availability' : '平台可用率' }}</span>
                  <ShieldCheck class="size-4 text-emerald-500 shrink-0" />
                </div>
                <CardTitle class="text-2xl font-mono tracking-tight pt-1">
                  {{ availabilityLabel }}
                </CardTitle>
                <CardDescription class="text-xs font-mono">
                  {{ currentLang === 'en' ? 'Rolling 24h availability' : '24 小时服务可用率' }}
                </CardDescription>
              </CardHeader>
              <CardContent class="px-5 pt-0">
                <div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    :style="{ width: `${serverAvailabilityPct ?? 0}%` }"
                  />
                </div>
              </CardContent>
            </Card>

            <!-- 2. Realtime Latency -->
            <Card class="py-4 gap-3 justify-between">
              <CardHeader class="px-5 pb-0">
                <div class="flex items-center justify-between text-muted-foreground text-xs">
                  <span class="font-medium">{{ currentLang === 'en' ? 'Realtime Latency' : '实时处理延迟' }}</span>
                  <Activity class="size-4 text-primary shrink-0" />
                </div>
                <CardTitle class="text-2xl font-mono tracking-tight pt-1">
                  {{ (summary.p95HttpMs !== null && summary.p95HttpMs > 0) ? `${Math.round(summary.p95HttpMs)} ms` : '—' }}
                </CardTitle>
                <CardDescription class="text-xs font-mono">
                  {{ currentLang === 'en' ? 'P95 processing latency' : 'P95 实时音频处理延迟' }}
                </CardDescription>
              </CardHeader>
              <CardContent class="px-5 pt-0">
                <p v-if="!summary.p95HttpMs || summary.p95HttpMs <= 0" class="text-[11px] text-muted-foreground italic truncate">
                  {{ currentLang === 'en' ? 'Awaiting sufficient traffic data' : '等待足够流量样本数据' }}
                </p>
                <div v-else class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary rounded-full transition-all duration-500"
                    :style="{ width: `${Math.min(100, Math.max(10, (summary.p95HttpMs / 1000) * 100))}%` }"
                  />
                </div>
              </CardContent>
            </Card>

            <!-- 3. Transcriptions (24h) -->
            <Card class="py-4 gap-3 justify-between">
              <CardHeader class="px-5 pb-0">
                <div class="flex items-center justify-between text-muted-foreground text-xs">
                  <span class="font-medium">{{ currentLang === 'en' ? 'Transcriptions (24h)' : '转写次数 (24h)' }}</span>
                  <Radio class="size-4 text-primary shrink-0" />
                </div>
                <CardTitle class="text-2xl font-mono tracking-tight pt-1">
                  {{ formatCount(summary.transcriptions) }}
                </CardTitle>
                <CardDescription class="text-xs font-mono">
                  {{ currentLang === 'en' ? 'Rolling 24h gateway transcriptions' : '滚动 24 小时网关转写总量' }}
                </CardDescription>
              </CardHeader>
              <CardContent class="px-5 pt-0">
                <p class="text-[11px] text-muted-foreground italic truncate">
                  {{ currentLang === 'en' ? 'Metered' : '已计量' }}: {{ formatCount(summary.meteredTranscriptions) }}
                </p>
              </CardContent>
            </Card>

            <!-- 4. Audio Processed (24h) -->
            <Card class="py-4 gap-3 justify-between">
              <CardHeader class="px-5 pb-0">
                <div class="flex items-center justify-between text-muted-foreground text-xs">
                  <span class="font-medium">{{ currentLang === 'en' ? 'Audio Processed (24h)' : '处理音频时长 (24h)' }}</span>
                  <Waves class="size-4 text-primary shrink-0" />
                </div>
                <CardTitle class="text-2xl font-mono tracking-tight pt-1">
                  {{ formatAudioSeconds(summary.audioSeconds) }}
                </CardTitle>
                <CardDescription class="text-xs font-mono">
                  {{ currentLang === 'en' ? 'Rolling 24h transcribed audio' : '滚动 24 小时转写音频时长' }}
                </CardDescription>
              </CardHeader>
              <CardContent class="px-5 pt-0">
                <p class="text-[11px] text-muted-foreground italic truncate">
                  {{ currentLang === 'en' ? 'Sessions' : '会话数' }}: {{ formatCount(summary.sessions) }}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <!-- 3. Gateway Lane Health (real telemetry) -->
        <section class="space-y-6">
          <div class="space-y-1">
            <h2 class="text-lg font-semibold tracking-tight">
              {{ currentLang === 'en' ? 'Gateway Lanes' : '网关链路健康' }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ currentLang === 'en'
                ? 'Per-lane health derived from live gateway telemetry (rolling 24h).'
                : '基于实时网关遥测的链路健康（滚动 24 小时）。'
              }}
            </p>
          </div>

          <Card v-if="laneRows.length" class="py-0 gap-0 divide-y divide-border overflow-hidden">
            <div
              v-for="lane in laneRows"
              :key="lane.id"
              class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
            >
              <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                <span class="size-2 rounded-full shrink-0 mt-1.5 sm:mt-0" :class="lane.statusMeta.dot" />
                <div class="space-y-0.5 min-w-0">
                  <span class="font-medium text-sm text-foreground block">{{ lane.name }}</span>
                  <p class="text-xs text-muted-foreground font-mono">
                    {{ formatCount(lane.count) }} {{ currentLang === 'en' ? 'events' : '事件' }}
                    · {{ formatCount(lane.success) }} {{ currentLang === 'en' ? 'ok' : '成功' }}
                    · {{ formatCount(lane.errors) }} {{ currentLang === 'en' ? 'errors' : '错误' }}
                    <template v-if="lane.p95Ms !== null">
                      · P95 {{ Math.round(lane.p95Ms) }} ms
                    </template>
                  </p>
                  <p v-if="lane.meta.length" class="text-xs text-muted-foreground">
                    {{ lane.meta.join(' · ') }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end sm:gap-1">
                <Badge variant="outline" class="gap-1.5 font-mono text-xs" :class="lane.statusMeta.badge">
                  <span class="size-1.5 rounded-full" :class="lane.statusMeta.dot" />
                  <span>{{ currentLang === 'en' ? lane.statusMeta.en : lane.statusMeta.zh }}</span>
                </Badge>
                <span class="text-[11px] text-muted-foreground font-mono">
                  {{ currentLang === 'en' ? 'Last ok' : '最近成功' }}: {{ formatRelativeTime(lane.latestSuccessAt) }}
                </span>
              </div>
            </div>
          </Card>

          <p v-else class="text-sm text-muted-foreground italic">
            {{ currentLang === 'en' ? 'No lane telemetry in the selected window.' : '所选窗口内暂无链路遥测数据。' }}
          </p>
        </section>

        <!-- 4. Live Edge Latency Test -->
        <Card class="py-5 px-5 sm:px-6 gap-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Wifi class="size-4 text-primary" />
                <h3 class="font-semibold text-sm sm:text-base text-foreground">
                  {{ currentLang === 'en' ? 'Live Edge Latency Test' : '现场边缘网络时延测试' }}
                </h3>
              </div>
              <p class="text-xs sm:text-sm text-muted-foreground">
                {{ currentLang === 'en'
                  ? 'Measure real-time round-trip latency between your browser and the Lanson Audio edge network.'
                  : '测量您的当前设备与 Lanson Audio 边缘网络之间的实时握手时延。'
                }}
              </p>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <Badge
                v-if="pingResult"
                variant="secondary"
                class="font-mono text-xs px-2.5 py-1"
              >
                RTT: {{ pingResult.latencyMs }} ms
              </Badge>

              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs font-medium rounded-lg"
                :disabled="isPinging"
                @click="runLiveClientPing"
              >
                <RefreshCw v-if="isPinging" class="size-3.5 animate-spin mr-1" />
                <span>{{ isPinging ? (currentLang === 'en' ? 'Testing...' : '测速中...') : (currentLang === 'en' ? 'Test Latency' : '测速') }}</span>
              </Button>
            </div>
          </div>

          <p class="text-xs text-muted-foreground border-t pt-3">
            {{ currentLang === 'en'
              ? 'Network RTT measures edge connectivity only and does not include speech recognition model inference time.'
              : '网络握手延迟仅反映边缘网络连通质量，不包含语音识别模型的端到端推理耗时。'
            }}
          </p>
        </Card>

        <!-- 5. Recent Incidents (real events) -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold tracking-tight">
                {{ currentLang === 'en' ? 'Recent Incidents' : '近期异常事件' }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ currentLang === 'en'
                  ? 'Failed requests, backpressure, readiness failures and abnormal session closes (rolling 24h).'
                  : '失败请求、背压、就绪失败与会话异常关闭（滚动 24 小时）。'
                }}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="text-xs text-muted-foreground hover:text-foreground font-mono gap-1 h-7 px-2"
              @click="isIncidentsOpen = !isIncidentsOpen"
            >
              <span>{{ isIncidentsOpen ? (currentLang === 'en' ? 'Collapse' : '收起') : (currentLang === 'en' ? 'Expand' : '展开') }}</span>
              <ChevronDown class="size-3.5 transition-transform duration-200" :class="isIncidentsOpen ? '' : '-rotate-90'" />
            </Button>
          </div>

          <div v-show="isIncidentsOpen" class="space-y-3">
            <Card
              v-for="incident in incidents"
              :key="incident.id"
              class="py-4 px-5 gap-2 hover:shadow-sm"
            >
              <div class="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
                <h4 class="font-semibold text-sm text-foreground truncate">
                  {{ incident.label }}
                </h4>
                <span class="text-[11px] font-mono text-muted-foreground shrink-0">
                  {{ incident.timeLabel }}
                </span>
              </div>

              <div class="text-xs font-mono text-muted-foreground space-y-0.5 pt-0.5">
                <p>{{ incident.eventName }}</p>
                <p v-if="incident.status">
                  HTTP {{ incident.status }}<template v-if="incident.upstreamStatus">
                    · upstream {{ incident.upstreamStatus }}
                  </template>
                </p>
                <p v-if="incident.reason">
                  {{ incident.reason }}
                </p>
              </div>
            </Card>

            <p v-if="!incidents.length" class="text-sm text-muted-foreground italic">
              {{ currentLang === 'en' ? 'No incidents recorded in the selected window.' : '所选窗口内没有异常事件记录。' }}
            </p>
          </div>
        </section>

        <!-- 6. Status Footer Meta -->
        <div class="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div class="flex items-center gap-2 flex-wrap">
            <Waves class="size-4 text-primary" />
            <span class="font-medium text-foreground">Lanson Audio Gateway v1</span>
            <template v-if="freshness">
              <span>·</span>
              <span>{{ currentLang === 'en' ? 'Data' : '数据' }}: {{ formatRelativeTime(freshness.latestEventAt) }}</span>
              <Badge
                v-if="freshness.isStale"
                variant="outline"
                class="text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-400"
              >
                {{ currentLang === 'en' ? 'stale' : '数据滞后' }}
              </Badge>
            </template>
            <Badge
              v-if="queryHealth && queryHealth.degraded"
              variant="outline"
              class="text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-400"
            >
              {{ currentLang === 'en' ? 'partial data' : '部分数据缺失' }}
            </Badge>
          </div>

          <div class="flex items-center gap-4 font-mono">
            <a
              href="/api/monitoring/lanson-audio/overview?environment=production&range=24h"
              target="_blank"
              rel="noopener"
              class="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <span>Status API (JSON)</span>
              <ExternalLink class="size-3" />
            </a>
            <span>·</span>
            <NuxtLink to="/docs/production" class="hover:text-foreground transition-colors">
              {{ currentLang === 'en' ? 'Production Docs' : '生产环境文档' }}
            </NuxtLink>
            <span>·</span>
            <NuxtLink to="/docs/api-reference" class="hover:text-foreground transition-colors">
              {{ currentLang === 'en' ? 'API Reference' : 'API 参考' }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
