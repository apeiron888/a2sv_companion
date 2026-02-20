const cron = require('node-cron');
const { updateAllGroupSheetsMapping } = require('../services/mapping');

const cronEnabled = process.env.MAPPING_CRON_ENABLED !== 'false';
const cronSchedule = process.env.MAPPING_CRON_SCHEDULE || '*/5 * * * *';

if (cronEnabled) {
  // Run on schedule (default: every 5 minutes)
  cron.schedule(cronSchedule, async () => {
    console.log('Running mapping update job...');
    try {
      await updateAllGroupSheetsMapping();
      console.log('Mapping update completed');
    } catch (error) {
      console.error('Mapping update failed:', error);
    }
  });
} else {
  console.log('Mapping cron job disabled via MAPPING_CRON_ENABLED=false');
}