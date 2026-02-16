const cron = require('node-cron');
const { updateAllGroupSheetsMapping } = require('../services/mapping');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running mapping update job...');
  try {
    await updateAllGroupSheetsMapping();
    console.log('Mapping update completed');
  } catch (error) {
    console.error('Mapping update failed:', error);
  }
});