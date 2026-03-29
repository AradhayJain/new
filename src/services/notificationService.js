/**
 * SSE Notification Service
 * Manages connected admin clients and broadcasts events
 */

let clients = [];

/**
 * Add a new SSE client
 * @param {Object} res Express Response object
 */
const addClient = (res) => {
  clients.push(res);

  // When connection closes, remove client from array
  res.on("close", () => {
    clients = clients.filter((client) => client !== res);
  });
};

/**
 * Broadcast an event to all connected SSE clients
 * @param {Object} data JSON data to broadcast
 */
const broadcast = (data) => {
  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
};

module.exports = {
  addClient,
  broadcast,
};
