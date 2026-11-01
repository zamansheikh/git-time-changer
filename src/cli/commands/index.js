'use strict';

// Command registry: name -> { aliases, run(opts, positionals) }.

module.exports = {
  calendar: { aliases: ['cal', 'show', 'gaps'], ...require('./calendar') },
  fill: { aliases: [], ...require('./fill') },
  random: { aliases: [], ...require('./random') },
  date: { aliases: ['on'], ...require('./date') },
};
