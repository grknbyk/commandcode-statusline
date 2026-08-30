// statusline: a one-line footer (model, effort, context, cost, cache counts,
// git branch, usage windows, spending pace). /statusline on its own prints every setting.
//   /statusline <segment>        → toggle model effort context cost cache branch pace
//   /statusline hide|auto|all    → usage: off, the blocker or tightest window, or every window
//   /statusline usage-5h|-1w|-1m → toggle one usage window (only shown when usage=all)
//   /statusline price|percent    → usage-type: $9.34/$10.00 or 93%
//   /statusline on|off           → master switch
//   /statusline refresh          → refetch usage + branch
// Every change is saved to ~/.commandcode/statusline.state.json and reloaded at startup.

import type {ModApi} from '@commandcode/harness';
import {readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

interface CatalogModel {
    name: string;
    contextWindow: number;
    inputPer1M: number;
    outputPer1M: number;
    cacheReadPer1M: number;
    cacheWritePer1M?: number;
}

const MODELS: Record<string, CatalogModel> = {
    'deepseek/deepseek-v4-pro': {name: 'DeepSeek V4 Pro', contextWindow: 1_000_000, inputPer1M: 0.66, outputPer1M: 1.98, cacheReadPer1M: 0.022},
    'deepseek/deepseek-v4-flash': {name: 'DeepSeek V4 Flash', contextWindow: 1_000_000, inputPer1M: 0.22, outputPer1M: 0.66, cacheReadPer1M: 0.007},
    'deepseek/deepseek-v4-flash-vision-exp': {name: 'DeepSeek V4 Flash Vision', contextWindow: 1_000_000, inputPer1M: 0.22, outputPer1M: 0.66, cacheReadPer1M: 0.007},
    'moonshotai/Kimi-K3': {name: 'Kimi K3', contextWindow: 1_000_000, inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3},
    'moonshotai/Kimi-K2.7-Code': {name: 'Kimi K2.7 Code', contextWindow: 256_000, inputPer1M: 0.95, outputPer1M: 4, cacheReadPer1M: 0.19},
    'moonshotai/Kimi-K2.7-Code-Highspeed': {name: 'Kimi K2.7 Code HighSpeed', contextWindow: 262_000, inputPer1M: 1.9, outputPer1M: 8, cacheReadPer1M: 0.38},
    'moonshotai/Kimi-K2.6': {name: 'Kimi K2.6', contextWindow: 256_000, inputPer1M: 0.95, outputPer1M: 4, cacheReadPer1M: 0.16},
    'moonshotai/Kimi-K2.5': {name: 'Kimi K2.5', contextWindow: 256_000, inputPer1M: 0.6, outputPer1M: 3, cacheReadPer1M: 0.1},
    'z-ai/glm-5.3-flash': {name: 'GLM-5.3 Flash', contextWindow: 1_050_000, inputPer1M: 0.15, outputPer1M: 0.5, cacheReadPer1M: 0.03},
    'zai-org/GLM-5.3': {name: 'GLM-5.3', contextWindow: 1_000_000, inputPer1M: 1.4, outputPer1M: 4.4, cacheReadPer1M: 0.26},
    'zai-org/GLM-5.2': {name: 'GLM-5.2', contextWindow: 1_000_000, inputPer1M: 1.4, outputPer1M: 4.4, cacheReadPer1M: 0.26},
    'zai-org/GLM-5.2-Fast': {name: 'GLM-5.2 Fast', contextWindow: 1_000_000, inputPer1M: 3, outputPer1M: 10.25, cacheReadPer1M: 0.5},
    'zai-org/GLM-5.1': {name: 'GLM-5.1', contextWindow: 1_000_000, inputPer1M: 1.4, outputPer1M: 4.4, cacheReadPer1M: 0.26},
    'zai-org/GLM-5': {name: 'GLM-5', contextWindow: 200_000, inputPer1M: 1, outputPer1M: 3.2, cacheReadPer1M: 0.2},
    'MiniMaxAI/MiniMax-M3': {name: 'MiniMax M3', contextWindow: 1_000_000, inputPer1M: 0.3, outputPer1M: 1.2, cacheReadPer1M: 0.06},
    'MiniMaxAI/MiniMax-M2.7': {name: 'MiniMax M2.7', contextWindow: 1_000_000, inputPer1M: 0.3, outputPer1M: 1.2, cacheReadPer1M: 0.06},
    'minimax/minimax-m3-free': {name: 'MiniMax M3', contextWindow: 1_000_000, inputPer1M: 0, outputPer1M: 0, cacheReadPer1M: 0},
    'minimax/minimax-m2.7-free': {name: 'MiniMax M2.7', contextWindow: 197_000, inputPer1M: 0, outputPer1M: 0, cacheReadPer1M: 0},
    'MiniMaxAI/MiniMax-M2.5': {name: 'MiniMax M2.5', contextWindow: 200_000, inputPer1M: 0.3, outputPer1M: 1.2, cacheReadPer1M: 0.03},
    'xiaomi/mimo-v2.5-pro': {name: 'MiMo V2.5 Pro', contextWindow: 1_000_000, inputPer1M: 0.435, outputPer1M: 0.87, cacheReadPer1M: 0.0036},
    'xiaomi/mimo-v2.5': {name: 'MiMo V2.5', contextWindow: 1_000_000, inputPer1M: 0.14, outputPer1M: 0.28, cacheReadPer1M: 0.0028},
    'Qwen/Qwen3.8-Max': {name: 'Qwen 3.8 Max', contextWindow: 1_000_000, inputPer1M: 2, outputPer1M: 6, cacheReadPer1M: 0.25, cacheWritePer1M: 2.5},
    'Qwen/Qwen3.8-27B': {name: 'Qwen 3.8 27B', contextWindow: 262_000, inputPer1M: 0.4, outputPer1M: 3, cacheReadPer1M: 0.04},
    'Qwen/Qwen3.8-Flash': {name: 'Qwen 3.8 Flash', contextWindow: 1_000_000, inputPer1M: 0.16, outputPer1M: 0.47, cacheReadPer1M: 0.016},
    'Qwen/Qwen3.7-Max': {name: 'Qwen 3.7 Max', contextWindow: 1_000_000, inputPer1M: 2.5, outputPer1M: 7.5, cacheReadPer1M: 0.5, cacheWritePer1M: 3.13},
    'Qwen/Qwen3.7-Plus': {name: 'Qwen 3.7 Plus', contextWindow: 1_000_000, inputPer1M: 0.4, outputPer1M: 1.6, cacheReadPer1M: 0.08, cacheWritePer1M: 0.5},
    'Qwen/Qwen3.7-Flash': {name: 'Qwen 3.7 Flash', contextWindow: 1_000_000, inputPer1M: 0.03, outputPer1M: 0.13, cacheReadPer1M: 0.006, cacheWritePer1M: 0.038},
    'Qwen/Qwen3.6-Max-Preview': {name: 'Qwen 3.6 Max Preview', contextWindow: 1_000_000, inputPer1M: 1.3, outputPer1M: 7.8, cacheReadPer1M: 0.26, cacheWritePer1M: 1.63},
    'Qwen/Qwen3.6-Plus': {name: 'Qwen 3.6 Plus', contextWindow: 1_000_000, inputPer1M: 0.5, outputPer1M: 3, cacheReadPer1M: 0.1},
    'stepfun/Step-3.7-Flash': {name: 'Step 3.7 Flash', contextWindow: 256_000, inputPer1M: 0.2, outputPer1M: 1.15, cacheReadPer1M: 0.04},
    'stepfun/Step-3.5-Flash': {name: 'Step 3.5 Flash', contextWindow: 1_000_000, inputPer1M: 0.1, outputPer1M: 0.3, cacheReadPer1M: 0.02},
    'tencent/hy3-paid': {name: 'Tencent Hy3', contextWindow: 262_000, inputPer1M: 0.14, outputPer1M: 0.58, cacheReadPer1M: 0.035},
    'tencent/hy4-preview': {name: 'Tencent Hy4 Preview', contextWindow: 1_050_000, inputPer1M: 0.834, outputPer1M: 2.501, cacheReadPer1M: 0.042},
    'nvidia/nemotron-3-ultra-550b-a55b': {name: 'Nemotron 3 Ultra', contextWindow: 1_000_000, inputPer1M: 0.6, outputPer1M: 2.4, cacheReadPer1M: 0.12},
    'thinkingmachines/inkling': {name: 'Inkling', contextWindow: 256_000, inputPer1M: 1, outputPer1M: 4.05, cacheReadPer1M: 0.17},
    'thinkingmachines/inkling-small': {name: 'Inkling Small', contextWindow: 1_000_000, inputPer1M: 0.5, outputPer1M: 1.2, cacheReadPer1M: 0.1},
    'poolside/laguna-s-2.1-free': {name: 'Laguna S 2.1', contextWindow: 256_000, inputPer1M: 0, outputPer1M: 0, cacheReadPer1M: 0},
    'claude-sonnet-5': {name: 'Claude Sonnet 5', contextWindow: 1_000_000, inputPer1M: 2, outputPer1M: 10, cacheReadPer1M: 0.2, cacheWritePer1M: 2.5},
    'claude-sonnet-4-6': {name: 'Claude Sonnet 4.6', contextWindow: 1_000_000, inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75},
    'claude-fable-5': {name: 'Claude Fable 5', contextWindow: 1_000_000, inputPer1M: 10, outputPer1M: 50, cacheReadPer1M: 1, cacheWritePer1M: 12.5},
    'claude-opus-5': {name: 'Claude Opus 5', contextWindow: 1_000_000, inputPer1M: 5, outputPer1M: 25, cacheReadPer1M: 0.5, cacheWritePer1M: 6.25},
    'claude-opus-4-8': {name: 'Claude Opus 4.8', contextWindow: 1_000_000, inputPer1M: 5, outputPer1M: 25, cacheReadPer1M: 0.5, cacheWritePer1M: 6.25},
    'claude-opus-4-7': {name: 'Claude Opus 4.7', contextWindow: 1_000_000, inputPer1M: 5, outputPer1M: 25, cacheReadPer1M: 0.5, cacheWritePer1M: 6.25},
    'claude-haiku-4-5-20251001': {name: 'Claude Haiku 4.5', contextWindow: 200_000, inputPer1M: 1, outputPer1M: 5, cacheReadPer1M: 0.1, cacheWritePer1M: 1.25},
    'gpt-5.6-sol': {name: 'GPT-5.6 Sol', contextWindow: 1_050_000, inputPer1M: 5, outputPer1M: 30, cacheReadPer1M: 0.5, cacheWritePer1M: 6.25},
    'gpt-5.6-terra': {name: 'GPT-5.6 Terra', contextWindow: 1_050_000, inputPer1M: 2, outputPer1M: 12, cacheReadPer1M: 0.2, cacheWritePer1M: 2.5},
    'gpt-5.6-luna': {name: 'GPT-5.6 Luna', contextWindow: 1_050_000, inputPer1M: 0.2, outputPer1M: 1.2, cacheReadPer1M: 0.02, cacheWritePer1M: 0.25},
    'gpt-5.5': {name: 'GPT-5.5', contextWindow: 400_000, inputPer1M: 5, outputPer1M: 30, cacheReadPer1M: 0.5, cacheWritePer1M: 0},
    'gpt-5.4': {name: 'GPT-5.4', contextWindow: 400_000, inputPer1M: 2.5, outputPer1M: 15, cacheReadPer1M: 0.25, cacheWritePer1M: 0},
    'gpt-5.3-codex': {name: 'GPT-5.3 Codex', contextWindow: 400_000, inputPer1M: 2, outputPer1M: 8, cacheReadPer1M: 0.5, cacheWritePer1M: 0},
    'gpt-5.4-mini': {name: 'GPT-5.4 Mini', contextWindow: 400_000, inputPer1M: 0.75, outputPer1M: 4.5, cacheReadPer1M: 0.075, cacheWritePer1M: 0},
    'google/gemini-3.7-flash': {name: 'Gemini 3.7 Flash', contextWindow: 1_050_000, inputPer1M: 1.5, outputPer1M: 7.5, cacheReadPer1M: 0.15, cacheWritePer1M: 0.08334},
    'google/gemini-3.6-flash': {name: 'Gemini 3.6 Flash', contextWindow: 1_000_000, inputPer1M: 1.5, outputPer1M: 7.5, cacheReadPer1M: 0.15},
    'google/gemini-3.5-flash': {name: 'Gemini 3.5 Flash', contextWindow: 1_000_000, inputPer1M: 1.5, outputPer1M: 9, cacheReadPer1M: 0.15},
    'google/gemini-3.5-flash-lite': {name: 'Gemini 3.5 Flash Lite', contextWindow: 1_000_000, inputPer1M: 0.3, outputPer1M: 2.5, cacheReadPer1M: 0.03},
    'google/gemini-3.1-flash-lite': {name: 'Gemini 3.1 Flash Lite', contextWindow: 1_000_000, inputPer1M: 0.25, outputPer1M: 1.5, cacheReadPer1M: 0.03},
    'sakana/fugu-ultra': {name: 'Fugu Ultra', contextWindow: 1_000_000, inputPer1M: 5, outputPer1M: 30, cacheReadPer1M: 0.5},
    'meta/muse-spark-1.1': {name: 'Muse Spark 1.1', contextWindow: 1_050_000, inputPer1M: 1.25, outputPer1M: 4.25, cacheReadPer1M: 0.15},
    'meta/muse-spark-1.2': {name: 'Muse Spark 1.2', contextWindow: 1_050_000, inputPer1M: 1.25, outputPer1M: 4.25, cacheReadPer1M: 0.15},
    'meta/muse-spark-1.2-contributor': {name: 'Muse Spark 1.2 Contributor', contextWindow: 1_050_000, inputPer1M: 0.1, outputPer1M: 0.2, cacheReadPer1M: 0.002},
    'xai/grok-4.5': {name: 'Grok 4.5', contextWindow: 500_000, inputPer1M: 2, outputPer1M: 6, cacheReadPer1M: 0.5},
    'xai/grok-4.6': {name: 'Grok 4.6', contextWindow: 500_000, inputPer1M: 2, outputPer1M: 6, cacheReadPer1M: 0.5},
};

// The catalog gives a free model and its paid twin the same display name. Both
// minimax/minimax-m3-free and MiniMaxAI/MiniMax-M3 read 'MiniMax M3', so a zero price
// is what tells them apart.
const isFree = (model: CatalogModel) =>
    model.inputPer1M === 0 && model.outputPer1M === 0 && model.cacheReadPer1M === 0;

const SEGMENTS = ['model', 'effort', 'context', 'cost', 'cache', 'branch', 'pace'] as const;
type Segment = (typeof SEGMENTS)[number];
const WINDOWS = ['5h', '1w', '1m'] as const;
type WindowLabel = (typeof WINDOWS)[number];
type UsageMode = 'hide' | 'auto' | 'all';
type UsageFormat = 'price' | 'percent';

interface UsageWindow {
    label: WindowLabel;
    used: number;
    cap: number | null;
    resetAt: number | null;
    exceeded: boolean;
}

// The billing period the credits belong to. A window can reopen after the period ends, so
// the refill date has to be available beside every reset.
interface BillingPeriod {
    start: number;
    end: number;
}

// Event payloads arrive from the harness unvalidated, so every field we read stays `unknown`
// until it is checked. This is the boundary; everything past it assumes the types it claims.
interface ModelRequestStartEvent {
    model?: unknown;
}

interface TurnEndEvent {
    usage?: {
        inputTokens?: unknown;
        outputTokens?: unknown;
        cacheReadTokens?: unknown;
        cacheWriteTokens?: unknown;
    };
}

interface ToolRunningEvent {
    toolName?: unknown;
}

interface ConfigSettingChangedEvent {
    setting?: unknown;
    value?: unknown;
}

const READ_TOOLS = new Set(['read_file', 'grep', 'glob', 'read_directory']);
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);

const YELLOW = '\x1b[33m';
const ORANGE = '\x1b[38;5;208m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const RENDER_INTERVAL_MS = MINUTE_MS;
const REFRESH_INTERVAL_MS = 5 * MINUTE_MS;
const FETCH_TIMEOUT_MS = 8_000;

const TOKENS_PER_MILLION = 1_000_000;
const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const TOKENS_PER_THOUSAND = 1000;
// Below this the tenths digit still carries information (4.2k); above it, it is noise.
const ROUND_TOKENS_ABOVE = 10_000;

const CONTEXT_RED_PERCENT = 80;
const CONTEXT_ORANGE_PERCENT = 40;
const CONTEXT_YELLOW_PERCENT = 20;

const NEXT_USAGE_MODE: Record<UsageMode, UsageMode> = {hide: 'auto', auto: 'all', all: 'hide'};
const WINDOW_ARG_PREFIX = 'usage-';
// The weekly window used to be labelled 7d, and the old word still reaches the same toggle.
const WINDOW_ARG_ALIASES: Record<string, WindowLabel> = {'7d': '1w'};

// The context number is the only coloured thing on the line, because it is the one that ends
// the session. Everything else stays in the terminal's own foreground.
function contextColour(percentUsed: number): string {
    if (percentUsed >= CONTEXT_RED_PERCENT) return RED;
    if (percentUsed >= CONTEXT_ORANGE_PERCENT) return ORANGE;
    if (percentUsed >= CONTEXT_YELLOW_PERCENT) return YELLOW;
    return '';
}

function formatTokens(tokens: number): string {
    if (tokens >= ROUND_TOKENS_ABOVE) return `${Math.round(tokens / TOKENS_PER_THOUSAND)}k`;
    return `${(tokens / TOKENS_PER_THOUSAND).toFixed(1)}k`;
}

function formatDuration(ms: number): string {
    if (ms <= 0) return 'now';
    const minutes = Math.floor(ms / MINUTE_MS);
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d${hours % 24}h`;
}

// A fixed month name, because the statusline must read the same on every machine and a locale
// format would put a comma or a foreign month name in the middle of the line.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTimestamp(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${MONTHS[date.getMonth()]} ${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toEpochMs(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
}

// commandcode loads a mod through its default export, so this is the framework's contract
// rather than a choice. A named export would never be called.
export default function (cmd: ModApi): void {
    const show: Record<Segment, boolean> = {
        model: true,
        effort: true,
        context: true,
        cost: true,
        cache: true,
        branch: true,
        pace: true,
    };
    for (const name of SEGMENTS) {
        cmd.addFlag(name, {type: 'boolean', default: show[name], description: `statusline: show ${name}`});
        const flag = cmd.getFlag(name);
        if (typeof flag === 'boolean') show[name] = flag;
    }
    cmd.addFlag('usageMode', {type: 'string', default: 'auto', description: "statusline: 'auto' shows the blocker or the tightest window, 'all' shows every enabled window"});
    cmd.addFlag('usageFormat', {type: 'string', default: 'price', description: "statusline: 'price' shows $used/$cap, 'percent' shows %"});
    cmd.addFlag('win5h', {type: 'boolean', default: true, description: 'statusline: show the 5-hour window'});
    cmd.addFlag('win1w', {type: 'boolean', default: true, description: 'statusline: show the weekly window'});
    cmd.addFlag('win1m', {type: 'boolean', default: true, description: 'statusline: show the monthly window'});

    const modeFlag = cmd.getFlag('usageMode');
    let usageMode: UsageMode = modeFlag === 'all' || modeFlag === 'hide' ? modeFlag : 'auto';
    let usageFormat: UsageFormat = cmd.getFlag('usageFormat') === 'percent' ? 'percent' : 'price';
    const showWindow: Record<WindowLabel, boolean> = {
        '5h': cmd.getFlag('win5h') !== false,
        '1w': cmd.getFlag('win1w') !== false,
        '1m': cmd.getFlag('win1m') !== false,
    };

    let enabled = true;
    let modelId = '';
    let effort: string | undefined;
    let contextUsed = 0;
    let sessionCost = 0;
    let costKnown = false;
    let reads = 0;
    let writes = 0;
    let totalCacheReadTokens = 0;
    let totalInputTokens = 0;
    let branch = '';
    let windows: UsageWindow[] = [];
    let period: BillingPeriod | null = null;

    // A broken segment has to stay visible. Whatever failed lands here, shows as ⚠ in the
    // footer, and `/statusline` prints the full text. commandcode turns a throwing mod into a
    // mod_error rather than a crash, so the risk left over is a statusline that says nothing.
    const problems = new Map<string, string>();
    const fail = (where: string, reason: unknown) =>
        problems.set(where, reason instanceof Error ? reason.message : String(reason));

    // Every toggle is written here, so /statusline all survives a restart. The file is the
    // source of truth: it loads after the launch flags and overrides them.
    const STATE_FILE = join(homedir(), '.commandcode', 'statusline.state.json');

    function saveState(): void {
        try {
            const state = {enabled, show, showWindow, usageMode, usageFormat};
            writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
            problems.delete('state');
        } catch (error) {
            fail('state', error);
        }
    }

    function loadState(): void {
        try {
            const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
            if (typeof saved.enabled === 'boolean') enabled = saved.enabled;
            for (const name of SEGMENTS) {
                if (typeof saved.show?.[name] === 'boolean') show[name] = saved.show[name];
            }
            for (const label of WINDOWS) {
                if (typeof saved.showWindow?.[label] === 'boolean') showWindow[label] = saved.showWindow[label];
            }
            if (saved.usageMode in NEXT_USAGE_MODE) usageMode = saved.usageMode;
            if (saved.usageFormat === 'price' || saved.usageFormat === 'percent') usageFormat = saved.usageFormat;
        } catch (error) {
            // No file yet is the normal first run; a malformed one is worth saying out loud.
            if (!String(error).includes('ENOENT')) fail('state', error);
        }
    }
    loadState();

    function readConfigModel(): string {
        try {
            const config = JSON.parse(readFileSync(join(homedir(), '.commandcode', 'config.json'), 'utf8'));
            return typeof config.model === 'string' ? config.model : '';
        } catch (error) {
            fail('config', error);
            return '';
        }
    }

    function readApiKey(): string {
        if (process.env.COMMAND_CODE_API_KEY) return process.env.COMMAND_CODE_API_KEY;
        try {
            const auth = JSON.parse(readFileSync(join(homedir(), '.commandcode', 'auth.json'), 'utf8'));
            return typeof auth.apiKey === 'string' ? auth.apiKey : '';
        } catch (error) {
            fail('auth', error);
            return '';
        }
    }

    async function refreshUsage(): Promise<void> {
        const apiKey = readApiKey();
        if (!apiKey) {
            fail('auth', 'no apiKey in auth.json and COMMAND_CODE_API_KEY is unset');
            render();
            return;
        }
        problems.delete('auth');

        const getJson = async (path: string) => {
            const response = await fetch(`https://api.commandcode.ai${path}`, {
                headers: {Authorization: `Bearer ${apiKey}`},
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        };

        let orgId = '';
        try {
            const whoami = await getJson('/alpha/whoami');
            orgId = whoami?.orgId ?? whoami?.user?.orgId ?? whoami?.org?.id ?? whoami?.data?.orgId ?? '';
        } catch {
            // whoami is optional. The billing endpoints work without an orgId on personal plans.
        }
        const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';

        try {
            const subscription = await getJson(`/alpha/billing/subscriptions${orgQuery}`);
            const billing = subscription?.data ?? subscription;
            const start = toEpochMs(billing?.currentPeriodStart);
            const end = toEpochMs(billing?.currentPeriodEnd);
            period = start != null && end != null && end > start ? {start, end} : null;
            problems.delete('period');
        } catch (error) {
            fail('period', error);
        }

        const next: UsageWindow[] = [];
        try {
            const raw = await getJson(`/alpha/billing/credits${orgQuery}`);
            const credits = raw?.credits ?? raw?.data ?? raw;
            const windowLimits = credits?.windowLimits ?? raw?.windowLimits;
            for (const [label, field] of [['5h', 'fiveHour'], ['1w', 'weekly']] as const) {
                const limit = windowLimits?.[field];
                if (!limit || typeof limit.used !== 'number') continue;
                next.push({
                    label,
                    used: limit.used,
                    cap: typeof limit.cap === 'number' ? limit.cap : null,
                    resetAt: toEpochMs(limit.resetAt),
                    exceeded: limit.exceeded === true,
                });
            }

            const monthly = credits?.credits?.monthlyCredits ?? raw?.credits?.monthlyCredits;
            if (monthly != null) {
                let used = NaN;
                let cap: number | null = null;
                let remaining: number | null = null;
                let resetAt: number | null = null;
                if (typeof monthly === 'object') {
                    used = Number(monthly.used);
                    cap = typeof monthly.cap === 'number' ? monthly.cap : null;
                    resetAt = toEpochMs(monthly.resetAt);
                } else {
                    // A bare monthlyCredits is the balance left and falls as you spend, so it is
                    // not the cap. The cap is that balance plus what has already been used.
                    remaining = Number(monthly);
                }
                if (!Number.isFinite(used)) {
                    try {
                        const summary = await getJson(`/alpha/usage/summary${orgQuery}`);
                        used = Number(summary?.totalCost ?? summary?.data?.totalCost ?? summary?.summary?.totalCost);
                        problems.delete('summary');
                    } catch (error) {
                        fail('summary', error);
                    }
                }
                if (remaining != null && Number.isFinite(used)) cap = used + remaining;
                if (!resetAt) resetAt = period?.end ?? null;
                const exceeded = remaining != null ? remaining <= 0 : cap != null && used >= cap;
                if (Number.isFinite(used)) next.push({label: '1m', used, cap, resetAt, exceeded});
            }
        } catch (error) {
            // Keep the last-known windows, but say the refresh failed.
            fail('credits', error);
            render();
            return;
        }
        problems.delete('credits');
        windows = next;
        render();
    }

    async function refreshBranch(): Promise<void> {
        try {
            const named = await cmd.exec({command: 'git', args: ['branch', '--show-current']});
            branch = named.stdout.trim();
            if (!branch) {
                const detached = await cmd.exec({command: 'git', args: ['rev-parse', '--short', 'HEAD']});
                branch = detached.code === 0 ? `@${detached.stdout.trim()}` : '';
            }
        } catch {
            // Not a git checkout, or git is not installed. Neither is worth a warning here.
            branch = '';
        }
        render();
    }

    // Auto ranks by money left rather than by percentage used. A window at 95% of $100 still
    // buys more work than one at 40% of $3, and the second is the one that stops you first.
    const moneyLeft = (usageWindow: UsageWindow) =>
        usageWindow.cap && usageWindow.cap > 0 ? usageWindow.cap - usageWindow.used : Infinity;

    function exceededText(usageWindow: UsageWindow): string {
        // The line carries one date. While you are blocked the only question is when you can
        // type again, and the plan refill can land before the window reset, so quote the earlier
        // of the two.
        const {label, resetAt} = usageWindow;
        if (period && (!resetAt || period.end <= resetAt)) {
            return `${RED}${label} exceeded, plan renews ${formatDuration(period.end - Date.now())}${RESET}`;
        }
        if (resetAt) {
            return `${RED}${label} exceeded, renews ${formatDuration(resetAt - Date.now())}${RESET}`;
        }
        return `${RED}${label} exceeded${RESET}`;
    }

    // Every reset is capped by the plan refill, so rank on the capped time. Two windows that
    // reopen together are one event, and the wider label describes it better.
    function lastToClear(blocked: UsageWindow[]): UsageWindow {
        const opensAt = (usageWindow: UsageWindow) =>
            Math.min(usageWindow.resetAt ?? Infinity, period?.end ?? Infinity);
        return blocked.reduce((latest, candidate) => {
            if (opensAt(candidate) !== opensAt(latest)) {
                return opensAt(candidate) > opensAt(latest) ? candidate : latest;
            }
            return WINDOWS.indexOf(candidate.label) > WINDOWS.indexOf(latest.label) ? candidate : latest;
        });
    }

    // What you must still spend before the current weekly window resets, if none of the credit is
    // to expire. Each later window absorbs one full weekly cap; whatever they cannot take has to
    // go in now, and the deadline is this window's own reset or the plan refill.
    function paceText(): string {
        const month = windows.find(usageWindow => usageWindow.label === '1m');
        const week = windows.find(usageWindow => usageWindow.label === '1w');
        if (!month || !week || !period) return '';
        if (month.cap == null || week.cap == null) return '';
        if (month.cap <= 0 || week.cap <= 0) return '';
        const deadline = Math.min(week.resetAt ?? period.end, period.end);
        if (deadline <= Date.now()) return '';

        const credit = Math.max(0, month.cap - month.used);
        const laterWindows = Math.max(0, Math.ceil((period.end - deadline) / WEEK_MS));
        const need = credit - laterWindows * week.cap;
        // The later windows can still absorb every dollar, so nothing is at risk yet.
        if (need <= 0) return '';
        const target = Math.min(need, week.cap - week.used);
        if (target <= 0) return '';
        return `${YELLOW}under pace, spend $${target.toFixed(2)} till ${formatTimestamp(deadline)}${RESET}`;
    }

    function windowText(usageWindow: UsageWindow): string {
        const {label, used, resetAt} = usageWindow;
        const cap = usageWindow.cap != null && usageWindow.cap > 0 ? usageWindow.cap : null;
        const capSuffix = cap === null ? '' : `/$${cap.toFixed(2)}`;
        const price = `$${used.toFixed(2)}${capSuffix}`;
        const figure = usageFormat === 'percent' && cap !== null ? `${Math.round((used / cap) * 100)}%` : price;
        const resets = resetAt ? ` (${formatDuration(resetAt - Date.now())})` : '';
        return `${label} ${figure}${resets}`;
    }

    const visibleWindows = () => windows.filter(usageWindow => showWindow[usageWindow.label]);

    // Two lists rather than one. What you can still spend belongs next to the money figures,
    // and what is stopping you reads last, after the branch, with the other warnings.
    function usageParts(): {open: string[]; blocked: string[]} {
        if (!windows.length) {
            // Only claim there is no plan when the fetch succeeded and came back empty.
            if (problems.size) return {open: [], blocked: []};
            return {open: [], blocked: [`${ORANGE}no usage plan · commandcode.ai/upgrade${RESET}`]};
        }
        const visible = visibleWindows();
        const blocked = visible.filter(usageWindow => usageWindow.exceeded);
        const usable = visible.filter(usageWindow => !usageWindow.exceeded);
        if (usageMode === 'all') {
            const open = usable.length ? [usable.map(windowText).join(' ')] : [];
            return {open, blocked: blocked.map(exceededText)};
        }
        // When a window has stopped you, the budget behind it does not help, so the line carries
        // the block alone, and only the one that lifts last.
        if (blocked.length) return {open: [], blocked: [exceededText(lastToClear(blocked))]};
        // Otherwise quote the window that runs out of money first.
        const tightest = usable.reduce<UsageWindow | null>(
            (best, candidate) => (!best || moneyLeft(candidate) < moneyLeft(best) ? candidate : best),
            null,
        );
        return {open: tightest ? [windowText(tightest)] : [], blocked: []};
    }

    function render(): void {
        if (!enabled || !cmd.ui.capabilities.status) {
            cmd.ui.setStatus(null);
            return;
        }
        const model = MODELS[modelId];
        const onFreeModel = model != null && isFree(model);
        const parts: string[] = [];

        if (show.model && modelId) {
            let name = model ? model.name : modelId;
            if (onFreeModel) name += ' free';
            if (show.effort && effort) name += ` [${effort}]`;
            parts.push(name);
        }
        if (show.context && contextUsed > 0) {
            const contextWindow = model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
            const colour = contextColour((contextUsed / contextWindow) * 100);
            // The colour goes on the used figure only. The ceiling beside it is there for
            // reference.
            const used = colour ? `${colour}${formatTokens(contextUsed)}${RESET}` : formatTokens(contextUsed);
            parts.push(`${used}/${formatTokens(contextWindow)}`);
        }
        if (show.cost && costKnown && !onFreeModel) parts.push(`$${sessionCost.toFixed(2)}`);
        if (show.cache) {
            const totalReads = totalCacheReadTokens + totalInputTokens;
            const hitPercent = totalReads > 0 ? ((totalCacheReadTokens / totalReads) * 100).toFixed(1) : '0.0';
            parts.push(`R${reads} W${writes} CH${hitPercent}%`);
        }

        const usageShown = usageMode !== 'hide' && !onFreeModel;
        const usage = usageShown ? usageParts() : {open: [], blocked: []};
        parts.push(...usage.open);
        if (show.branch && branch) parts.push(`⎇ ${branch}`);
        parts.push(...usage.blocked);

        // A blocked line already says stop, so the pace hint stays off it. The hint comes last so
        // the branch can sit next to the usage figures it belongs to.
        const blocked = visibleWindows().some(usageWindow => usageWindow.exceeded);
        const pace = show.pace && usageShown && !blocked ? paceText() : '';
        if (pace) parts.push(pace);

        if (problems.size) parts.push(`⚠ ${[...problems.keys()].join(' ')}`);
        cmd.ui.setStatus(parts.length ? parts.join(' · ') : null);
    }

    cmd.on('model_request_start', (event: ModelRequestStartEvent) => {
        const requested = typeof event?.model === 'string' ? event.model : '';
        if (!requested || requested === modelId) return;
        modelId = requested;
        render();
    });

    cmd.on('turn_end', (event: TurnEndEvent) => {
        const usage = event?.usage;
        if (!usage) return;
        const inputTokens = Number(usage.inputTokens ?? 0);
        const outputTokens = Number(usage.outputTokens ?? 0);
        const cacheReadTokens = Number(usage.cacheReadTokens ?? 0);
        const cacheWriteTokens = Number(usage.cacheWriteTokens ?? 0);
        contextUsed = inputTokens + cacheReadTokens + cacheWriteTokens;
        totalInputTokens += inputTokens;
        totalCacheReadTokens += cacheReadTokens;
        const price = MODELS[modelId];
        if (price) {
            sessionCost +=
                (inputTokens * price.inputPer1M +
                    outputTokens * price.outputPer1M +
                    cacheReadTokens * price.cacheReadPer1M +
                    cacheWriteTokens * (price.cacheWritePer1M ?? 0)) /
                TOKENS_PER_MILLION;
            costKnown = true;
        }
        render();
    });

    cmd.on('tool_running', (event: ToolRunningEvent) => {
        const name = typeof event?.toolName === 'string' ? event.toolName : '';
        if (READ_TOOLS.has(name)) reads += 1;
        else if (WRITE_TOOLS.has(name)) writes += 1;
        else return;
        render();
    });

    cmd.on('config_setting_changed', (event: ConfigSettingChangedEvent) => {
        const setting = typeof event?.setting === 'string' ? event.setting : '';
        const value = typeof event?.value === 'string' ? event.value : '';
        if (/effort/i.test(setting)) {
            effort = value && value !== 'default' ? value : undefined;
            render();
        } else if (/^model$/i.test(setting) && value) {
            modelId = value;
            render();
        }
    });

    cmd.hooks({
        onSessionStart: () => {
            if (!modelId) modelId = readConfigModel();
            render();
            void refreshUsage();
            void refreshBranch();
        },
        onSessionEnd: () => cmd.ui.setStatus(null),
    });

    // A card rather than a list. The filled bullet is the value in force, and every label here is
    // also a word /statusline accepts, so the card can be read as its own help.
    const CARD_WIDTH = 37;
    const CARD_LABEL_WIDTH = 10;
    const CARD_OFF_COLUMN = 19;

    function statusText(): string {
        const line = (text: string) => `│ ${text.padEnd(CARD_WIDTH)} │`;
        const rule = (title: string, left: string, right: string) => {
            const label = ` ${title} `;
            const dashes = CARD_WIDTH + 2 - label.length;
            const leftDashes = Math.floor(dashes / 2);
            return `${left}${'─'.repeat(leftDashes)}${label}${'─'.repeat(dashes - leftDashes)}${right}`;
        };
        const mark = (active: boolean) => (active ? '●' : '○');
        const toggle = (label: string, on: boolean) =>
            line(`${label.padEnd(CARD_LABEL_WIDTH)}${mark(on)} on`.padEnd(CARD_OFF_COLUMN) + `${mark(!on)} off`);
        const broken = problems.size
            ? [...problems].map(([where, reason]) => `${where}: ${reason}`).join(' · ')
            : 'nothing';
        return [
            rule(enabled ? 'DISPLAY' : 'DISPLAY (off)', '┌', '┐'),
            ...SEGMENTS.map(segment => toggle(segment, show[segment])),
            rule('USAGE', '├', '┤'),
            line(`${'mode'.padEnd(CARD_LABEL_WIDTH)}${mark(usageMode === 'hide')} hide  ${mark(usageMode === 'auto')} auto  ${mark(usageMode === 'all')} all`),
            line('          hide = nothing shown'),
            line('          auto = blocker or tightest'),
            line('          all  = every window below'),
            line(''),
            line('windows   (needs mode=all)'),
            ...WINDOWS.map(label => toggle(`  ${label}`, showWindow[label])),
            line(''),
            line('type      (needs mode=auto or all)'),
            line(`  ${mark(usageFormat === 'price')} price    $9.34 / $10.00`),
            line(`  ${mark(usageFormat === 'percent')} percent  93%`),
            rule('STATE', '├', '┤'),
            line(`${'broken'.padEnd(CARD_LABEL_WIDTH)}${broken}`),
            `└${'─'.repeat(CARD_WIDTH + 2)}┘`,
        ].join('\n');
    }

    function applyCommand(command: string): string {
        if (command === 'on' || command === 'off') {
            enabled = command === 'on';
            return `statusline ${command}`;
        }
        if (command === 'usage' || command === 'mode') {
            usageMode = NEXT_USAGE_MODE[usageMode];
            return `statusline: usage ${usageMode}`;
        }
        if (command === 'usage-type' || command === 'type') {
            usageFormat = usageFormat === 'price' ? 'percent' : 'price';
            return `statusline: usage-type ${usageFormat}`;
        }
        if (command === 'hide' || command === 'auto' || command === 'all') {
            usageMode = command;
            return `statusline: usage ${command}`;
        }
        if (command === 'price' || command === 'percent') {
            usageFormat = command;
            return `statusline: usage-type ${command}`;
        }
        // Both `usage-5h` and the bare `5h` reach the same toggle.
        const bare = command.startsWith(WINDOW_ARG_PREFIX) ? command.slice(WINDOW_ARG_PREFIX.length) : command;
        const asked = WINDOW_ARG_ALIASES[bare] ?? bare;
        const label = WINDOWS.find(known => known === asked);
        if (label) {
            showWindow[label] = !showWindow[label];
            return `statusline: usage-${label} ${showWindow[label] ? 'on' : 'off'}`;
        }
        const segment = SEGMENTS.find(known => known === command);
        if (segment) {
            show[segment] = !show[segment];
            return `statusline: ${segment} ${show[segment] ? 'on' : 'off'}`;
        }
        return '';
    }

    cmd.addCommand({
        name: 'statusline',
        description: 'model effort context cost cache branch pace · mode hide|auto|all · 5h|1w|1m · type price|percent · on|off|refresh',
        argumentHint: '[segment|5h|1w|1m|hide|auto|all|price|percent|on|off|refresh]',
        handler: ({args}) => {
            const command = (typeof args === 'string' ? args : '').trim().toLowerCase();
            // The harness prefixes a message with a marker, which would shove the card's top
            // border one glyph right. A leading newline drops the box onto a clean column.
            if (!command) return {message: '\n' + statusText()};
            if (command === 'refresh') {
                void refreshUsage();
                void refreshBranch();
                return {message: 'statusline: refreshing usage + branch'};
            }
            const message = applyCommand(command);
            if (!message) return {message: [`unknown "${command}"`, '', statusText()].join('\n')};
            saveState();
            render();
            return {message};
        },
    });

    if (cmd.ui.capabilities.status) {
        const renderTimer = setInterval(() => render(), RENDER_INTERVAL_MS);
        const refreshTimer = setInterval(() => {
            void refreshUsage();
            void refreshBranch();
        }, REFRESH_INTERVAL_MS);
        renderTimer.unref?.();
        refreshTimer.unref?.();
    }
}
