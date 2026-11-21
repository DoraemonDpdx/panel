export const COLORS = {
    success: 0x2ecc71,
    danger: 0xe74c3c,
    warning: 0xf1c40f,
    info: 0x3498db,
    neutral: 0x95a5a6,
    suspended: 0xe67e22,
} as const;

export function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;

    return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

/** Panel limits are in MiB; 0 means unlimited. */
export function formatMib(mib: number | null | undefined): string {
    if (mib === null || mib === undefined || mib === 0) return 'Unlimited';

    return formatBytes(mib * 1024 * 1024);
}

export function formatLimit(value: number | null | undefined): string {
    return value === null || value === undefined ? 'Unlimited' : String(value);
}

export function formatCpu(percent: number): string {
    return percent === 0 ? 'Unlimited' : `${percent}%`;
}

export function formatUptime(milliseconds: number): string {
    const total = Math.floor(milliseconds / 1000);
    if (total <= 0) return '0s';
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, !days && !hours && `${seconds}s`].filter(Boolean);

    return parts.join(' ');
}

export function discordTime(iso: string | null | undefined, style: 'R' | 'f' = 'R'): string {
    if (!iso) return 'never';
    const ms = Date.parse(iso);

    return Number.isNaN(ms) ? iso : `<t:${Math.floor(ms / 1000)}:${style}>`;
}

export function code(value: string | number | null | undefined): string {
    return `\`${String(value ?? '').replace(/`/g, "'")}\``;
}

/** Split a comma separated list typed into a Discord option. */
export function splitList(input: string): string[] {
    return input
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}
