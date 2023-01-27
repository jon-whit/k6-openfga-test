# k6-openfga-test
An OpenFGA test project which uses [k6](https://k6.io) for benchmark and load testing purposes.



## Usage
This project uses webpack, babel and corejs to bundle the test artifacts into a single test script which can be run by k6.

```
npm install .
npm run-script webpack

# local execution
k6 run build/app.bundle.js

# docker execution
docker run -v $(pwd)/build:/build loadimpact/k6 run /build/app.bundle.js 
```