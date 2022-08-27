const shimmer = require('../../../../../shimmer')
module.exports = function (commander, agent, { version, enabled }) {
  shimmer.wrap(commander, 'attachCommands', function(original) {
    return function wrappedAttachCommands ({BaseClass, commands, executor}) {
      if(BaseClass.name === 'RedisClient') {
        return original.apply(this, [{BaseClass, commands, executor:async function(){
          for (const [name, command] of Object.entries(commands)) {
            BaseClass.prototype[name] = function (...args) {
                return executor.call(this, command, args, name);
            };
          }
        }}])
      }
      original.apply(this, arguments)
    }
  })

  return commander
};
