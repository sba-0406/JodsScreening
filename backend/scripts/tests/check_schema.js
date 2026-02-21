
const mongoose = require('mongoose');
const Job = require('./models/Job');

console.log('--- Job Schema Status Field ---');
const statusPath = Job.schema.path('status');
console.log('Type:', statusPath.instance);
console.log('Enum:', statusPath.enumValues);
console.log('Default:', statusPath.defaultValue);
console.log('Default (raw):', Job.schema.tree.status.default);
process.exit();
