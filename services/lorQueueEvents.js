const EventEmitter = require("events");

const LOR_QUEUE_CHANGED = "lor-queue:changed";
const lorQueueEmitter = new EventEmitter();

lorQueueEmitter.setMaxListeners(200);

const emitLorQueueChanged = (payload = {}) => {
  const event = {
    ...payload,
    emittedAt: new Date().toISOString()
  };

  setImmediate(() => {
    lorQueueEmitter.emit(LOR_QUEUE_CHANGED, event);
  });
};

const subscribeLorQueueChanges = (listener) => {
  lorQueueEmitter.on(LOR_QUEUE_CHANGED, listener);
  return () => lorQueueEmitter.off(LOR_QUEUE_CHANGED, listener);
};

module.exports = {
  emitLorQueueChanged,
  subscribeLorQueueChanges
};
