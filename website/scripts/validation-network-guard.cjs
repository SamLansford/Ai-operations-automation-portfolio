// Preloaded only into trusted, source-only validation workers and their Node children.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (typeof options !== 'object') options = {port: options, host: typeof args[1] === 'string' ? args[1] : 'localhost'};
  const host = options?.host || 'localhost', port = Number(options?.port);
  if (options?.path || !['127.0.0.1','localhost','::1'].includes(host) || [3306,33060,5678,8787,11434,4173,4176].includes(port)) {
    const error = new Error('VALIDATION_NETWORK_BLOCKED'); error.code = 'EACCES'; throw error;
  }
  return original.apply(this,args);
};
