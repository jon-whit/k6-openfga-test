# k6-openfga-test
An OpenFGA test project which uses [k6](https://k6.io) for benchmark and load testing purposes.



## Usage
This project uses webpack, babel and corejs to bundle the test artifacts into a single test script which can be run by k6.

```
npm install .
npm run-script webpack

# local execution (all scenarios)
k6 run build/app.bundle.js

# docker execution (all scenarios)
docker run -v $(pwd)/build:/build loadimpact/k6 run /build/app.bundle.js 

# local execution (specific scenario)
k6 run --env scenario=<scenario> build/app.bundle.js
```

For example, to run the `constant_rps` scenario (which generates constant load at the specified request rate) you would run

```
k6 run --env scenario=constant_rpc build/app.bundle.js
```

## Scenarios
Scenarios configure how virtual users and test iterations are scheduled. k6 scenarios allow us to model diverse workloads, or traffic patterns for various test cases. For more information on scenarios take a look at the official [k6 scenarios documentation](https://k6.io/docs/using-k6/scenarios/).

| Scenario Name | Settings                                                                                                                 | Description                                          |
|---------------|--------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| constant_rps  | executor: 'constant-arrival-rate'<br>rate: 1500<br>timeUnit: '1s'<br>duration: '1m'<br>preAllocatedVUs: 20<br>maxVUs: 40 | Runs the test target at 1500 rps for 1m in duration. |