const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated-js/client.js');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
module.exports = new PrismaClient({ adapter });
