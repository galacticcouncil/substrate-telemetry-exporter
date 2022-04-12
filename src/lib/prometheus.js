const { register } = require('prom-client');
const promClient = require('prom-client');


module.exports = {
  startCollection: () =>{
    console.log('Starting the collection of metrics, the metrics are available on /metrics');
    promClient.collectDefaultMetrics();
  },

  injectMetricsRoute: (app) => {
    app.get('/metrics', (req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(register.metrics());
    });
  },


  timeToFinality: new promClient.Histogram({
    name: 'substrate_telemetry_block_finality_seconds',
    help: 'Time from block production to block finalized',
    buckets: [10, 14, 18, 22, 26, 30],
    labelNames: ['chain']
  }),

  bestBlock: new promClient.Gauge({
    name: 'substrate_telemetry_best_block',
    help: 'Maximum height of the chain',
    labelNames: ['chain']
  }),

  bestFinalized: new promClient.Gauge({
    name: 'substrate_telemetry_best_finalized',
    help: 'Highest finalized block',
    labelNames: ['chain']
  }),

  blockProductionTime: new promClient.Histogram({
    name: 'substrate_telemetry_block_production_seconds',
    help: 'Time to produce a block as reported by telemetry',
    labelNames: ['chain']
  }),

  blockPropagationTime: new promClient.Histogram({
    name: 'substrate_telemetry_block_propagation_seconds',
    help: 'Time to receive a block as reported by telemetry',
    labelNames: ['chain','name', 'version', 'node', 'runtime', 'arch', 'id']
  }),
}
