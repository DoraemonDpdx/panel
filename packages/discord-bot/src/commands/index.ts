import { accountCommand } from './account.js';
import { billingCommand } from './billing.js';
import { helpCommand } from './help.js';
import { loginCommand } from './login.js';
import { serverCommand } from './server.js';
import { serversCommand } from './servers.js';
import { statusCommand } from './status.js';
import { supportCommand } from './support.js';
import type { CustomerCommand } from './types.js';

export const commands: readonly CustomerCommand[] = [serversCommand, serverCommand, billingCommand, supportCommand, statusCommand, loginCommand, accountCommand, helpCommand];

export const commandByName = (name: string) => commands.find((c) => c.name === name);

export function buildCommands() {
    return commands.map((c) => c.build());
}
