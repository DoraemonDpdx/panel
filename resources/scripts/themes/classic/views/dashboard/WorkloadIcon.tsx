import { AudioLines, Bot, Database, Gamepad2, Globe, Server, type LucideIcon, type LucideProps } from 'lucide-react';
import type { WorkloadProfile } from '@/sdk/theme';

const icons = {
    game: Gamepad2,
    bot: Bot,
    web: Globe,
    database: Database,
    lavalink: AudioLines,
    generic: Server,
} as const satisfies Record<WorkloadProfile, LucideIcon>;

/** The icon of a workload profile. */
export function WorkloadIcon({ workload, ...props }: LucideProps & { workload: WorkloadProfile }) {
    const Icon = icons[workload];

    return <Icon aria-hidden {...props} />;
}
