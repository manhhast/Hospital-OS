import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { telegramManager } from '../server/telegramBot';

describe('Telegram Bare Menu Command Prompts', () => {
  it('does not attach force_reply on /hoi or /nho prompts so Telegram never pins a sticky reply bar', async () => {
    const calls: Array<{ chatId: string | number; text: string; extra?: any }> = [];
    const origSendMessage = telegramManager.sendMessage.bind(telegramManager);

    (telegramManager as any).sendMessage = async (
      chatId: string | number,
      rawText: string,
      _tokenOverride?: string,
      extraParams?: any
    ) => {
      calls.push({ chatId, text: rawText, extra: extraParams });
    };

    try {
      await telegramManager.handleIncomingUpdate({
        message: {
          message_id: 101,
          chat: { id: 999001, type: 'private' },
          from: { id: 888001, is_bot: false, first_name: 'Test' },
          text: '/hoi',
        },
      });

      await telegramManager.handleIncomingUpdate({
        message: {
          message_id: 102,
          chat: { id: 999001, type: 'private' },
          from: { id: 888001, is_bot: false, first_name: 'Test' },
          text: '/nho',
        },
      });

      assert.equal(calls.length, 2);
      for (const c of calls) {
        assert.equal(Boolean(c.extra?.reply_markup?.force_reply), false);
        assert.ok(Array.isArray(c.extra?.reply_markup?.inline_keyboard));
      }

      // Clean up pending state
      await telegramManager.handleIncomingUpdate({
        message: {
          message_id: 103,
          chat: { id: 999001, type: 'private' },
          from: { id: 888001, is_bot: false, first_name: 'Test' },
          text: '/huy',
        },
      });
    } finally {
      (telegramManager as any).sendMessage = origSendMessage;
    }
  });
});
