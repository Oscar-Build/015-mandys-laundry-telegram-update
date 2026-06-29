'use strict';

const logger = require('../../services/Logger');
const healthMonitor = require('../../services/HealthMonitor');

async function run() {
  logger.debug('Running health check job');
  return healthMonitor.runAllChecks();
}

module.exports = { run };
