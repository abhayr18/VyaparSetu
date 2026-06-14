/**
 * Lightweight logger utility.
 * Wraps console with log levels and timestamps.
 * Replace with winston/pino in production if needed.
 */

const LOG_LEVELS = { info: 0, warn: 1, error: 2 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

const logger = {
  info(message) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) {
      console.log(formatMessage('info', message));
    }
  },
  warn(message) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message));
    }
  },
  error(message) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) {
      console.error(formatMessage('error', message));
    }
  },
};

module.exports = logger;
