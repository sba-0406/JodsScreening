
const app = require('./app');
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`ScenarioSim server running on port ${PORT}`);
});
// restart
