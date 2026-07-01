'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');
const { generateVideoScript } = require('../../services/VideoScriptGenerator');

const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'video-scripts');

function esc(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function run() {
  logger.info('Generating daily video script');

  try {
    if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

    const script = await generateVideoScript();

    // Save to file
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}-video-script.json`;
    fs.writeFileSync(path.join(SCRIPTS_DIR, filename), JSON.stringify(script, null, 2));

    // Send to Telegram
    const msg = [
      `🎬 <b>Today's Video Script Ready</b>`,
      ``,
      `📌 <b>Topic:</b> ${esc(script.topic)}`,
      `🪝 <b>Hook:</b> <i>${esc(script.hook)}</i>`,
      `⏱ <b>Length:</b> ~${script.estimatedSeconds}s`,
      ``,
      `📝 <b>Script:</b>`,
      esc(script.script),
      ``,
      `🏷 ${esc((script.hashtags || []).join(' '))}`,
      ``,
      `🎥 <b>Visual Notes:</b> ${esc(script.visualNotes)}`,
    ].join('\n');

    // Split if too long (Telegram limit 4096 chars)
    if (msg.length <= 4096) {
      await telegram.send(msg);
    } else {
      const header = [
        `🎬 <b>Today's Video Script Ready</b>`,
        `📌 <b>Topic:</b> ${esc(script.topic)}`,
        `🪝 <b>Hook:</b> <i>${esc(script.hook)}</i>`,
        `⏱ ~${script.estimatedSeconds}s`,
      ].join('\n');
      await telegram.send(header);
      await telegram.send(`📝 <b>Script:</b>\n\n${esc(script.script)}`);
    }

    logger.info('Video script sent to Telegram', { topic: script.topic, file: filename });
  } catch (err) {
    logger.error('Video script job failed', { error: err.message });
    await telegram.send(`⚠️ <b>Video Script Failed</b>\n\n❗ ${err.message}`).catch(() => {});
    throw err;
  }
}

module.exports = { run };
