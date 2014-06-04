/**
 * @module channel
 */

var hubiquitus = require('hubiquitus-core');
var logger = hubiquitus.logger('hubiquitus:addons:channel');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('lodash');

/**
 * Create a channel from an implementation
 * @param id {string} channel id
 * @param [channelImpl] {object} implementation
 * @returns {Channel}
 */
exports.createChannel = function (id, channelImpl) {
  if (_.isObject(channelImpl)) {
    if (!_.isFunction(channelImpl.subscribers) ||
        !_.isFunction(channelImpl.onSubscribe) ||
        !_.isFunction(channelImpl.onUnsubscribe)) {
      logger.warn('invalid channel implementation provided; use default implementation instead (in memory)');
      channelImpl = createInMemoryChannel();
    }
  } else {
    channelImpl = createInMemoryChannel();
  }
  return new Channel(id, channelImpl);
};

/**
 * Remove a channel
 * @param id {string} channel to remove aid
 */
exports.removeChannel = function (id) {
  hubiquitus.removeActor(id);
  hubiquitus.removeActor(id + '#subscribe');
  hubiquitus.removeActor(id + '#unsubscribe');
};

/**
 * Channel constructor
 * @param id {string} channel id
 * @param [channelImpl] {object} implementation
 * @constructor
 */
function Channel(id, channelImpl) {
  EventEmitter.call(this);
  this.setMaxListeners(0);

  var _this = this;

  this.id = id;

  /* subsribers management */

  var subscribers = channelImpl.subscribers;
  var onSubscribe = channelImpl.onSubscribe;
  var onUnsubscribe = channelImpl.onUnsubscribe;
  hubiquitus.monitoring.on('cache actor removed', function (aid) {
    onUnsubscribe(aid);
  });

  /* channel actors management */

  hubiquitus.addActor(this.id, publish);
  hubiquitus.addActor(this.id + '#subscribe', subscribe);
  hubiquitus.addActor(this.id + '#unsubscribe', unsubscribe);

  function publish(req) {
    _this.emit('onMessage', req.from, req.content);
    var ctx = this;
    _.forEach(subscribers(), function (item) {
      ctx.send(item, req.content);
    });
  }

  function subscribe(req) {
    onSubscribe(req.from, function (err) {
      req.reply(err);
    });
  }

  function unsubscribe(req) {
    onUnsubscribe(req.from, function (err) {
      req.reply(err);
    });
  }
}

util.inherits(Channel, EventEmitter);

/* in memory channel implementation */

function createInMemoryChannel() {
  var inMemorySubscribers = [];

  function onSubscribe(aid, cb) {
    if (!_.contains(inMemorySubscribers, aid)) {
      inMemorySubscribers.push(aid);
    }
    cb && cb();
  }

  function onUnsubscribe(aid, cb) {
    _.remove(inMemorySubscribers, function (item) {
      return aid === item;
    });
    cb && cb();
  }

  return {
    subscribers: function subscribers() { return inMemorySubscribers; },
    onSubscribe: onSubscribe,
    onUnsubscribe: onUnsubscribe
  };
}
