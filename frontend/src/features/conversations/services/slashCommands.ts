export interface SlashCommandStorageUpdate {
  key: string;
  value: string | null;
}

export interface SlashCommandPlan {
  handled: true;
  messages?: string[];
  storageUpdates?: SlashCommandStorageUpdate[];
  patch?: Record<string, unknown>;
  reload?: boolean;
}

export interface SlashCommandContext {
  alert: (message: string) => void;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  reload: () => void;
  pushRuntimeConfig: (patch: Record<string, unknown>) => Promise<void>;
}

const RESET_KEYS = [
  'fk_model',
  'fk_temperature',
  'fk_top_p',
  'fk_backend',
  'fk_gateway',
  'fk_show_context',
  'fk_context_limit',
];

export const HELP_TEXT = `/model <name>\n/temperature <0..2>\n/top_p <0..1>\n/backend <openai|transformers>\n/gateway <url>\n/context on|off|<limit>\n/restart\n/reset`;

export function parseSlashCommand(input: string): SlashCommandPlan | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const [cmdRaw, ...rest] = trimmed.slice(1).split(/\s+/);
  const command = (cmdRaw || '').toLowerCase();
  const arg = rest.join(' ').trim();

  const plan: SlashCommandPlan = { handled: true };
  const messages: string[] = [];
  const storageUpdates: SlashCommandStorageUpdate[] = [];
  const patch: Record<string, unknown> = {};

  const pushMessage = (message: string) => {
    if (message) {
      messages.push(message);
    }
  };

  switch (command) {
    case 'model': {
      storageUpdates.push({ key: 'fk_model', value: arg || '' });
      patch.model = arg;
      pushMessage(`Model set to: ${arg}`);
      break;
    }
    case 'temperature': {
      storageUpdates.push({ key: 'fk_temperature', value: arg || '' });
      patch.temperature = Number(arg);
      pushMessage(`Temperature: ${arg}`);
      break;
    }
    case 'top_p': {
      storageUpdates.push({ key: 'fk_top_p', value: arg || '' });
      patch.top_p = Number(arg);
      pushMessage(`top_p: ${arg}`);
      break;
    }
    case 'backend': {
      storageUpdates.push({ key: 'fk_backend', value: arg || '' });
      patch.backend = arg;
      pushMessage(`Backend: ${arg}`);
      break;
    }
    case 'gateway': {
      storageUpdates.push({ key: 'fk_gateway', value: arg || '' });
      patch.gateway = arg;
      pushMessage(`Gateway: ${arg}`);
      break;
    }
    case 'project': {
      pushMessage('Use the Project selector in the sidebar to switch projects.');
      break;
    }
    case 'context': {
      if (arg === 'on' || arg === 'off') {
        storageUpdates.push({ key: 'fk_show_context', value: arg });
        patch.show_context = arg;
        pushMessage(`Context counter: ${arg}`);
      } else if (arg) {
        storageUpdates.push({ key: 'fk_context_limit', value: arg });
        patch.context_limit = Number(arg);
        pushMessage(`Context limit: ${arg}`);
      } else {
        pushMessage('Usage: /context on|off or /context <limit>');
      }
      break;
    }
    case 'reset': {
      RESET_KEYS.forEach(key => {
        storageUpdates.push({ key, value: null });
      });
      pushMessage('Settings reset to defaults.');
      break;
    }
    case 'restart': {
      pushMessage('Reloading UI to apply changes...');
      plan.reload = true;
      break;
    }
    case 'help': {
      pushMessage(HELP_TEXT);
      break;
    }
    case '':
    default: {
      pushMessage(`Unknown command: /${command}`);
      break;
    }
  }

  if (messages.length > 0) {
    plan.messages = messages;
  }
  if (storageUpdates.length > 0) {
    plan.storageUpdates = storageUpdates;
  }
  if (Object.keys(patch).length > 0) {
    plan.patch = patch;
  }

  return plan;
}

export async function handleSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<boolean> {
  const plan = parseSlashCommand(input);
  if (!plan) {
    return false;
  }

  plan.messages?.forEach(message => {
    context.alert(message);
  });

  plan.storageUpdates?.forEach(({ key, value }) => {
    if (value === null) {
      context.removeItem(key);
    } else {
      context.setItem(key, value);
    }
  });

  if (plan.patch && Object.keys(plan.patch).length > 0) {
    try {
      await context.pushRuntimeConfig(plan.patch);
    } catch (error) {
      // Runtime config updates are best-effort. Ignore transport errors to match existing UX.
    }
  }

  if (plan.reload) {
    context.reload();
  }

  return true;
}
