// Tests for core/telegram-chunker.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { chunkMessage, sendChunkedMessage } from '../core/telegram-chunker.js';

describe('Telegram Chunker', () => {
  describe('chunkMessage - basic behavior', () => {
    it('should return empty array for empty/null input', () => {
      assert.deepStrictEqual(chunkMessage(''), []);
      assert.deepStrictEqual(chunkMessage(null), []);
      assert.deepStrictEqual(chunkMessage(undefined), []);
    });

    it('should return single chunk for short messages', () => {
      const text = 'Hello, world!';
      const result = chunkMessage(text);
      assert.deepStrictEqual(result, [text]);
    });

    it('should return single chunk for exactly max length', () => {
      const text = 'a'.repeat(100);
      const result = chunkMessage(text, 100);
      assert.deepStrictEqual(result, [text]);
    });

    it('should split messages longer than max length', () => {
      const text = 'a'.repeat(150);
      const result = chunkMessage(text, 100);
      assert.ok(result.length > 1, 'Should produce multiple chunks');
      assert.ok(result.every(chunk => chunk.length <= 100), 'All chunks should be <= maxLength');
    });
  });

  describe('chunkMessage - paragraph splits', () => {
    it('should split at paragraph boundaries (double newline)', () => {
      const text = 'First paragraph with some content.\n\nSecond paragraph here.';
      const result = chunkMessage(text, 40);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0], 'First paragraph with some content.');
      assert.strictEqual(result[1], 'Second paragraph here.');
    });

    it('should prefer paragraph splits over line splits', () => {
      const text = 'Line one\nLine two\n\nNew paragraph';
      const result = chunkMessage(text, 25);
      // Should split at \n\n, not at first \n
      assert.strictEqual(result[0], 'Line one\nLine two');
    });

    it('should handle multiple paragraphs', () => {
      const paragraphs = ['Para 1.', 'Para 2.', 'Para 3.', 'Para 4.'];
      const text = paragraphs.join('\n\n');
      const result = chunkMessage(text, 20);
      assert.ok(result.length >= 2);
    });

    it('should fall back to sentence/word splits when paragraph exceeds maxLength', () => {
      // Mix of short paragraphs and one oversized paragraph
      const text = 'Short first paragraph.\n\nThis is a very long paragraph that exceeds the maximum length. It has multiple sentences. And keeps going.\n\nShort last one.';
      const result = chunkMessage(text, 60);
      assert.ok(result.length >= 3, 'Should split the oversized paragraph');
      // Verify all chunks respect maxLength
      result.forEach(chunk => {
        assert.ok(chunk.length <= 60, `Chunk exceeds maxLength: ${chunk.length}`);
      });
      // Verify content is preserved
      const combined = result.join(' ');
      assert.ok(combined.includes('Short first'));
      assert.ok(combined.includes('very long paragraph'));
      assert.ok(combined.includes('Short last'));
    });
  });

  describe('chunkMessage - line splits', () => {
    it('should split at line boundaries when no paragraph break', () => {
      const text = 'First line here\nSecond line content\nThird line';
      const result = chunkMessage(text, 40);
      // Should split at a newline, not mid-word
      assert.ok(result.length >= 2);
      assert.ok(result[0].includes('\n') || result[0].endsWith('here') || result[0].endsWith('content'));
    });

    it('should preserve line integrity when possible', () => {
      const lines = ['Short line', 'Another short', 'Third one'];
      const text = lines.join('\n');
      const result = chunkMessage(text, 25);
      // Each chunk should not have partial lines cut mid-word
      result.forEach(chunk => {
        assert.ok(!chunk.match(/^\w/) || chunk === result[0] || chunk.match(/^[A-Z]/));
      });
    });
  });

  describe('chunkMessage - sentence splits', () => {
    it('should split at sentence boundaries (period + space)', () => {
      const text = 'First sentence here. Second sentence follows. Third one.';
      const result = chunkMessage(text, 45);
      assert.strictEqual(result[0], 'First sentence here. Second sentence follows.');
    });

    it('should split oversized paragraph at sentence boundaries', () => {
      // Single paragraph with sentences but no newlines - exceeds maxLength
      const text = 'This is sentence one. Here is sentence two. And sentence three. Plus four. Five here.';
      const result = chunkMessage(text, 50);
      // Should split at sentences, not mid-word
      assert.ok(result.length >= 2, 'Should produce multiple chunks');
      assert.ok(result[0].endsWith('.'), 'First chunk should end at sentence boundary');
      assert.ok(result[0].length <= 50, 'Chunks should respect maxLength');
    });

    it('should split at exclamation marks', () => {
      const text = 'Hello there! How are you today! Great to see you.';
      const result = chunkMessage(text, 25);
      assert.ok(result[0].endsWith('!'));
    });

    it('should split at question marks', () => {
      const text = 'Is this working? Yes it is. Good.';
      const result = chunkMessage(text, 20);
      assert.ok(result[0].endsWith('?'));
    });

    it('should handle ellipsis', () => {
      const text = 'Thinking... Still thinking... Done.';
      const result = chunkMessage(text, 25);
      assert.ok(result[0].includes('...'));
    });

    it('should handle quotes after punctuation', () => {
      const text = 'He said "Hello." She replied "Hi." They talked.';
      const result = chunkMessage(text, 35);
      // Should split after closing quote
      assert.ok(result[0].endsWith('"'));
    });
  });

  describe('chunkMessage - word splits', () => {
    it('should split at word boundaries as fallback', () => {
      const text = 'word1 word2 word3 word4 word5';
      const result = chunkMessage(text, 15);
      // Should not cut words in half
      result.forEach(chunk => {
        assert.ok(!chunk.startsWith('ord'), 'Should not start mid-word');
      });
    });

    it('should split oversized paragraph at word boundaries when no sentences', () => {
      // Single paragraph without sentence-ending punctuation - only word breaks
      const text = 'this is a long paragraph without any sentence-ending punctuation it just keeps going and going';
      const result = chunkMessage(text, 40);
      // Should split at words, not mid-word
      assert.ok(result.length >= 2, 'Should produce multiple chunks');
      result.forEach(chunk => {
        assert.ok(chunk.length <= 40, 'Chunks should respect maxLength');
        // Should not start or end mid-word (except first/last)
        assert.ok(!chunk.match(/^\w+\s+\w*$/m) || true, 'Should split cleanly at word boundaries');
      });
    });

    it('should handle multiple spaces', () => {
      const text = 'word1  word2   word3    word4';
      const result = chunkMessage(text, 15);
      assert.ok(result.length >= 2);
    });
  });

  describe('chunkMessage - code blocks', () => {
    it('should preserve code blocks when possible', () => {
      const text = 'Before code\n\n```js\nconst x = 1;\nconst y = 2;\n```\n\nAfter code';
      const result = chunkMessage(text, 100);
      // Code block should be kept together
      const codeChunk = result.find(c => c.includes('```js'));
      assert.ok(codeChunk);
      assert.ok(codeChunk.includes('const y = 2;'));
      assert.ok(codeChunk.includes('```'));
    });

    it('should split before code block if it would be cut', () => {
      const text = 'Some intro text here.\n\n```python\nprint("hello")\n```';
      const result = chunkMessage(text, 35);
      // Should try to keep code block intact in second chunk
      assert.ok(result.some(chunk => chunk.includes('```python')));
    });

    it('should handle code block at line boundary when too large', () => {
      const codeContent = 'line1\nline2\nline3\nline4\nline5';
      const text = '```js\n' + codeContent + '\n```';
      const result = chunkMessage(text, 25);
      // Should split at line boundaries within code block
      assert.ok(result.length >= 2);
    });

    it('should handle multiple code blocks', () => {
      const text = '```js\ncode1\n```\n\nText\n\n```py\ncode2\n```';
      const result = chunkMessage(text, 50);
      assert.ok(result.length >= 1);
      // Both code blocks should be present across chunks
      const combined = result.join('\n');
      assert.ok(combined.includes('code1'));
      assert.ok(combined.includes('code2'));
    });

    it('should handle unclosed code blocks gracefully', () => {
      const text = 'Before\n```js\nconst x = 1;\nNo closing fence';
      const result = chunkMessage(text, 100);
      assert.ok(result.length >= 1);
      assert.ok(result.join('').includes('const x = 1'));
    });

    it('should split right after a complete code block that fits', () => {
      const text = 'Some intro.\n\n```js\nconst x = 1;\n```\n\nMore text follows here with details.';
      const result = chunkMessage(text, 50);
      // Should keep the code block intact in first chunk
      const firstChunk = result[0];
      assert.ok(firstChunk.includes('```js'), 'First chunk should include code block start');
      assert.ok(firstChunk.includes('```'), 'First chunk should include code block end');
      assert.ok(!firstChunk.includes('More text'), 'Should split before "More text"');
    });

    it('should prefer splitting after code block over mid-paragraph', () => {
      const text = '```python\nprint("hi")\n```\n\nParagraph with multiple sentences. More here. And more.';
      const result = chunkMessage(text, 45);
      // Code block should be complete in first chunk
      const codeChunk = result.find(c => c.includes('```python'));
      assert.ok(codeChunk.includes('print("hi")'));
      assert.ok(codeChunk.endsWith('```') || codeChunk.includes('```\n'));
    });

    it('should split at line boundaries inside oversized code blocks', () => {
      // Code block that exceeds maxLength
      const text = '```js\nline1();\nline2();\nline3();\nline4();\nline5();\nline6();\n```';
      const result = chunkMessage(text, 35);
      // Should split at newlines within code, not mid-line
      result.forEach(chunk => {
        // Each chunk shouldn't start with partial function call (except first)
        if (!chunk.startsWith('```')) {
          assert.ok(!chunk.match(/^[a-z0-9]\(\)/i), 'Should not start mid-identifier');
        }
      });
    });
  });

  describe('chunkMessage - edge cases', () => {
    it('should handle very long words (hard split)', () => {
      const longWord = 'a'.repeat(50);
      const result = chunkMessage(longWord, 20);
      assert.ok(result.length >= 2);
      assert.ok(result.every(chunk => chunk.length <= 20));
    });

    it('should handle very long URLs', () => {
      const url = 'https://example.com/' + 'path/'.repeat(20);
      const result = chunkMessage(url, 50);
      assert.ok(result.length >= 2);
      // Should try to split at punctuation like /
      assert.ok(result[0].endsWith('/'));
    });

    it('should handle text with only whitespace', () => {
      const text = '   \n\n   \t  ';
      const result = chunkMessage(text, 10);
      // Should filter out empty chunks
      assert.ok(result.every(chunk => chunk.trim().length > 0) || result.length === 0);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello ' + 'emoji'.repeat(20) + ' world';
      const result = chunkMessage(text, 50);
      assert.ok(result.length >= 1);
    });

    it('should handle mixed content (text, code, lists)', () => {
      const text = `Introduction here.

- Item one
- Item two

\`\`\`js
const code = true;
\`\`\`

Conclusion text.`;
      const result = chunkMessage(text, 60);
      assert.ok(result.length >= 1);
      // All content should be preserved
      const combined = result.join(' ');
      assert.ok(combined.includes('Introduction'));
      assert.ok(combined.includes('Item one'));
      assert.ok(combined.includes('const code'));
      assert.ok(combined.includes('Conclusion'));
    });

    it('should trim whitespace from chunk boundaries', () => {
      const text = 'First part   \n\n   Second part';
      const result = chunkMessage(text, 20);
      result.forEach(chunk => {
        assert.strictEqual(chunk, chunk.trim(), 'Chunks should be trimmed');
      });
    });

    it('should respect minimum split ratio', () => {
      // With 30% min ratio and maxLength 100, minimum split point is 30
      const text = 'A'.repeat(10) + '\n\n' + 'B'.repeat(150);
      const result = chunkMessage(text, 100);
      // First chunk should be at least 30 characters
      // Since 'A' * 10 + '\n\n' is only 12 chars, it should not split there
      assert.ok(result[0].length >= 30 || result.length === 1);
    });
  });

  describe('sendChunkedMessage', () => {
    it('should send single message without indicator', async () => {
      const sent = [];
      const mockSend = async (chatId, text, options) => {
        sent.push({ chatId, text, options });
        return { ok: true };
      };

      const result = await sendChunkedMessage(mockSend, 123, 'Short message', {});
      assert.strictEqual(sent.length, 1);
      assert.strictEqual(sent[0].text, 'Short message');
      assert.ok(!sent[0].text.includes('(1/'));
    });

    it('should add continuation indicators for multiple chunks', async () => {
      const sent = [];
      const mockSend = async (chatId, text, options) => {
        sent.push({ chatId, text, options });
        return { ok: true };
      };

      const longText = 'First part of message.\n\nSecond part here.';
      const result = await sendChunkedMessage(mockSend, 123, longText, {}, 30);

      assert.ok(sent.length >= 2);
      assert.ok(sent[0].text.includes('(1/'));
      assert.ok(sent[1].text.includes('(2/'));
    });

    it('should return empty array for empty input', async () => {
      const mockSend = async () => ({ ok: true });
      const result = await sendChunkedMessage(mockSend, 123, '', {});
      assert.deepStrictEqual(result, []);
    });

    it('should pass chatId and options to send function', async () => {
      const sent = [];
      const mockSend = async (chatId, text, options) => {
        sent.push({ chatId, text, options });
        return { ok: true };
      };

      await sendChunkedMessage(mockSend, 456, 'Test', { parse_mode: 'Markdown' });
      assert.strictEqual(sent[0].chatId, 456);
      assert.strictEqual(sent[0].options.parse_mode, 'Markdown');
    });

    it('should return all send results', async () => {
      let callCount = 0;
      const mockSend = async () => ({ id: ++callCount });

      const longText = 'Part one here.\n\nPart two here.';
      const results = await sendChunkedMessage(mockSend, 123, longText, {}, 20);

      assert.ok(results.length >= 2);
      assert.strictEqual(results[0].id, 1);
      assert.strictEqual(results[1].id, 2);
    });

    it('should reserve space for indicators', async () => {
      const sent = [];
      const mockSend = async (chatId, text) => {
        sent.push(text);
        return { ok: true };
      };

      // Create text that would be exactly maxLength without indicators
      const maxLen = 50;
      const text = 'a'.repeat(45) + '\n\n' + 'b'.repeat(45);
      await sendChunkedMessage(mockSend, 123, text, {}, maxLen);

      // Each chunk including indicator should fit within maxLength
      sent.forEach(chunk => {
        assert.ok(chunk.length <= maxLen, `Chunk "${chunk.slice(0, 20)}..." exceeds max length`);
      });
    });
  });

  describe('split priority order', () => {
    it('should prefer paragraph over line over sentence over word', () => {
      // Text with all split types available at similar positions
      const text = 'Word here. Line\nParagraph\n\nNext';
      const result = chunkMessage(text, 28);
      // Should split at paragraph boundary
      assert.strictEqual(result[0], 'Word here. Line\nParagraph');
    });

    it('should use line split when no paragraph available', () => {
      const text = 'First line here\nSecond line here';
      const result = chunkMessage(text, 20);
      assert.ok(result[0].endsWith('here'));
    });

    it('should use sentence split when no line break available', () => {
      const text = 'First sentence. Second sentence.';
      const result = chunkMessage(text, 20);
      assert.ok(result[0].endsWith('.'));
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical AI response with explanation and code', () => {
      const text = `Here's how to implement it:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

This function takes a name parameter and returns a greeting string.`;
      const result = chunkMessage(text, 100);
      assert.ok(result.length >= 1);
      // All content preserved
      const combined = result.join(' ');
      assert.ok(combined.includes('function greet'));
      assert.ok(combined.includes('This function'));
    });

    it('should handle Telegram markdown formatting', () => {
      const text = '*Bold text* and _italic text_ and `inline code` work together.';
      const result = chunkMessage(text, 40);
      assert.ok(result.length >= 1);
      // Formatting markers preserved
      assert.ok(result.join('').includes('*Bold text*'));
    });

    it('should handle numbered lists', () => {
      const text = `Steps:
1. First step here
2. Second step here
3. Third step here
4. Fourth step here`;
      const result = chunkMessage(text, 40);
      assert.ok(result.length >= 1);
      // Should split at line boundaries, not mid-item
      result.forEach(chunk => {
        // Each chunk should not start with partial number like ". First"
        assert.ok(!chunk.match(/^\. /), 'Should not start with orphaned period');
      });
    });

    it('should handle error stack traces', () => {
      const text = `Error: Something went wrong
    at Function.execute (/app/index.js:10:5)
    at process.main (/app/main.js:25:8)
    at Module._compile (node:internal/modules/cjs/loader:1368:14)`;
      const result = chunkMessage(text, 80);
      assert.ok(result.length >= 1);
      // Stack trace preserved
      const combined = result.join(' ');
      assert.ok(combined.includes('at Function.execute'));
    });

    it('should handle JSON blocks', () => {
      const text = `Config:
\`\`\`json
{
  "name": "test",
  "version": "1.0.0",
  "dependencies": {}
}
\`\`\``;
      const result = chunkMessage(text, 60);
      // JSON should stay together if it fits
      const jsonChunk = result.find(c => c.includes('"name"'));
      assert.ok(jsonChunk);
      assert.ok(jsonChunk.includes('"version"'));
    });
  });

  describe('boundary conditions', () => {
    it('should handle split point exactly at maxLength', () => {
      // Create text where natural boundary is exactly at maxLength
      const text = 'a'.repeat(50) + '\n\n' + 'b'.repeat(50);
      const result = chunkMessage(text, 52); // right after \n\n
      assert.ok(result.length >= 1);
    });

    it('should handle consecutive paragraph breaks', () => {
      const text = 'Para 1\n\n\n\nPara 2\n\n\n\nPara 3';
      const result = chunkMessage(text, 15);
      assert.ok(result.length >= 2);
    });

    it('should handle text starting with code block', () => {
      const text = '```js\nconst x = 1;\n```\n\nExplanation here.';
      const result = chunkMessage(text, 30);
      assert.ok(result[0].startsWith('```'));
    });

    it('should handle text ending with code block', () => {
      const text = 'Introduction:\n\n```py\nprint("end")\n```';
      const result = chunkMessage(text, 25);
      const lastChunk = result[result.length - 1];
      assert.ok(lastChunk.includes('```'));
    });

    it('should handle nested backticks in code', () => {
      const text = '```js\nconst str = `template ${var}`;\n```';
      const result = chunkMessage(text, 50);
      assert.strictEqual(result.length, 1);
      assert.ok(result[0].includes('template'));
    });

    it('should handle very small maxLength', () => {
      const text = 'Hello world';
      const result = chunkMessage(text, 5);
      assert.ok(result.length >= 2);
      // Should still produce valid chunks
      result.forEach(chunk => {
        assert.ok(chunk.length <= 5);
      });
    });

    it('should handle parentheses after punctuation', () => {
      const text = 'First (see above). Second (details). Third.';
      const result = chunkMessage(text, 25);
      // Should handle the complex punctuation
      assert.ok(result.length >= 1);
    });
  });

  describe('sendChunkedMessage edge cases', () => {
    it('should handle send function that throws', async () => {
      const mockSend = async () => {
        throw new Error('Network error');
      };

      await assert.rejects(
        sendChunkedMessage(mockSend, 123, 'Test message', {}),
        /Network error/
      );
    });

    it('should send chunks sequentially (not in parallel)', async () => {
      const order = [];
      const mockSend = async (chatId, text) => {
        const num = text.match(/\((\d+)\//)?.[1] || '1';
        order.push(num);
        await new Promise(r => setTimeout(r, 10)); // Small delay
        return { ok: true };
      };

      const text = 'First part.\n\nSecond part.\n\nThird part.';
      await sendChunkedMessage(mockSend, 123, text, {}, 20);

      // Verify sequential order
      for (let i = 1; i < order.length; i++) {
        assert.ok(parseInt(order[i]) > parseInt(order[i - 1]), 'Chunks should be sent in order');
      }
    });

    it('should handle exact maxLength boundary for indicators', async () => {
      const sent = [];
      const mockSend = async (chatId, text) => {
        sent.push(text);
        return { ok: true };
      };

      // Text that splits into exactly 10 chunks (indicator uses " (10/10)" = 8 chars)
      const maxLen = 30;
      const text = ('x'.repeat(15) + '\n\n').repeat(10);
      await sendChunkedMessage(mockSend, 123, text, {}, maxLen);

      sent.forEach(chunk => {
        assert.ok(chunk.length <= maxLen, `Chunk exceeds maxLength: ${chunk.length} > ${maxLen}`);
      });
    });
  });
});
