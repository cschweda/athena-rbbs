import { defineAthenaConfig } from './config/schema';

export default defineAthenaConfig({
  network: {
    name: 'Athena RBBS Network',
    maxRegisteredBoards: 20,
    heartbeatInterval: 60_000,
    heartbeatTimeout: 180_000,
    requireApproval: true,
  },

  admin: {
    networkSysOp: process.env.NETWORK_SYSOP || 'ChrisR',
    contactEmail: process.env.CONTACT_EMAIL,
  },
});
