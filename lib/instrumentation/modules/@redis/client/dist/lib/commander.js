const shimmer = require('../../../../../shimmer')
module.exports = function (commander, agent, { version, enabled }) {
  shimmer.wrap(commander, 'attachCommands', function(original) {
    return function wrappedAttachCommands ({BaseClass, commands, executor}) {
      if(BaseClass.name === 'RedisClient') {
        return original.apply(this, [{BaseClass, commands, executor:async function(){
          for (const [name, command] of Object.entries(commands)) {
            BaseClass.prototype[name] = function (...args) {
                const response = executor.call(this, command, args, name);
                // START SPAN HERE and END in a call to response.then
                return response
            };
          }
        }}])
      }
      original.apply(this, arguments)
    }
  })

  return commander
};
