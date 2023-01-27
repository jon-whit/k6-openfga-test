import http from 'k6/http';
import { check } from 'k6';
import { random, chunk } from 'lodash';

let API_BASE_URI = __ENV.API_BASE_URI
if (!API_BASE_URI) {
  API_BASE_URI = "http://localhost:8080"
}

const STORE_ID = __ENV.STORE_ID
if (!STORE_ID) {
    throw new Error("'STORE_ID' env variable must be defined")
}

let TUPLES_PER_WRITE = __ENV.TUPLES_PER_WRITE
if (!TUPLES_PER_WRITE) {
    TUPLES_PER_WRITE = 100
}

let TOTAL_REPOS = __ENV.TOTAL_REPOS;
if (!TOTAL_REPOS) {
    TOTAL_REPOS = 1000;
}

let TOTAL_USERS = __ENV.TOTAL_USERS;
if (!TOTAL_USERS) {
    TOTAL_USERS = 250;
}

let TOTAL_ORGS = __ENV.TOTAL_ORGS;
if (!TOTAL_ORGS) {
    TOTAL_ORGS = 35;
}

const tuples = new Set();
const checks = new Set();

const users = [];
const orgs = {};
const publicRepos = [];  // 20%
const privateRepos = []; // 40% direct association with random users
const groupRepos = [];   // 40% group association with groups

for (let i = 0; i < TOTAL_USERS; i++) {
    users.push(`user:${i.toString()}`);
}
  
for (let i = 0; i < TOTAL_REPOS * .20; i++) {
    publicRepos.push(i.toString());
}

for (let i = 0; i < TOTAL_REPOS * .40; i++) {
    privateRepos.push(i.toString());
}

for (let i = 0; i < TOTAL_REPOS * .40; i++) {
    groupRepos.push(i.toString());
  }

for (let i = 0; i < publicRepos.length; i++) {
    const repo = `repo:${publicRepos[i]}`;
  
    tuples.add({ object: repo , relation: 'reader', user: 'user:*' });
  
    for (let j = 0; j < 5; j++) {
      checks.add({ object: repo, relation: 'reader', user: users[random(0, TOTAL_USERS-1)] });
    }
}

for (let i = 0; i < privateRepos.length; i++) {
    const user = users[random(0, TOTAL_USERS-1)];
  
    tuples.add({ object: `repo:${privateRepos[i]}`, relation: 'writer', user: user });
    checks.add({ object: `repo:${privateRepos[i]}`, relation: 'reader', user: user });
}

for (let i = 0; i < TOTAL_ORGS; i++) {
    const orgName = i.toString();
    orgs[orgName] = { members: [], teams: { security: [] }, repos: [] };

    const totalTeams = random(1, 7); // security always exists

    for (let j = 0; j < totalTeams; j++) {
      const teamName = j.toString();
      orgs[orgName].teams[teamName] = [];

      const totalTeamMembers = random(1, 8);
      for (let k = 0; k < totalTeamMembers; k++) {
        const user = users[random(0,TOTAL_USERS - 1)];
        orgs[orgName].teams[teamName].push(user);
        orgs[orgName].members.push(user);
      }

      orgs[orgName].teams[teamName] = [...new Set(orgs[orgName].teams[teamName])];
    }
    // populate security
    for (let i = 0; i < random(1, 8); i++) {
      const user = users[random(0,TOTAL_USERS - 1)];
      orgs[orgName].teams['security'].push(user);
    }
    const totalRepos = random(1, Math.floor(groupRepos.length/TOTAL_ORGS));
    for (let i = 0; i < totalRepos; i++) {
      const repo = groupRepos[random(0, groupRepos.length - 1)];
      orgs[orgName].repos.push(repo);
    }
    
    orgs[orgName].teams['security'] = [...new Set(orgs[orgName].teams['security'])];
    orgs[orgName].members = [...new Set(orgs[orgName].members)];
    orgs[orgName].repos = [...new Set(orgs[orgName].repos)];
}
  
  // org tuples
Object.keys(orgs).forEach((orgName) => {
    const org = orgs[orgName];
    // security team
    org.repos.forEach((repo) => {
      tuples.add({ user: `org:${orgName}`, relation: 'owner', object: `repo:${orgName}/${repo}`});
    });

    tuples.add({ user: `team:${orgName}/security#member`, relation: 'repo_admin', object: `org:${orgName}`});

    Object.keys(org.teams).forEach((team) => {
      let assignedRepos = [];
      if (team !== 'security') {
        const reposToAssign = random(0, org.repos.length);
        for (let i = 0; i < reposToAssign; i++) {
          const repo = `repo:${orgName}/${org.repos[i]}`;
          assignedRepos.push(repo);
        }
        assignedRepos = [...new Set(assignedRepos)];
        assignedRepos.forEach((repo) => {
          tuples.add({
            user: `team:${orgName}/${team}#member`,
            relation: 'admin',
            object: repo
          });
        });
      }
      org.teams[team].forEach((member) => {
        tuples.add({ user: member, relation: 'member', object: `team:${orgName}/${team}`});
        if (team === 'security') {
          org.repos.forEach((repo) => {
            checks.add({user: member, relation: 'admin', object: `repo:${orgName}/${repo}`});
          });
        } else {
          assignedRepos.forEach((repo) => {
            checks.add({user: member, relation: 'writer', object: repo});
          });
        }
      });
    });
});

export const options = {
    setupTimeout: '2m',
    teardownTimeout: '2m',
    vus: 1,
    duration: '10s',
}

const headers = { 'Content-Type': 'application/json' };

export function setup() {

  let res = http.post(`${API_BASE_URI}/stores/${STORE_ID}/authorization-models`, JSON.stringify({
    "type_definitions": [
      {
        "type": "user",
        "relations": {}
      },
      {
        "type": "repo",
        "relations": {
          "owner": {
            "this": {}
          },
          "admin": {
            "union": {
              "child": [
                {
                  "this": {}
                },
                {
                  "tupleToUserset": {
                    "tupleset": {
                      "object": "",
                      "relation": "owner"
                    },
                    "computedUserset": {
                      "object": "",
                      "relation": "repo_admin"
                    }
                  }
                }
              ]
            }
          },
          "writer": {
            "union": {
              "child": [
                {
                  "this": {}
                },
                {
                  "computedUserset": {
                    "object": "",
                    "relation": "admin"
                  }
                },
                {
                  "tupleToUserset": {
                    "tupleset": {
                      "object": "",
                      "relation": "owner"
                    },
                    "computedUserset": {
                      "object": "",
                      "relation": "repo_writer"
                    }
                  }
                }
              ]
            }
          },
          "reader": {
            "union": {
              "child": [
                {
                  "this": {}
                },
                {
                  "computedUserset": {
                    "object": "",
                    "relation": "writer"
                  }
                },
                {
                  "tupleToUserset": {
                    "tupleset": {
                      "object": "",
                      "relation": "owner"
                    },
                    "computedUserset": {
                      "object": "",
                      "relation": "repo_reader"
                    }
                  }
                }
              ]
            }
          }
        },
        "metadata": {
          "relations": {
            "owner": {
              "directly_related_user_types": [
                {
                  "type": "org"
                }
              ]
            },
            "admin": {
              "directly_related_user_types": [
                {
                  "type": "user"
                },
                {
                  "type": "team",
                  "relation": "member"
                }
              ]
            },
            "writer": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            },
            "reader": {
              "directly_related_user_types": [
                {
                  "type": "user"
                },
                {
                  "type": "user",
                  "wildcard": {}
                }
              ]
            }
          }
        }
      },
      {
        "type": "team",
        "relations": {
          "member": {
            "this": {}
          }
        },
        "metadata": {
          "relations": {
            "member": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            }
          }
        }
      },
      {
        "type": "org",
        "relations": {
          "owner": {
            "this": {}
          },
          "member": {
            "union": {
              "child": [
                {
                  "this": {}
                },
                {
                  "computedUserset": {
                    "object": "",
                    "relation": "owner"
                  }
                }
              ]
            }
          },
          "repo_writer": {
            "this": {}
          },
          "repo_admin": {
            "this": {}
          },
          "repo_reader": {
            "this": {}
          }
        },
        "metadata": {
          "relations": {
            "owner": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            },
            "member": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            },
            "repo_writer": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            },
            "repo_admin": {
              "directly_related_user_types": [
                {
                  "type": "user"
                },
                {
                  "type": "team",
                  "relation": "member"
                }
              ]
            },
            "repo_reader": {
              "directly_related_user_types": [
                {
                  "type": "user"
                }
              ]
            }
          }
        }
      }
    ],
    "schema_version": "1.1"
  }), {
      headers: headers,
  });
  check(res, {
     "write model response code was 201": (r) => r.status === 201,
  })

  const modelId = res.json()["authorization_model_id"]

  const batches = chunk(Array.from(tuples), TUPLES_PER_WRITE);


  let requests = []
  for (let i = 0; i < batches.length; i++) {
    
    requests.push(['POST', `${API_BASE_URI}/stores/${STORE_ID}/write`, JSON.stringify({
      "writes": {
          "tuple_keys": batches[i]
      }
    }), null])
  }

  let responses = http.batch(requests);

  responses.forEach((res) => {
    if (res.status !== 200) {
      console.log(`failed to write tuples: received status '${res.status}'`);
      console.log(`response body: '${res.body}'`)
    }

    check(res, {
      "write response was 200": (r) => r.status === 200,
    });
  });

  return { checks, modelId };
}

export default function (data) {

  let checks = data.checks;
  let tupleKey = checks[random(0, checks.length-1)]
  
  let res = http.post(`${API_BASE_URI}/stores/${STORE_ID}/check`, JSON.stringify({
    "tuple_key": tupleKey
  }), {headers: headers})
  check(res, {
      "check response code was 200": (r) => r.status === 200,
  })

  check(res.json().allowed, {
      "allowed is true": (allowed) => allowed === true,
  })
}

export function teardown() {
}