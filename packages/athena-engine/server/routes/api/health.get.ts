import { getActivePeerCount } from '../../utils/peers';

export default defineEventHandler(() => {
  return {
    service: 'athena-engine',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    currentUsers: getActivePeerCount(),
  };
});
