'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, error, ...meta }) => {
  let line = `${ts} [${level}] ${message}`;
  if (error) line += ` | error: ${error}`;
  const extras = Object.keys(meta).filter(k => !['service'].includes(k));
  if (extras.length) line += ` | ${extras.map(k => `${k}=${JSON.stringify(meta[k])}`).join(' ')}`;
  return line;
});

const logger = winston.createLogger({
  level: config.app.logLevel,
  defaultMeta: { service: config.app.name },
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), 'logs'),
      filename: 'automation-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      format: combine(timestamp(), json()),
    }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), 'logs'),
      filename: 'errors-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      level: 'error',
      format: combine(timestamp(), json()),
    }),
  ],
});

module.exports = logger;
