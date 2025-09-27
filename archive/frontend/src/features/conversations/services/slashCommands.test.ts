import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseSlashCommand } from './slashCommands';

describe('parseSlashCommand', () => {
  it('returns null for non slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull();
  });

  it('parses model command', () => {
    const plan = parseSlashCommand('/model gpt-4');
    expect(plan).toEqual({
      handled: true,
      messages: ['Model set to: gpt-4'],
      storageUpdates: [{ key: 'fk_model', value: 'gpt-4' }],
      patch: { model: 'gpt-4' },
    });
  });

  it('parses context toggle', () => {
    const plan = parseSlashCommand('/context on');
    expect(plan).toEqual({
      handled: true,
      messages: ['Context counter: on'],
      storageUpdates: [{ key: 'fk_show_context', value: 'on' }],
      patch: { show_context: 'on' },
    });
  });

  it('parses context limit', () => {
    const plan = parseSlashCommand('/context 15');
    expect(plan).toEqual({
      handled: true,
      messages: ['Context limit: 15'],
      storageUpdates: [{ key: 'fk_context_limit', value: '15' }],
      patch: { context_limit: 15 },
    });
  });

  it('returns usage hint for missing context argument', () => {
    const plan = parseSlashCommand('/context');
    expect(plan).toEqual({
      handled: true,
      messages: ['Usage: /context on|off or /context <limit>'],
    });
  });

  it('parses reset command', () => {
    const plan = parseSlashCommand('/reset');
    expect(plan).toEqual({
      handled: true,
      messages: ['Settings reset to defaults.'],
      storageUpdates: [
        { key: 'fk_model', value: null },
        { key: 'fk_temperature', value: null },
        { key: 'fk_top_p', value: null },
        { key: 'fk_backend', value: null },
        { key: 'fk_gateway', value: null },
        { key: 'fk_show_context', value: null },
        { key: 'fk_context_limit', value: null },
      ],
    });
  });

  it('parses restart command', () => {
    const plan = parseSlashCommand('/restart');
    expect(plan).toEqual({
      handled: true,
      messages: ['Reloading UI to apply changes...'],
      reload: true,
    });
  });

  it('parses help command', () => {
    const plan = parseSlashCommand('/help');
    expect(plan).toEqual({
      handled: true,
      messages: [HELP_TEXT],
    });
  });

  it('handles unknown commands', () => {
    const plan = parseSlashCommand('/unknown arg');
    expect(plan).toEqual({
      handled: true,
      messages: ['Unknown command: /unknown'],
    });
  });
});
