import { defineAthenaConfig } from './config/schema';

export default defineAthenaConfig({
  network: {
    name: 'Athena RBBS Network',
    maxRegisteredBoards: 20,
    heartbeatInterval: 60_000,
    heartbeatTimeout: 180_000,
    requireApproval: true,
  },

  supabase: {
    url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
    anonKey: process.env.SUPABASE_ANON_KEY || 'placeholder',
  },

  admin: {
    networkSysOp: process.env.NETWORK_SYSOP || 'ChrisR',
    contactEmail: process.env.CONTACT_EMAIL,
  },
});
