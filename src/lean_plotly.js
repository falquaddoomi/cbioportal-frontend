// Create a file that will configure your custom bundle - e.g. lean_plotly.js
const Plotly = require('plotly.js/lib/core');

// Load in the trace types you need e.g. pie, and choropleth
Plotly.register([
    // eslint-disable-next-line global-require
    require('plotly.js/lib/bar')
]);

// Export the custom build
module.exports = Plotly;
